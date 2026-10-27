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
  SitePageSummary,
} from './types';
import {
  SitePlan,
  BuilderCapabilities,
  BuilderType,
  PublishApprovalRequest,
  ReviseDraftRequest,
  PageDesign,
  ChatHistory,
  ChatHistorySchema,
  PageSnapshotSummary,
  PageSnapshotComparison,
  PageSnapshotRestoreProposal,
  PageSnapshotRestoreApplyResponse,
} from '@wp-agent/contracts';

export interface AgentApiResponse {
  status: 'success' | 'denied' | 'error';
  correlationId?: string;
  content: string;
  executedTools?: ToolActivity[];
  error?: string;
  message?: string;
}

export interface ConversationHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function fetchChatHistory(): Promise<ChatHistory> {
  const res = await fetch('/api/chat/history', { cache: 'no-store' });
  const data = await readJsonResponse<unknown>(res);
  if (!res.ok) {
    const error = data as { message?: string; error?: string };
    throw new Error(error.message || error.error || `Chat history load failed (${res.status})`);
  }
  return ChatHistorySchema.parse(data);
}

export async function saveChatHistory(history: ChatHistory): Promise<void> {
  const validated = ChatHistorySchema.parse(history);
  const res = await fetch('/api/chat/history', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validated),
  });
  const data = await readJsonResponse<{ message?: string; error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message || data.error || `Chat history save failed (${res.status})`);
  }
}

/**
 * Reads a JSON API response without assuming the body is JSON.
 *
 * A missing Next.js route returns an HTML 404. Calling `res.json()` on that
 * body produces the unhelpful "Unexpected token '<'" error, which hides the
 * real status and URL. This helper keeps the failure actionable.
 */
export async function readJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const contentType = res.headers.get('content-type') || 'unknown content type';

  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    const endpoint = res.url || 'the API';
    throw new Error(
      `Expected JSON from ${endpoint} but received ${contentType} (HTTP ${res.status}). ` +
        'The API route may be missing or the upstream service returned an HTML error page.'
    );
  }
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
  signal?: AbortSignal,
  conversationHistory?: ConversationHistoryItem[]
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
      conversationHistory,
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

