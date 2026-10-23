import {
  ToolActivity,
  InspectedSiteData,
  InspectedPageData,
  DraftProposal,
  AppliedDraftPost,
  BuilderProposal,
  AgentMode,
  IntentDetectionResult,
  AgentExecutionTask,
  VerifiedResource,
  TaskActivityEvent,
  PublishProposalResponse,
  PublishApprovalResponse,
  ReviseDraftResponse,
} from './types';
import {
  SitePlan,
  BuilderCapabilities,
  BuilderType,
  PublishApprovalRequest,
  ReviseDraftRequest,
} from '@wp-agent/contracts';

export interface AgentApiResponse {
  status: 'success' | 'denied' | 'error';
  correlationId?: string;
  content: string;
  executedTools?: ToolActivity[];
  error?: string;
  message?: string;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return false;
    const data = await res.json();
    return data.apiServer === 'connected';
  } catch {
    return false;
  }
}

export async function sendAgentMessage(
  prompt: string,
  targetSite?: string,
  controlledWrites?: boolean,
  signal?: AbortSignal
): Promise<AgentApiResponse> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      targetSite,
      controlledWrites: Boolean(controlledWrites),
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP error ${res.status}`);
  }

  return data;
}

export async function detectPromptIntent(
  prompt: string,
  currentMode: AgentMode,
  targetSite?: string
): Promise<IntentDetectionResult> {
  const res = await fetch('/api/agent/intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      currentMode,
      targetSite,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Intent check failed (${res.status})`);
  }
  return data;
}

export async function planTask(
  prompt: string,
  targetSite: string,
  mode: AgentMode
): Promise<{ status: string; task: AgentExecutionTask }> {
  const res = await fetch('/api/task/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      targetSite,
      mode,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Task plan failed (${res.status})`);
  }
  return data;
}

export async function proposeDraftPost(
  prompt: string,
  targetSite: string,
  title?: string,
  content?: string
): Promise<DraftProposal> {
  const res = await fetch('/api/mutate/propose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      targetSite,
      title,
      content,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Proposal failed (${res.status})`);
  }
  return data;
}

export async function applyDraftPost(params: {
  planId: string;
  integrityHash: string;
  targetSite: string;
  post: { title: string; content: string; excerpt?: string };
  approvedBy?: string;
}): Promise<AppliedDraftPost> {
  const res = await fetch('/api/mutate/apply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Approval failed (${res.status})`);
  }
  return data.post;
}

export async function sendPureChatMessage(prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP error ${res.status}`);
  }

  return data.content || '';
}

export async function generateSitePlan(
  prompt: string,
  siteTitle?: string
): Promise<SitePlan> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      siteTitle,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || `Failed to generate plan (${res.status})`);
  }

  return data.plan;
}

export async function reviseSitePlan(
  existingPlan: SitePlan,
  revisionPrompt: string
): Promise<SitePlan> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      existingPlan,
      revisionPrompt,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || `Failed to revise plan (${res.status})`);
  }

  return data.plan;
}

/**
 * Parses any tool results to extract live inspected WordPress site or page data for the preview canvas.
 */
export function extractPreviewData(
  executedTools?: ToolActivity[]
): { site?: InspectedSiteData; page?: InspectedPageData } {
  if (!executedTools || executedTools.length === 0) {
    return {};
  }

  let site: InspectedSiteData | undefined;
  let page: InspectedPageData | undefined;

  for (const tool of executedTools) {
    if (tool.name === 'site.inspect' && !tool.error && tool.output) {
      site = tool.output as InspectedSiteData;
    }
    if (tool.name === 'page.read' && !tool.error && tool.output) {
      page = tool.output as InspectedPageData;
    }
  }

  return { site, page };
}

export async function detectBuilderCapabilities(targetSite: string): Promise<BuilderCapabilities> {
  const res = await fetch('/api/builder/detect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetSite }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Builder detection failed (${res.status})`);
  }
  return data.capabilities;
}

export async function proposeBuilderContent(params: {
  targetSite: string;
  builderType: BuilderType;
  prompt: string;
  title?: string;
  pageIdOrSlug?: string;
  section?: unknown;
  acfData?: Record<string, unknown>;
  wooProductData?: Record<string, unknown>;
}): Promise<BuilderProposal> {
  const res = await fetch('/api/builder/propose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Builder proposal failed (${res.status})`);
  }
  return data;
}

export async function fetchPost(targetSite: string, postId: number): Promise<VerifiedResource> {
  const res = await fetch('/api/post/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetSite, postId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Failed to fetch post #${postId} (${res.status})`);
  }
  return data.post;
}

