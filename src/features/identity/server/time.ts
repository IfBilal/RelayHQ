/** The UTC instant at which "today" began in the given IANA time zone. */
export function startOfLocalDay(timeZone: string, now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const guess = Date.parse(`${ymd}T00:00:00Z`);
  const local = new Date(new Date(guess).toLocaleString("en-US", { timeZone }));
  const offset = local.getTime() - new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess - offset);
}
