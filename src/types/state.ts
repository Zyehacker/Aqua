import type {
  FabricLoader,
  FeaturedServer,
  InstanceInfo,
  InstallState,
  InstallStatus,
  JvmSuggestion,
  MinecraftCosmeticProfile,
  ModInfo,
  ModSearchResult,
  MsaAccount,
  NewsItem,
  Settings,
} from "./api";
import type { AppearanceSettings } from "../services/appearance";
import type { UserProfile } from "../services/profiles";

export type Page =
  | "home"
  | "profile"
  | "instances"
  | "mods"
  | "versions"
  | "logs"
  | "settings"
  | "about"
  | "privacy";

export type SettingsTab =
  | "general"
  | "launcher"
  | "java"
  | "memory"
  | "discord"
  | "downloads"
  | "appearance"
  | "privacy"
  | "developer";

export type ModTab = "installed" | "browse";

export interface LogLine {
  stream: "stdout" | "stderr" | "system";
  line: string;
  time: string;
}

export interface LauncherState {
  page: Page;
  settingsTab: SettingsTab;
  modTab: ModTab;
  settings: Settings;
  appearance: AppearanceSettings;
  account: MsaAccount | null;
  userProfiles: UserProfile[];
  instances: InstanceInfo[];
  installedVersions: string[];
  installState: InstallState | null;
  launching: boolean;
  launchMessage: string;
  launchDetails: Record<string, string | number> | null;
  installProgress: InstallStatus | null;
  mods: ModInfo[];
  modrinthResults: ModSearchResult[];
  modSearchQuery: string;
  modCategory: string;
  modBrowserLoading: boolean;
  modBrowserError: string;
  modDetailsId: string | null;
  versionDropdownOpen: boolean;
  versionSearch: string;
  playAdvancedOpen: boolean;
  globalSearch: string;
  news: NewsItem[];
  servers: FeaturedServer[];
  privacyAccepted: boolean;
  javaLabel: string;
  fabricLoaders: FabricLoader[];
  optimalJvm: JvmSuggestion | null;
  selectedInstanceId: string;
  versionsSearch: string;
  ready: boolean;
  appVersion: string;
  renameInstanceId: string | null;
  renameInstanceName: string;
  logLines: LogLine[];
  accountMenuOpen: boolean;
  mcCosmetics: MinecraftCosmeticProfile | null;
  mcCosmeticsLoading: boolean;
  mcCosmeticsError: string;
  skinUploadPreviewUrl: string | null;
  skinUploadName: string;
  skinUploadModel: "CLASSIC" | "SLIM";
  skinUploadPending: boolean;
  skinUploadError: string;
  frameless: boolean;
}

export const defaultSettings = (): Settings => ({
  username: "AquaPlayer",
  version: "1.21.11",
  loader_type: "fabric",
  fabric_loader_version: null,
  java_path: null,
  java_runtime: null,
  mc_dir: null,
  ram_mb: 2048,
  jvm_args:
    "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=16M -XX:+ParallelRefProcEnabled -XX:+AlwaysPreTouch -XX:+DisableExplicitGC",
  show_snapshots: false,
  minimize_on_launch: true,
});

import { loadAppearance } from "../services/appearance";
import { loadUserProfiles } from "../services/profiles";

export const state: LauncherState = {
  page: "home",
  settingsTab: "general",
  modTab: "browse",
  settings: defaultSettings(),
  appearance: loadAppearance(),
  account: null,
  userProfiles: loadUserProfiles(),
  instances: [],
  installedVersions: [],
  installState: null,
  launching: false,
  launchMessage: "",
  launchDetails: null,
  installProgress: null,
  mods: [],
  modrinthResults: [],
  modSearchQuery: "",
  modCategory: "mods",
  modBrowserLoading: false,
  modBrowserError: "",
  modDetailsId: null,
  versionDropdownOpen: false,
  versionSearch: "",
  playAdvancedOpen: false,
  globalSearch: "",
  news: [],
  servers: [],
  privacyAccepted: false,
  javaLabel: "Detecting Java…",
  fabricLoaders: [],
  optimalJvm: null,
  selectedInstanceId: "",
  versionsSearch: "",
  ready: false,
  appVersion: "1.0.0",
  renameInstanceId: null,
  renameInstanceName: "",
  logLines: [],
  accountMenuOpen: false,
  mcCosmetics: null,
  mcCosmeticsLoading: false,
  mcCosmeticsError: "",
  skinUploadPreviewUrl: null,
  skinUploadName: "",
  skinUploadModel: "CLASSIC",
  skinUploadPending: false,
  skinUploadError: "",
  frameless: false,
};
