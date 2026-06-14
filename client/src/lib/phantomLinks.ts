export function getPhantomBrowseUrl(targetUrl?: string, refUrl?: string) {
  if (typeof window === "undefined" && !targetUrl) return "https://phantom.app/download";

  const href = targetUrl ?? window.location.href;
  const ref = refUrl ?? (typeof window !== "undefined" ? window.location.origin : undefined);
  const encodedHref = encodeURIComponent(href);
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";

  return `https://phantom.app/ul/browse/${encodedHref}${query}`;
}

export function isMobileUserAgent(userAgent?: string) {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /Android|iPhone|iPad|iPod/i.test(ua);
}