export async function proposePublish(
  targetSite: string,
  postId: number
): Promise<PublishProposalResponse> {
  const res = await fetch('/api/publish/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetSite, postId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Publish proposal failed (${res.status})`);
  }
  return data;
}

export async function applyPublish(
  params: PublishApprovalRequest
): Promise<PublishApprovalResponse> {
  const res = await fetch('/api/publish/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Publish approval failed (${res.status})`);
  }
  return data;
}

export async function reviseDraft(params: ReviseDraftRequest): Promise<ReviseDraftResponse> {
  const res = await fetch('/api/draft/revise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Draft revision failed (${res.status})`);
  }
  return data;
}

export function connectTaskActivityStream(
  taskId: string,
  onEvent: (event: TaskActivityEvent) => void,
  onError?: (err: Event) => void
): () => void {
  if (typeof window === 'undefined' || !window.EventSource) {
    return () => {};
  }

  const es = new EventSource(`/api/task/stream?taskId=${encodeURIComponent(taskId)}`);

  es.addEventListener('activity', (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data) as TaskActivityEvent;
      onEvent(parsed);
    } catch {
      // Ignore parse errors on comments/pings
    }
  });

  if (onError) {
    es.onerror = (err) => {
      onError(err);
    };
  }

  return () => {
    es.close();
  };
}

// --- Site Management API Clients ---

export interface SiteSettingsDiff {
  key: string;
  before: string | null;
  after: string;
}

export interface SiteSettingsProposalResult {
  status: 'proposed';
  planId: string;
  integrityHash: string;
  targetSite: string;
  settingsDiff: SiteSettingsDiff[];
  summary: string;
  createdAt: string;
}

export interface SiteSettingsApplyResult {
  status: 'applied';
  planId: string;
  targetSite: string;
  updated: string[];
  verified: boolean;
}

export interface PluginProposalResult {
  status: 'proposed';
  planId: string;
  integrityHash: string;
  targetSite: string;
  action: string;
  pluginSlug: string;
  cliCommand: string;
  summary: string;
  createdAt: string;
}

export interface PluginApplyResult {
  status: 'applied';
  planId: string;
  targetSite: string;
  action: string;
  pluginSlug: string;
  resultMessage: string;
  verified: boolean;
}

export interface PluginListResult {
  plugins: Array<{ name: string; status: string; version: string; update?: string }>;
  count: number;
  verified: boolean;
}

export interface CodeInjectionProposalResult {
  status: 'proposed';
  planId: string;
  integrityHash: string;
  targetSite: string;
  location: 'header' | 'footer' | 'css';
  codeSnippet: string;
  summary: string;
  createdAt: string;
}

export async function proposeSiteSettings(params: {
  targetSite: string;
  settings: Record<string, string>;
  reason?: string;
}): Promise<SiteSettingsProposalResult> {
  const res = await fetch('/api/site/settings/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Settings proposal failed (${res.status})`);
  return data;
}

export async function applySiteSettings(params: {
  planId: string;
  integrityHash: string;
  targetSite: string;
  approvedBy?: string;
}): Promise<SiteSettingsApplyResult> {
  const res = await fetch('/api/site/settings/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, approvedBy: params.approvedBy || 'user' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Settings apply failed (${res.status})`);
  return data;
}

export async function proposePluginOperation(params: {
  targetSite: string;
  action: 'install' | 'activate' | 'deactivate' | 'delete' | 'list';
  pluginSlug: string;
  activateOnInstall?: boolean;
}): Promise<PluginProposalResult> {
  const res = await fetch('/api/site/plugins/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, activateOnInstall: params.activateOnInstall ?? true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Plugin proposal failed (${res.status})`);
  return data;
}

export async function applyPluginOperation(params: {
  planId: string;
  integrityHash: string;
  targetSite: string;
}): Promise<PluginApplyResult> {
  const res = await fetch('/api/site/plugins/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, approvedBy: 'user' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Plugin apply failed (${res.status})`);
  return data;
}

export async function listInstalledPlugins(targetSite: string): Promise<PluginListResult> {
  const res = await fetch(`/api/site/plugins/list?targetSite=${encodeURIComponent(targetSite)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Plugin list failed (${res.status})`);
  return data;
}

export async function proposeCodeInjection(params: {
  targetSite: string;
  location: 'header' | 'footer' | 'css';
  code: string;
  label?: string;
}): Promise<CodeInjectionProposalResult> {
  const res = await fetch('/api/site/code/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Code injection proposal failed (${res.status})`);
  return data;
}

export async function applyCodeInjection(params: {
  planId: string;
  integrityHash: string;
  targetSite: string;
}): Promise<{ status: string; location: string; verified: boolean }> {
  const res = await fetch('/api/site/code/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, approvedBy: 'user' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Code injection apply failed (${res.status})`);
  return data;
}
