export const ALLOWED_VERSIONS = [
  "1.8.9",
  "1.21.1",
  "1.21.2",
  "1.21.3",
  "1.21.4",
  "1.21.5",
  "1.21.6",
  "1.21.7",
  "1.21.8",
  "1.21.9",
  "1.21.10",
  "1.21.11",
] as const;

export function isAllowedVersion(id: string): boolean {
  if ((ALLOWED_VERSIONS as readonly string[]).includes(id)) return true;
  const match = id.match(/^1\.21\.(\d+)$/);
  if (!match) return false;
  return parseInt(match[1], 10) > 11;
}

export function filterAllowedVersions(versions: string[]): string[] {
  return versions.filter(isAllowedVersion).sort(compareVersions);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return 0;
}

export function selectableVersions(): string[] {
  return [...ALLOWED_VERSIONS];
}

export const LEGACY_VERSIONS = ["1.8.9"] as const;

export function modernVersions(): string[] {
  return selectableVersions().filter((v) => v !== "1.8.9");
}

export function versionGroupLabel(version: string): "Legacy" | "Modern" {
  return version === "1.8.9" ? "Legacy" : "Modern";
}
