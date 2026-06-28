const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'spm'
]);

export function getCanonicalPageUrl(doc: Document = document): string {
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel~="canonical"]')?.href;
  return canonical || doc.location.href;
}

export function getPageKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    return url.toString();
  } catch {
    return rawUrl.split('#')[0];
  }
}