export async function sendPureChatMessage(
  prompt: string,
  signal?: AbortSignal,
  conversationHistory?: ConversationHistoryItem[]
): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      conversationHistory,
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
  let capabilities: BuilderCapabilities | undefined;

  for (const tool of executedTools) {
    if (tool.name === 'site.inspect' && !tool.error && tool.output) {
      site = tool.output as InspectedSiteData;
    }
    if (tool.name === 'builder.detect' && !tool.error && tool.output) {
      capabilities = tool.output as BuilderCapabilities;
    }
    if (tool.name === 'page.read' && !tool.error && tool.output) {
      page = tool.output as InspectedPageData;
    }
  }

  if (site && capabilities) {
    site = { ...site, capabilities };
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

export interface PageDesignGenerationResult {
  status: 'generated';
  pageId: number;
  title: string;
  slug: string;
  design: PageDesign;
  gutenbergBlocksHtml: string;
  previewHtml: string;
  summary: string;
}

export async function generatePageDesign(params: {
  targetSite: string;
  pageId: number;
  instruction: string;
}): Promise<PageDesignGenerationResult> {
  const res = await fetch('/api/site/pages/lifecycle/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `Page design generation failed (${res.status})`);
  }
  return data;
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

export interface PageProposalResult {
  status: 'proposed';
  planId: string;
  integrityHash: string;
  targetSite: string;
  page: {
    title: string;
    content: string;
    slug?: string;
    status: 'draft' | 'publish';
    isFrontPage: boolean;
    builder: 'gutenberg' | 'elementor';
  };
  renderedPreviewHtml: string;
  summary: string;
  createdAt: string;
}

export interface PageApplyResult {
  status: 'applied';
  planId: string;
  targetSite: string;
  pageId: number;
  pageUrl: string;
  editUrl: string;
  title: string;
  postStatus: string;
  isFrontPage: boolean;
  verified: boolean;
  source?: 'created' | 'existing' | 'recovered';
}

export interface PageLifecycleProposalResult {
  status: 'proposed';
  planId: string;
  integrityHash: string;
  targetSite: string;
  action: 'update' | 'trash';
  pageId: number;
  title: string;
  slug: string;
  pageStatus: string;
  before: string;
  after: string;
  pageUrl: string;
  summary: string;
  createdAt: string;
}

export interface PageLifecycleApplyResult {
  status: 'applied';
  planId: string;
  targetSite: string;
  action: 'update' | 'trash';
  pageId: number;
  title: string;
  slug: string;
  pageStatus: string;
  pageUrl: string;
  verified: boolean;
}

export async function proposePageLifecycle(params: {
  targetSite: string;
  action: 'update' | 'trash';
  pageId: number;
  title?: string;
  content?: string;
}): Promise<PageLifecycleProposalResult> {
  const res = await fetch('/api/site/pages/lifecycle/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await readJsonResponse<PageLifecycleProposalResult & { message?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Page proposal failed (${res.status})`);
  return data;
}

export async function applyPageLifecycle(params: {
  planId: string;
  integrityHash: string;
  targetSite: string;
  approvedBy?: string;
}): Promise<PageLifecycleApplyResult> {
  const res = await fetch('/api/site/pages/lifecycle/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, approvedBy: params.approvedBy || 'user' }),
  });
  const data = await readJsonResponse<PageLifecycleApplyResult & { message?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Page change failed (${res.status})`);
  return data;
}

export async function proposePageCreation(params: {
  targetSite: string;
  title: string;
  content: string;
  slug?: string;
  status?: 'draft' | 'publish';
  isFrontPage?: boolean;
  builder?: 'gutenberg' | 'elementor';
}): Promise<PageProposalResult> {
  const res = await fetch('/api/site/pages/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await readJsonResponse<PageProposalResult & { message?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Page proposal failed (${res.status})`);
  return data;
}

export async function applyPageCreation(params: {
  planId: string;
  integrityHash: string;
  targetSite: string;
  approvedBy?: string;
}): Promise<PageApplyResult> {
  const res = await fetch('/api/site/pages/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, approvedBy: params.approvedBy || 'user' }),
  });
  const data = await readJsonResponse<PageApplyResult & { message?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Page creation apply failed (${res.status})`);
  return data;
}

export interface PageSectionsResult {
  pageId: number;
  title: string;
  status: string;
  url: string;
  sections: Array<{
    id: string;
    name: string;
    blockName: string;
    excerpt: string;
  }>;
}

export async function fetchPageSections(
  pageId: number = 32,
  targetSite?: string
): Promise<PageSectionsResult> {
  const query = new URLSearchParams({ id: String(pageId) });
  if (targetSite) {
    query.set('targetSite', targetSite);
  }
  const res = await fetch(`/api/site/pages/sections?${query.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Failed to fetch page sections (${res.status})`);
  return data;
}

export async function listSitePages(targetSite: string): Promise<{
  pages: SitePageSummary[];
  count: number;
  verified: boolean;
}> {
  const res = await fetch(`/api/site/pages/list?targetSite=${encodeURIComponent(targetSite)}`);
  const data = await readJsonResponse<{
    pages: SitePageSummary[];
    count: number;
    verified: boolean;
    message?: string;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Failed to list site pages (${res.status})`);
  return data;
}

export async function listPageSnapshots(
  targetSite: string,
  pageId: number
): Promise<PageSnapshotSummary[]> {
  const query = new URLSearchParams({ targetSite, pageId: String(pageId) });
  const res = await fetch(`/api/site/pages/snapshots?${query}`);
  const data = await readJsonResponse<{ snapshots: PageSnapshotSummary[]; message?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Failed to fetch page history (${res.status})`);
  return data.snapshots;
}

export async function comparePageSnapshot(params: {
  targetSite: string;
  pageId: number;
  snapshotId: string;
}): Promise<PageSnapshotComparison> {
  const res = await fetch('/api/site/pages/snapshots/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await readJsonResponse<PageSnapshotComparison & { message?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Page comparison failed (${res.status})`);
  return data;
}

export async function proposePageSnapshotRestore(params: {
  targetSite: string;
  pageId: number;
  snapshotId: string;
}): Promise<PageSnapshotRestoreProposal> {
  const res = await fetch('/api/site/pages/restore/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await readJsonResponse<PageSnapshotRestoreProposal & { message?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Page restore proposal failed (${res.status})`);
  return data;
}

export async function applyPageSnapshotRestore(params: {
  planId: string;
  integrityHash: string;
  targetSite: string;
  pageId: number;
  approvedBy?: string;
}): Promise<PageSnapshotRestoreApplyResponse> {
  const res = await fetch('/api/site/pages/restore/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, approvedBy: params.approvedBy || 'user' }),
  });
  const data = await readJsonResponse<PageSnapshotRestoreApplyResponse & { message?: string; error?: string }>(res);
  if (!res.ok) throw new Error(data.message || data.error || `Page restore failed (${res.status})`);
  return data;
}

export interface SectionEditProposalResult {
  status: 'proposed';
  planId: string;
  integrityHash: string;
  targetSite: string;
  pageId: number;
  sectionId: string;
  sectionName: string;
  diff: {
    before: string;
    after: string;
  };
  updatedFullContent: string;
  renderedPreviewHtml: string;
  unsupportedOperations: string[];
  summary: string;
  createdAt: string;
}

export async function proposeSectionEdit(params: {
  targetSite: string;
  pageId: number;
  sectionId: string;
  instruction: string;
}): Promise<SectionEditProposalResult> {
  const res = await fetch('/api/site/pages/section/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Section proposal failed (${res.status})`);
  return data;
}

export interface SectionEditApplyResult {
  status: 'applied';
  planId: string;
  targetSite: string;
  pageId: number;
  pageUrl: string;
  sectionId: string;
  verified: boolean;
  postModified: string;
}

export async function applySectionEdit(params: {
  planId: string;
  integrityHash: string;
  pageId: number;
  targetSite: string;
  approvedBy?: string;
}): Promise<SectionEditApplyResult> {
  const res = await fetch('/api/site/pages/section/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, approvedBy: params.approvedBy || 'user' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Section apply failed (${res.status})`);
  return data;
}
