/** Post-login redirect target: same-origin relative paths only, checked on the input and on the normalised result. */
export function safeNext(next: string | undefined, origin: string, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return fallback;
    const path = url.pathname + url.search + url.hash;
    return path.startsWith("//") ? fallback : path; // "/.//evil.com" normalises to "//evil.com"
  } catch {
    return fallback;
  }
}
