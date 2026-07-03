export interface AppearanceSettings {
  background: string;
  customBackgroundName: string;
  overlayOpacity: number;
  blur: number;
  reduceMotion: boolean;
  discordRpc: boolean;
  verboseLogs: boolean;
}

const STORAGE_KEY = "aqua-appearance-v1";

const DEFAULTS: AppearanceSettings = {
  background: "/launcher-bg.png",
  customBackgroundName: "",
  overlayOpacity: 0.45,
  blur: 0,
  reduceMotion: false,
  discordRpc: false,
  verboseLogs: false,
};

export const BACKGROUND_OPTIONS = [
  { id: "launcher", label: "Aqua default", url: "/launcher-bg.png" },
  { id: "launcher-alt", label: "Aqua landscape", url: "/backgrounds/launcher-bg.png" },
  { id: "launcher-jpg", label: "Aqua photo", url: "/backgrounds/launcher-bg.jpg" },
  { id: "none", label: "Solid graphite", url: "" },
];

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAppearance(settings: AppearanceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function resetAppearanceBackground(settings: AppearanceSettings): AppearanceSettings {
  return {
    ...settings,
    background: DEFAULTS.background,
    customBackgroundName: "",
    blur: DEFAULTS.blur,
  };
}

export function applyAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement;
  root.style.setProperty("--bg-overlay", String(settings.overlayOpacity));
  root.style.setProperty("--bg-blur", `${settings.blur}px`);
  document.body.classList.toggle("reduce-motion", settings.reduceMotion);

  const layer = document.getElementById("bg-layer");
  if (layer) {
    if (settings.background) {
      layer.style.backgroundImage = `url("${settings.background}")`;
      layer.style.display = "block";
    } else {
      layer.style.backgroundImage = "none";
      layer.style.display = "none";
    }
  }
}
