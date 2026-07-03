export interface UserProfile {
  id: string;
  name: string;
  version: string;
  loader: string;
  createdAt: string;
  description?: string;
  favorite?: boolean;
  lastPlayed?: string;
  customRam?: number;
  customJavaPath?: string;
}

const STORAGE_KEY = "aqua-user-profiles-v1";

export function loadUserProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserProfiles(profiles: UserProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* ignore */
  }
}

export function addUserProfile(profile: UserProfile): UserProfile[] {
  const existing = loadUserProfiles();
  if (existing.some((p) => p.id === profile.id)) return existing;
  const next = [...existing, profile];
  saveUserProfiles(next);
  return next;
}

export function removeUserProfile(id: string): UserProfile[] {
  const next = loadUserProfiles().filter((p) => p.id !== id);
  saveUserProfiles(next);
  return next;
}

export function profileFromInstall(id: string, baseVersion: string): UserProfile {
  const loader = id.includes("fabric") ? "Fabric" : "Vanilla";
  return {
    id,
    name: baseVersion,
    version: baseVersion,
    loader,
    createdAt: new Date().toISOString(),
  };
}

export function renameProfile(id: string, newName: string): UserProfile[] {
  const profiles = loadUserProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx < 0) return profiles;
  profiles[idx].name = newName.trim();
  saveUserProfiles(profiles);
  return profiles;
}

export function duplicateProfile(id: string): UserProfile[] {
  const profiles = loadUserProfiles();
  const source = profiles.find((p) => p.id === id);
  if (!source) return profiles;
  const newId = `${source.id}-copy-${Date.now()}`;
  const copy: UserProfile = {
    ...source,
    id: newId,
    name: `${source.name} (Copy)`,
    createdAt: new Date().toISOString(),
  };
  const next = [...profiles, copy];
  saveUserProfiles(next);
  return next;
}

export function toggleFavorite(id: string): UserProfile[] {
  const profiles = loadUserProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx < 0) return profiles;
  profiles[idx].favorite = !profiles[idx].favorite;
  saveUserProfiles(profiles);
  return profiles;
}

export function updateLastPlayed(id: string): UserProfile[] {
  const profiles = loadUserProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx < 0) return profiles;
  profiles[idx].lastPlayed = new Date().toISOString();
  saveUserProfiles(profiles);
  return profiles;
}
