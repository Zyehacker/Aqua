export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function parseLoader(versionId: string): string {
  if (versionId.includes("fabric")) return "Fabric";
  if (versionId.includes("forge")) return "Forge";
  return "Vanilla";
}

export function baseMcVersion(versionId: string): string {
  const fabric = versionId.match(/fabric-loader-[\d.]+-(.+)$/i);
  if (fabric) return fabric[1];
  return versionId;
}
