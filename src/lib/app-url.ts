/** Public base URL used in emailed links and provider callbacks. Fails loudly in production rather than emailing localhost links. */
export function appUrl(): string {
  const url = process.env.APP_URL?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!url) throw new Error("APP_URL must be set in production");
    if (!url.startsWith("https://")) throw new Error("APP_URL must be an https:// URL in production");
  }
  return (url || "http://localhost:3000").replace(/\/$/, "");
}
