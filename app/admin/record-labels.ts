// Small helpers shared by the data modules that read Supabase rows with nested
// relationships. PostgREST returns a to-one relationship as an object and a
// to-many relationship as an array, so callers use these to read either shape.

export type DataRow = Record<string, unknown>;

export function rowValue(value: unknown): DataRow | null {
  if (Array.isArray(value)) {
    return (value[0] as DataRow | undefined) ?? null;
  }
  return (value as DataRow | null) ?? null;
}

export function rowList(value: unknown): DataRow[] {
  return Array.isArray(value) ? (value as DataRow[]) : [];
}

export function rowNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rowText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Clients are stored with a denormalised full_name, with first_name/last_name as
 * the fallback for records created before that column existed.
 */
export function clientLabel(client: DataRow | null, fallback = "Unknown client"): string {
  if (!client) return fallback;

  const fullName = rowText(client.full_name).trim();
  if (fullName) return fullName;

  const composed = `${rowText(client.first_name)} ${rowText(client.last_name)}`.trim();
  if (composed) return composed;

  const clientNumber = rowText(client.client_number).trim();
  return clientNumber || fallback;
}

export function clientInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
