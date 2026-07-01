// Locale + timezone aware formatting. Everything renders in the *user's* locale
// and timezone; money is EUR. Timestamps are stored UTC-ISO.

const locale = typeof navigator !== "undefined" ? navigator.language : "en-IE";

const eur = new Intl.NumberFormat(locale, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eur2 = new Intl.NumberFormat(locale, {
  style: "currency",
  currency: "EUR",
});

const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
const numFmt = new Intl.NumberFormat(locale);

/** €1,234 — whole euros unless cents are present. */
export function money(n: number): string {
  return Number.isInteger(n) ? eur.format(n) : eur2.format(n);
}

/** Signed money, e.g. "+€80" / "−€20" (Intl handles the locale minus sign). */
export function signedMoney(n: number): string {
  const s = money(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export function chips(n: number): string {
  return numFmt.format(n);
}

export function date(iso: string | null): string {
  if (!iso) return "—";
  // Treat a bare ISO date as local calendar day (avoid TZ off-by-one).
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date(iso);
  return isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function year(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})/.exec(iso);
  return m ? Number(m[1]) : null;
}
