/**
 * Global phone number formatting layer for ALL exports (CSV, API, webhook, RVM).
 *
 * Rules:
 *  - Storage stays in E.164 (+17025247096). Never mutate DB values from here.
 *  - Default export format: clean US 10-digit (7025247096) for LeadsRain etc.
 *  - E.164 mode available for Twilio-only workflows.
 *  - Anything that can't be normalized to 10 digits is excluded.
 */

export type ExportPhoneFormat = "us10" | "e164";

/** Strip all non-digits. */
export function stripNonDigits(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).replace(/\D+/g, "");
}

/** Convert any input to clean 10-digit US, or null if impossible. */
export function toUS10(raw: unknown): string | null {
  const d = stripNonDigits(raw);
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

/** Convert any input to E.164 (+1XXXXXXXXXX), or null if impossible. */
export function toE164US(raw: unknown): string | null {
  const ten = toUS10(raw);
  return ten ? `+1${ten}` : null;
}

/** Format for export per chosen mode. Returns null if invalid. */
export function formatPhoneForExport(
  raw: unknown,
  mode: ExportPhoneFormat = "us10",
): string | null {
  return mode === "e164" ? toE164US(raw) : toUS10(raw);
}

export interface PhoneRowLike {
  phone_e164?: string | null;
  phone_number?: string | null;
  office_phone?: string | null;
  phone_valid?: boolean | null;
  phone_line_type?: string | null;
}

export interface ExportSummary {
  total_selected: number;
  exported: number;
  reformatted: number;
  excluded_invalid: number;
  excluded_non_mobile: number;
  duplicates_removed: number;
}

export interface PreparedExportRow<T> {
  row: T;
  phone_number: string; // standardized column
}

export interface PrepareExportOptions {
  mode?: ExportPhoneFormat;
  /** When true (default), drop rows where phone_valid !== true or phone_line_type !== 'mobile'. */
  mobileOnly?: boolean;
}

/**
 * Apply the global export formatting + dedup + validation to a set of rows.
 * Always emits a `phone_number` field as the canonical column.
 */
export function prepareExportRows<T extends PhoneRowLike>(
  rows: T[],
  opts: PrepareExportOptions = {},
): { rows: PreparedExportRow<T>[]; summary: ExportSummary } {
  const mode: ExportPhoneFormat = opts.mode ?? "us10";
  const mobileOnly = opts.mobileOnly ?? true;

  const summary: ExportSummary = {
    total_selected: rows.length,
    exported: 0,
    reformatted: 0,
    excluded_invalid: 0,
    excluded_non_mobile: 0,
    duplicates_removed: 0,
  };

  const seen = new Set<string>();
  const out: PreparedExportRow<T>[] = [];

  for (const r of rows) {
    if (mobileOnly) {
      const lineType = (r.phone_line_type ?? "").toLowerCase();
      if (r.phone_valid !== true || lineType !== "mobile") {
        summary.excluded_non_mobile++;
        continue;
      }
    }
    const original =
      r.phone_e164 ?? r.phone_number ?? r.office_phone ?? "";
    const formatted = formatPhoneForExport(original, mode);
    if (!formatted) {
      summary.excluded_invalid++;
      continue;
    }
    // dedup by 10-digit base regardless of mode
    const dedupKey = toUS10(formatted) ?? formatted;
    if (seen.has(dedupKey)) {
      summary.duplicates_removed++;
      continue;
    }
    seen.add(dedupKey);

    if (String(original).replace(/\s+/g, "") !== formatted) {
      summary.reformatted++;
    }
    out.push({ row: r, phone_number: formatted });
  }

  summary.exported = out.length;
  return { rows: out, summary };
}
