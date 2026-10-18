const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** CSRF defence for cookie-authenticated routes: true when a browser says the request came from another site. */
export function isCrossSiteMutation(method: string, headers: Headers): boolean {
  if (!MUTATING.has(method.toUpperCase())) return false;
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite !== "same-origin" && fetchSite !== "none";
  const origin = headers.get("origin");
  if (!origin) return false; // non-browser client: no ambient cookies to abuse
  try {
    return new URL(origin).host !== headers.get("host");
  } catch {
    return true;
  }
}
