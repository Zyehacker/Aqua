const STORAGE_KEY = "aqua-mod-icons-v1";

type IconMap = Record<string, string>;

function readMap(): IconMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as IconMap;
  } catch {
    return {};
  }
}

function writeMap(map: IconMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getModIcon(filename: string): string | null {
  const map = readMap();
  return map[filename.toLowerCase()] ?? null;
}

export function setModIcon(filename: string, iconUrl: string): void {
  const map = readMap();
  map[filename.toLowerCase()] = iconUrl;
  writeMap(map);
}

export function setModIconFromProject(
  projectId: string,
  iconUrl: string | null,
  installedFilename: string
): void {
  if (!iconUrl) return;
  setModIcon(installedFilename, iconUrl);
  const map = readMap();
  map[`project:${projectId}`] = iconUrl;
  writeMap(map);
}

export function loadModIconMap(): IconMap {
  return readMap();
}
