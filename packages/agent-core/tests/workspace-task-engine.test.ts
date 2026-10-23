import { describe, it, expect, vi } from 'vitest';
import { IntentDetector } from '../src/intent-detector.js';
import { TaskEngine } from '../src/task-engine.js';
import { MockModelAdapter } from '@wp-agent/model-adapters';
import { WordPressClient } from '@wp-agent/wp-client';
import { AuditLogger } from '@wp-agent/audit';

describe('Intelligent Intent Detection & Task Engine', () => {
  describe('IntentDetector', () => {
    const detector = new IntentDetector();

    it('detects content mutation and recommends switching from chat to writes', () => {
      const result = detector.detect(
        'Create a WordPress post titled "How to Make a Website Using AI"',
        'chat'
      );
      expect(result.category).toBe('content_mutation');
      expect(result.recommendedMode).toBe('writes');
      expect(result.requiresModeSwitch).toBe(true);
      expect(result.suggestedActionPill?.targetMode).toBe('writes');
    });

    it('detects content mutation and recommends switching from read-only agent to writes', () => {
      const result = detector.detect(
        'Draft a new post for my tech blog',
        'agent'
      );
      expect(result.category).toBe('content_mutation');
      expect(result.recommendedMode).toBe('writes');
      expect(result.requiresModeSwitch).toBe(true);
      expect(result.suggestedActionPill?.label).toBe('Switch to Controlled Writes');
    });

    it('recommends staying in writes when already in writes mode for post creation', () => {
      const result = detector.detect(
        'Create a WordPress post titled "AI in 2026"',
        'writes'
      );
      expect(result.category).toBe('content_mutation');
      expect(result.recommendedMode).toBe('writes');
      expect(result.requiresModeSwitch).toBe(false);
    });

    it('detects builder structure requests (Elementor / Gutenberg)', () => {
      const elementorResult = detector.detect(
        'Create an Elementor hero section structure for "Digital Agency"',
        'chat'
      );
      expect(elementorResult.category).toBe('builder_structure');
      expect(elementorResult.recommendedMode).toBe('writes');
      expect(elementorResult.requiresModeSwitch).toBe(true);

      const gutenbergResult = detector.detect(
        'Generate Gutenberg blocks for AI Architecture',
        'writes'
      );
      expect(gutenbergResult.category).toBe('builder_structure');
      expect(gutenbergResult.requiresModeSwitch).toBe(false);
    });

    it('detects site inspection requests and recommends switching from chat to agent', () => {
      const result = detector.detect('Inspect site health and wp version', 'chat');
      expect(result.category).toBe('site_inspection');
      expect(result.recommendedMode).toBe('agent');
      expect(result.requiresModeSwitch).toBe(true);
      expect(result.suggestedActionPill?.targetMode).toBe('agent');
    });

    it('flags arbitrary code execution or shell commands as unsupported', () => {
      const result = detector.detect('shell_exec("whoami")', 'agent');
      expect(result.category).toBe('unsupported_request');
      expect(result.requiresModeSwitch).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('identifies general conversational input as informational_chat without mode switch', () => {
      const result = detector.detect('What are WordPress block themes?', 'chat');
      expect(result.category).toBe('informational_chat');
      expect(result.requiresModeSwitch).toBe(false);
    });

    it('identifies high-level educational questions as informational_chat without post mutation', () => {
      const result = detector.detect('Explain how WordPress plugins work.', 'agent');
      expect(result.category).toBe('informational_chat');
      expect(result.requiresModeSwitch).toBe(false);
    });

    it('rejects destructive bulk operations such as deleting all plugins', () => {
      const result = detector.detect('Delete all plugins.', 'writes');
      expect(result.category).toBe('unsupported_request');
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
      expect(result.reason).toContain('Destructive bulk operations');
    });

    it('correctly routes Secure Custom Fields plugin install without falling back to post creation', () => {
      const result = detector.detect('Install the Secure Custom Fields plugin from WordPress.org.', 'agent');
      expect(result.category).not.toBe('content_mutation');
      expect(result.category).not.toBe('builder_structure');
    });
  });

  describe('TaskEngine', () => {
    const mockModel = new MockModelAdapter();
    const mockWpClient = new WordPressClient({
      allowedTargets: ['http://test.local'],
      fetchFn: vi.fn(async (url: string) => {
        if (url.includes('/wp-json/wp/v2/posts')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(
          JSON.stringify({ name: 'Test Site', home: 'http://test.local', version: '6.4' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }),
    });
    const auditLogger = new AuditLogger();

    const engine = new TaskEngine({
      modelAdapter: mockModel,
      wpClient: mockWpClient,
      auditLogger,
    });

    it('creates an execution task in queued state', () => {
      const task = engine.createTask({
        prompt: 'Inspect site status',
        targetSite: 'http://test.local',
        mode: 'agent',
      });

      expect(task.id).toBeDefined();
      expect(task.status).toBe('queued');
      expect(task.steps).toHaveLength(0);
      expect(task.mode).toBe('agent');
    });

    it('plans discrete verifiable steps for agent mode', () => {
      const task = engine.createTask({
        prompt: 'Read page sample-page and summarize',
        targetSite: 'http://test.local',
        mode: 'agent',
      });

      const steps = engine.planSteps(task);
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps[0].name).toBe('Understanding the request');
      expect(steps[1].name).toBe('Inspecting target WordPress site');
      expect(steps.some((s) => s.toolName === 'page.read')).toBe(true);
    });

    it('emits truthful real-time activity events during task execution', async () => {
      const task = engine.createTask({
        prompt: 'Inspect site status',
        targetSite: 'http://test.local',
        mode: 'agent',
      });

      const events: any[] = [];
      await engine.executeTask(task, undefined, {
        onActivityEvent: (evt) => events.push(evt),
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].status).toBe('running');
      expect(events.some((e) => e.stepName === 'Understanding the request')).toBe(true);
      expect(events.some((e) => e.status === 'completed')).toBe(true);
    });

    it('executes a task with step updates', async () => {
      const task = engine.createTask({
        prompt: 'Hello AI',
        targetSite: 'http://test.local',
        mode: 'chat',
      });

      const updates: string[] = [];
      const completed = await engine.executeTask(task, undefined, {
        onUpdate: (t) => updates.push(t.status),
      });

      expect(completed.status).toBe('completed');
      expect(completed.steps).toHaveLength(2);
      expect(completed.steps[0].status).toBe('completed');
      expect(completed.steps[1].status).toBe('completed');
      expect(updates).toContain('running');
      expect(updates).toContain('completed');
    });

    it('aborts execution when AbortSignal is cancelled', async () => {
      const task = engine.createTask({
        prompt: 'Inspect site capabilities',
        targetSite: 'http://test.local',
        mode: 'agent',
      });

      const controller = new AbortController();
      controller.abort(); // Pre-aborted

      const result = await engine.executeTask(task, controller.signal);
      expect(result.status).toBe('cancelled');
    });

    it('transitions to waiting_for_approval during Controlled Writes planning', async () => {
      const task = engine.createTask({
        prompt: 'Create a WordPress post titled "AI Breakthroughs"',
        targetSite: 'http://test.local',
        mode: 'writes',
      });

      const result = await engine.executeTask(task);
      expect(result.status).toBe('waiting_for_approval');
      expect(result.waitingFor?.type).toBe('approval');
    });
  });
});
