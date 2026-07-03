export interface Settings {
  username: string;
  version: string;
  loader_type: string;
  fabric_loader_version: string | null;
  java_path: string | null;
  java_runtime: string | null;
  mc_dir: string | null;
  ram_mb: number;
  jvm_args: string;
  show_snapshots: boolean;
  minimize_on_launch: boolean;
}

export interface MsaAccount {
  uuid: string;
  username: string;
  mc_access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface InstanceInfo {
  id: string;
  mod_count: number;
  pack_count: number;
  shader_count: number;
}

export interface ModInfo {
  filename: string;
  size: number;
  enabled: boolean;
  category: string;
}

export interface RemoteVersion {
  id: string;
  type: string;
  url: string;
}

export interface FabricLoader {
  version: string;
  stable: boolean;
}

export interface ModSearchResult {
  id: string;
  slug: string;
  title: string;
  author?: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  project_type: string;
  game_versions: string[];
  loaders: string[];
  page_url: string;
}

export interface LocalItem {
  name: string;
  path: string;
  size: number;
}

export interface InstallState {
  installed: boolean;
  json_exists: boolean;
  jar_exists: boolean;
  profile_exists: boolean;
}

export interface JvmSuggestion {
  recommended_ram_mb: number;
  recommended_args: string;
  memory_mb: number;
  cores: number;
}

export interface LaunchStatus {
  phase: string;
  message?: string;
  code?: number;
}

export interface InstallStatus {
  phase: string;
  message: string;
  done: number;
  total: number;
}

export interface NewsItem {
  id?: string;
  title: string;
  summary?: string;
  body?: string;
  image?: string;
  image_url?: string;
  date?: string;
  created_at?: string;
  link?: string;
  category?: string;
}

export interface FeaturedServer {
  id?: string;
  name: string;
  description?: string;
  banner?: string;
  banner_url?: string;
  logo?: string;
  logo_url?: string;
  version?: string;
  players?: number;
  player_count?: number;
  max_players?: number;
  address?: string;
  tags?: string[];
}

export interface MinecraftSkin {
  id: string;
  url: string;
  variant: "CLASSIC" | "SLIM";
  active: boolean;
}

export interface MinecraftCape {
  id: string;
  alias: string;
  url: string;
  active: boolean;
}

export interface MinecraftCosmeticProfile {
  id: string;
  name: string;
  skins: MinecraftSkin[];
  capes: MinecraftCape[];
}
