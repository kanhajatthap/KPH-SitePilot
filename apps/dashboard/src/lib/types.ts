import {
  SitePlan,
  BuilderCapabilities,
  BuilderType,
  AgentExecutionTask,
  TaskStep,
  TaskStatus,
  QueuedTask,
  IntentDetectionResult,
  MissingPrerequisite,
  VerifiedResource,
  TaskActivityEvent,
  PublishProposalResponse,
  PublishApprovalResponse,
  ReviseDraftResponse,
} from '@wp-agent/contracts';

export type {
  AgentExecutionTask,
  TaskStep,
  TaskStatus,
  QueuedTask,
  IntentDetectionResult,
  MissingPrerequisite,
  VerifiedResource,
  TaskActivityEvent,
  PublishProposalResponse,
  PublishApprovalResponse,
  ReviseDraftResponse,
};

export type ViewportMode = 'desktop' | 'tablet' | 'mobile';
export type AgentMode = 'agent' | 'writes' | 'chat';

export interface ToolActivity {
  id: string;
  name: string;
  status: 'invoking' | 'success' | 'denied' | 'error';
  isReadOnly: boolean;
  arguments?: Record<string, unknown>;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface DraftProposal {
  planId: string;
  integrityHash: string;
  targetSite: string;
  post: {
    title: string;
    content: string;
    excerpt?: string;
    status: 'draft';
  };
  duplicateWarning?: string;
  summary: string;
  createdAt: string;
  isApplied?: boolean;
}

export interface BuilderProposal {
  status: 'proposed';
  planId: string;
  integrityHash: string;
  targetSite: string;
  builderType: BuilderType;
  title: string;
  diff: {
    before: unknown | null;
    after: unknown;
  };
  renderedPreviewHtml: string;
  unsupportedFeatures: string[];
  summary: string;
  createdAt: string;
  isApplied?: boolean;
  /** Discriminates what the Approve button should actually DO */
  operationType?: 'content' | 'plugin' | 'settings' | 'code' | 'page' | 'section' | 'page_update' | 'page_trash' | 'page_restore';
  /** For plugin ops only */
  pluginAction?: 'install' | 'activate' | 'deactivate' | 'delete';
  pluginSlug?: string;
  /** For code injection only */
  codeLocation?: 'header' | 'footer' | 'css';
  /** For page creation only */
  pageDetails?: {
    isFrontPage?: boolean;
    slug?: string;
    postStatus?: 'draft' | 'publish';
  };
  /** For section edit only */
  sectionDetails?: {
    pageId: number;
    sectionId: string;
    sectionName: string;
  };
  pageRestoreDetails?: {
    pageId: number;
    snapshotId: string;
  };
}

export interface PageSectionSummary {
  id: string;
  name: string;
  blockName: string;
  excerpt: string;
}

export interface AppliedDraftPost {
  id: number;
  slug: string;
  title: string;
  status: 'draft' | 'publish';
  editLink: string;
  verified: boolean;
  duplicateWarning?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  status?: 'sending' | 'success' | 'denied' | 'error';
  targetSite?: string;
  executedTools?: ToolActivity[];
  error?: string;
  proposal?: DraftProposal;
  builderProposal?: BuilderProposal;
  appliedPost?: AppliedDraftPost;
  verifiedResource?: VerifiedResource;
  publishProposal?: PublishProposalResponse;
  showCompletionCard?: boolean;
}

export interface InspectedSiteData {
  siteName: string;
  siteUrl: string;
  wpVersion: string;
  activeTheme?: string;
  status: string;
  plugins?: string[];
  capabilities?: BuilderCapabilities;
}

export interface InspectedPageData {
  id: number;
  slug: string;
  title: string;
  status: string;
  excerpt?: string;
  content?: string;
}

export interface SitePageSummary {
  id: number;
  title: string;
  slug: string;
  status: string;
  url: string;
}

export interface PreviewState {
  targetSite: string;
  viewport: ViewportMode;
  isLoading: boolean;
  activeView:
    | 'welcome'
    | 'site'
    | 'page'
    | 'plan'
    | 'proposal'
    | 'applied'
    | 'builder'
    | 'verified_post'
    | 'error';
  siteData?: InspectedSiteData;
  pageData?: InspectedPageData;
  plan?: SitePlan;
  selectedPlanPageSlug?: string;
  proposal?: DraftProposal;
  builderProposal?: BuilderProposal;
  appliedPost?: AppliedDraftPost;
  verifiedResource?: VerifiedResource;
  isProposedContent?: boolean;
  capabilities?: BuilderCapabilities;
  errorMessage?: string;
  lastUpdated?: string;
}

export interface AvailableSite {
  id: string;
  name: string;
  url: string;
  description: string;
  isDefault?: boolean;
}
