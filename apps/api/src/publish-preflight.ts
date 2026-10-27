import { isLocalPageTarget } from './page-target.js';
import type { VerifiedResource, PreflightChecklist, PreflightCheckItem } from '@wp-agent/contracts';

export interface PreflightCheckContext {
  targetSite: string;
  post: VerifiedResource;
}

export function evaluatePublishPreflight(context: PreflightCheckContext): PreflightChecklist {
  const { targetSite, post } = context;
  const items: PreflightCheckItem[] = [];

  // Check 1: Target environment authorization (blocking)
  const isLocal = isLocalPageTarget(targetSite);
  items.push({
    id: 'target_environment',
    label: 'Authorized Target Environment',
    description: 'Target WordPress host must be an isolated local test environment (*.local, localhost, or loopback).',
    severity: 'blocking',
    passed: isLocal,
    details: isLocal
      ? `Verified safe target: ${targetSite}`
      : `Forbidden target: "${targetSite}" is not an authorized local test environment. Production/remote publish is strictly blocked.`,
  });

  // Check 2: Post status transition validity (blocking)
  const isDraftOrPending = post.status === 'draft' || post.status === 'pending';
  const isAlreadyPublished = post.status === 'publish';
  items.push({
    id: 'post_status',
    label: 'Post Status Staging',
    description: 'Post must currently be in draft or pending status prior to live publication.',
    severity: 'blocking',
    passed: isDraftOrPending,
    details: isDraftOrPending
      ? `Current status: "${post.status}" (ready to publish)`
      : isAlreadyPublished
      ? `Post #${post.id} is already published live.`
      : `Cannot publish from status "${post.status}".`,
  });

  // Check 3: Content validity & presence (blocking)
  const hasContent = typeof post.content === 'string' && post.content.trim().length > 0;
  items.push({
    id: 'content_integrity',
    label: 'Post Content Integrity',
    description: 'Post content must not be empty or blank.',
    severity: 'blocking',
    passed: hasContent,
    details: hasContent
      ? `Content verified (${post.content.trim().length} characters)`
      : 'Post content is empty or contains only whitespace.',
  });

  // Check 4: Title presence & readability (blocking)
  const hasTitle = typeof post.title === 'string' && post.title.trim().length > 0;
  items.push({
    id: 'title_presence',
    label: 'Post Title Requirement',
    description: 'Post must have a clear title defined.',
    severity: 'blocking',
    passed: hasTitle,
    details: hasTitle
      ? `Title verified: "${post.title.trim()}"`
      : 'Post title is missing or empty.',
  });

  // Check 5: Excerpt / SEO summary (advisory warning)
  const hasExcerpt = typeof post.excerpt === 'string' && post.excerpt.trim().length > 0;
  items.push({
    id: 'seo_excerpt',
    label: 'SEO Summary & Excerpt',
    description: 'An excerpt or meta summary helps search engines and social shares.',
    severity: 'warning',
    passed: hasExcerpt,
    details: hasExcerpt
      ? 'Excerpt is populated for search previews.'
      : 'No excerpt or summary provided. WordPress will generate an automatic excerpt.',
  });

  // Check 6: URL slug readability (advisory warning)
  const hasSlug = typeof post.slug === 'string' && post.slug.trim().length > 0 && !/^auto-draft(-\d+)?$/.test(post.slug);
  items.push({
    id: 'url_slug',
    label: 'Permalink Slug Formatting',
    description: 'A clean, descriptive permalink slug ensures readable URLs.',
    severity: 'warning',
    passed: hasSlug,
    details: hasSlug
      ? `Clean slug: /${post.slug}/`
      : 'Slug is using default/auto-generated structure. Consider assigning a descriptive slug.',
  });

  const hasBlockingFailures = items.some((item) => item.severity === 'blocking' && !item.passed);
  const warningCount = items.filter((item) => item.severity === 'warning' && !item.passed).length;

  return {
    passed: !hasBlockingFailures,
    hasBlockingFailures,
    warningCount,
    items,
  };
}
