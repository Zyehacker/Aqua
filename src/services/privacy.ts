const STORAGE_KEY = "aqua-privacy-accepted-v1";

export function isPrivacyAccepted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function acceptPrivacy(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* ignore */
  }
}

export const PRIVACY_SECTIONS = [
  {
    title: "Data we collect",
    body: "Aqua stores launcher preferences locally on your device. Microsoft login tokens are saved in your app config folder for authentication only.",
  },
  {
    title: "Third-party services",
    body: "We connect to Mojang, Microsoft, Fabric, and Modrinth to install and launch Minecraft. Featured servers and news may be loaded from Supabase.",
  },
  {
    title: "Your control",
    body: "You can sign out of Microsoft at any time, clear local data by removing the Aqua config folder, and decline this policy to exit the launcher.",
  },
];
