import type { MinecraftCape, MinecraftCosmeticProfile, MinecraftSkin } from "../types/api";

const MC_PROFILE = "https://api.minecraftservices.com/minecraft/profile";
const MC_CAPE_ACTIVE = "https://api.minecraftservices.com/minecraft/profile/capes/active";
export const OFFICIAL_SKIN_URL = "https://www.minecraft.net/msaprofile/mygames/editprofile";

export async function fetchMinecraftCosmetics(
  accessToken: string
): Promise<MinecraftCosmeticProfile> {
  const res = await fetch(MC_PROFILE, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error("Could not load your Minecraft profile. Try signing in again.");
  }

  const data = await res.json();
  const skins: MinecraftSkin[] = (data.skins ?? []).map(
    (s: { id: string; url: string; variant?: string; state?: string }) => ({
      id: s.id,
      url: s.url,
      variant: s.variant === "SLIM" ? "SLIM" : "CLASSIC",
      active: s.state === "ACTIVE",
    })
  );

  const capes: MinecraftCape[] = (data.capes ?? []).map(
    (c: { id: string; alias?: string; url: string; state?: string }) => ({
      id: c.id,
      alias: c.alias ?? "Cape",
      url: c.url,
      active: c.state === "ACTIVE",
    })
  );

  return {
    id: data.id ?? "",
    name: data.name ?? "Player",
    skins,
    capes,
  };
}

export async function equipOfficialCape(
  accessToken: string,
  capeId: string
): Promise<MinecraftCosmeticProfile> {
  const res = await fetch(MC_CAPE_ACTIVE, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ capeId }),
  });

  if (!res.ok) {
    throw new Error("Could not equip that cape. Only official capes you own can be used.");
  }

  return fetchMinecraftCosmetics(accessToken);
}

export function skinPreviewUrl(uuid: string, size = 160): string {
  const id = uuid.replace(/-/g, "");
  return `https://crafatar.com/renders/body/${id}?size=${size}&overlay`;
}

export function offlineSkinPreview(username: string, size = 160): string {
  return `https://minotar.net/body/${encodeURIComponent(username)}/${size}.png`;
}

export function activeSkinUrl(profile: MinecraftCosmeticProfile | null): string | null {
  if (!profile) return null;
  return profile.skins.find((s) => s.active)?.url ?? profile.skins[0]?.url ?? null;
}
