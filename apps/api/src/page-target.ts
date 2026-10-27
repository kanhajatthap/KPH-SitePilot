export function isLocalPageTarget(targetSite: string): boolean {
  let targetUrl: URL;
  try {
    targetUrl = new URL(targetSite);
  } catch {
    return false;
  }
  const hostname = targetUrl.hostname.toLowerCase();
  return (
    ['http:', 'https:'].includes(targetUrl.protocol) &&
    !targetUrl.username &&
    !targetUrl.password &&
    (hostname.endsWith('.local') ||
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname))
  );
}
