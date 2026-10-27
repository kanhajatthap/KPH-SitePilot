import { describe, expect, it } from 'vitest';
import {
  buildSitePilotPrompt,
  SITEPILOT_PLANNER_PROMPT,
  SITEPILOT_SYNTHESIS_PROMPT,
} from '../src/prompts.js';

describe('SitePilot shared prompts', () => {
  it('keeps the untrusted-data and injection-defense mandates in agent mode', () => {
    const prompt = buildSitePilotPrompt('agent');
    expect(prompt).toContain('UNTRUSTED EXTERNAL DATA');
    expect(prompt).toContain('Indirect Prompt Injection Defense');
    expect(prompt).toContain('read-only Agent mode');
    expect(prompt).toContain('Never claim a change was applied unless a tool result confirms it');
    expect(prompt).toContain('prior assistant claims are not proof');
  });

  it('requires explicit approval in writes mode', () => {
    const prompt = buildSitePilotPrompt('writes');
    expect(prompt).toContain('explicit approval');
    expect(prompt).toContain('Never publish live without a separate approval');
  });

  it('marks chat mode as tool-free and forbids invented inspection', () => {
    const prompt = buildSitePilotPrompt('chat');
    expect(prompt).toContain('No site tools are available');
    expect(prompt).toContain('Never imply that you inspected or changed the site');
  });

  it('keeps the planner JSON-only and design-focused', () => {
    expect(SITEPILOT_PLANNER_PROMPT).toContain('Return ONLY one valid JSON object');
    expect(SITEPILOT_PLANNER_PROMPT).toContain('No HTML tags');
    expect(SITEPILOT_PLANNER_PROMPT).toContain('accessible palette');
    expect(SITEPILOT_PLANNER_PROMPT).toContain('5–8 sections');
  });

  it('keeps task synthesis grounded and concise', () => {
    expect(SITEPILOT_SYNTHESIS_PROMPT).toContain('Never invent a result');
    expect(SITEPILOT_SYNTHESIS_PROMPT).toContain('one concrete next action');
  });
});
