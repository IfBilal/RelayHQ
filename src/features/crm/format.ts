export function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export function formatCompactMoney(minor: number, currency: string) {
  const major = minor / 100;
  if (Math.abs(major) >= 1000) return `${new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 1, notation: "compact" }).format(major)}`;
  return formatMoney(minor, currency);
}

/** Absolute time in the workspace zone; relative wording stays in the UI where it is needed. */
export function formatWhen(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
}
