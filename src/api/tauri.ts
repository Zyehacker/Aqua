import type {
  FabricLoader,
  InstanceInfo,
  InstallState,
  JvmSuggestion,
  ModInfo,
  ModSearchResult,
  MsaAccount,
  RemoteVersion,
  Settings,
} from "../types/api";

async function coreInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const api = {
  getSettings: () => coreInvoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => coreInvoke<void>("save_settings", { settings }),
  getDefaultMcDir: () => coreInvoke<string | null>("get_default_mc_dir"),
  listVersions: (mcDir?: string | null) =>
    coreInvoke<string[]>("list_versions", { mcDir: mcDir ?? null }),
  generateOptimalArgs: () => coreInvoke<JvmSuggestion>("generate_optimal_args"),
  launchMinecraft: (settings: Settings) =>
    coreInvoke<void>("launch_minecraft", { settings }),
  isRunning: () => coreInvoke<boolean>("is_running"),
  msaLogin: () => coreInvoke<MsaAccount>("msa_login"),
  msaLogout: () => coreInvoke<void>("msa_logout"),
  getAccount: () => coreInvoke<MsaAccount | null>("get_account"),
  listRemoteVersions: (includeSnapshots?: boolean) =>
    coreInvoke<RemoteVersion[]>("list_remote_versions", {
      includeSnapshots: includeSnapshots ?? false,
    }),
  listFabricLoaders: (mcVersion: string) =>
    coreInvoke<FabricLoader[]>("list_fabric_loaders", { mcVersion }),
  installVersion: (
    loader: string,
    mcVersion: string,
    fabricLoaderVersion?: string | null,
    mcDir?: string | null
  ) =>
    coreInvoke<string>("install_version", {
      loader,
      mcVersion,
      fabricLoaderVersion: fabricLoaderVersion ?? null,
      mcDir: mcDir ?? null,
    }),
  listInstances: (mcDir?: string | null) =>
    coreInvoke<InstanceInfo[]>("list_instances", { mcDir: mcDir ?? null }),
  listMods: (profileId: string, category: string, mcDir?: string | null) =>
    coreInvoke<ModInfo[]>("list_mods", {
      mcDir: mcDir ?? null,
      profileId,
      category,
    }),
  addMod: (profileId: string, sourcePath: string, category: string, mcDir?: string | null) =>
    coreInvoke<string>("add_mod", {
      mcDir: mcDir ?? null,
      profileId,
      sourcePath,
      category,
    }),
  deleteMod: (
    profileId: string,
    filename: string,
    category: string,
    mcDir?: string | null
  ) =>
    coreInvoke<void>("delete_mod", {
      mcDir: mcDir ?? null,
      profileId,
      filename,
      category,
    }),
  toggleMod: (
    profileId: string,
    filename: string,
    enabled: boolean,
    category: string,
    mcDir?: string | null
  ) =>
    coreInvoke<void>("toggle_mod", {
      mcDir: mcDir ?? null,
      profileId,
      filename,
      enabled,
      category,
    }),
  openModsFolder: (profileId: string, category: string, mcDir?: string | null) =>
    coreInvoke<void>("open_mods_folder", {
      mcDir: mcDir ?? null,
      profileId,
      category,
    }),
  searchModrinth: (
    query: string,
    category: string,
    mcVersion: string,
    loader: string,
    limit?: number
  ) =>
    coreInvoke<ModSearchResult[]>("search_modrinth", {
      query,
      category,
      mcVersion,
      loader,
      limit: limit ?? 24,
    }),
  installModrinthProject: (
    projectId: string,
    category: string,
    mcVersion: string,
    loader: string,
    mcDir?: string | null
  ) =>
    coreInvoke<string>("install_modrinth_project", {
      projectId,
      category,
      mcVersion,
      loader,
      mcDir: mcDir ?? null,
    }),
  isVersionInstalled: (mcVersion: string, mcDir?: string | null) =>
    coreInvoke<InstallState>("is_version_installed", {
      mcVersion,
      mcDir: mcDir ?? null,
    }),
};

export async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function pickModFile(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      filters: [{ name: "Mods & Packs", extensions: ["jar", "zip", "litemod"] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    return selected;
  } catch {
    return null;
  }
}

export async function minimizeWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  } catch {
    /* browser preview */
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (await win.isMaximized()) await win.unmaximize();
    else await win.maximize();
  } catch {
    /* browser preview */
  }
}

export async function closeWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } catch {
    /* browser preview */
  }
}

export async function detectFrameless(): Promise<boolean> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return !(await getCurrentWindow().isDecorated());
  } catch {
    return false;
  }
}
