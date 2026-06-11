import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type RemoteVersion = { id: string; type?: string; url?: string };
type FabricLoader = { version: string; stable: boolean };
type ModResult = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string | null;
  downloads: number;
  project_type: string;
  game_versions: string[];
  loaders: string[];
  page_url: string;
};
type LocalItem = { name: string; path: string; size: number };
type AccountState = {
  loggedIn: boolean;
  username: string;
  uuid?: string;
  activeUuid?: string;
  accounts?: any[];
  needsRefresh?: boolean;
};

type Instance = {
  id: string;
  name: string;
  mcVersion: string;
  loader: "vanilla" | "fabric";
  fabricLoaderVersion?: string;
  ramMb?: number;
  jvmArgs?: string;
};

type AppSettings = {
  mc_dir?: string;
  java_path?: string;
  username?: string;
  version?: string;
  base_mc_version?: string;
  ram_mb?: number;
  jvm_args?: string;
  selectedInstanceId?: string;
  instances?: Instance[];
};

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app element");

const SFX = {
  click: "/sfx/click.ogg",
  whoosh: "/sfx/whoosh.ogg",
  success: "/sfx/success.ogg",
  error: "/sfx/error.ogg",
};

const STORAGE_KEY = "aqua.instances.v1";
const DEFAULT_INSTANCE_NAME = "Default";

function play(name: keyof typeof SFX, volume = 0.4) {
  try {
    const audio = new Audio(SFX[name]);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {}
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openExternal(url: string) {
  play("click", 0.25);
  window.open(url, "_blank", "noopener,noreferrer");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(done: number, total: number) {
  if (!total) return 0;
  return clamp(Math.round((done / total) * 100), 0, 100);
}

function uuidLike() {
  return crypto.randomUUID();
}

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function recommendedArgs() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as any).deviceMemory || 8;
  const base = Math.max(2048, Math.min(8192, Math.round(mem * 1024 * 0.65)));
  const xmx = cores >= 8 ? Math.min(12288, base + 1024) : base;

  return [
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+UseStringDeduplication",
    "-XX:MaxGCPauseMillis=50",
    "-XX:G1NewSizePercent=20",
    "-XX:G1ReservePercent=20",
    "-XX:InitiatingHeapOccupancyPercent=15",
    `-Xmx${xmx}M`,
  ].join(" ");
}

function defaultInstance(version = "", loader: "vanilla" | "fabric" = "vanilla"): Instance {
  return {
    id: uuidLike(),
    name: DEFAULT_INSTANCE_NAME,
    mcVersion: version,
    loader,
    ramMb: 4096,
    jvmArgs: recommendedArgs(),
  };
}

function loadInstancesFromStorage(): Instance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Instance[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: safeTrim(x.id) || uuidLike(),
        name: safeTrim(x.name) || DEFAULT_INSTANCE_NAME,
        mcVersion: safeTrim(x.mcVersion),
        loader: x.loader === "fabric" ? "fabric" : "vanilla",
        fabricLoaderVersion: safeTrim(x.fabricLoaderVersion) || undefined,
        ramMb: Number(x.ramMb || 4096),
        jvmArgs: safeTrim(x.jvmArgs) || recommendedArgs(),
      }));
  } catch {
    return [];
  }
}

function saveInstancesToStorage(instances: Instance[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(instances));
}

function normalizeInstance(instance: Instance): Instance {
  return {
    id: safeTrim(instance.id) || uuidLike(),
    name: safeTrim(instance.name) || DEFAULT_INSTANCE_NAME,
    mcVersion: safeTrim(instance.mcVersion),
    loader: instance.loader === "fabric" ? "fabric" : "vanilla",
    fabricLoaderVersion: safeTrim(instance.fabricLoaderVersion) || undefined,
    ramMb: Number(instance.ramMb || 4096),
    jvmArgs: safeTrim(instance.jvmArgs) || recommendedArgs(),
  };
}

const state = {
  tab: "home",
  account: { loggedIn: false, username: "Guest" } as AccountState,
  settings: {} as AppSettings,
  remoteVersions: [] as RemoteVersion[],
  fabricLoaders: [] as FabricLoader[],
  mods: [] as ModResult[],
  localItems: [] as LocalItem[],
  instances: [] as Instance[],
  selectedInstanceId: "",
  currentInstance: null as Instance | null,
  modCategory: "mods",
  modQuery: "",
  running: false,
  installed: false,
  installing: false,
  installMessage: "Idle",
  installPct: 0,
  launchMessage: "Idle",
  launchPct: 0,
  logs: [] as string[],
  news: [] as string[],
};

function getCurrentInstance() {
  const found = state.instances.find((x) => x.id === state.selectedInstanceId) || state.currentInstance;
  return found || null;
}

function setCurrentInstance(instance: Instance) {
  const normalized = normalizeInstance(instance);
  state.currentInstance = normalized;
  state.selectedInstanceId = normalized.id;

  if (!state.instances.some((x) => x.id === normalized.id)) {
    state.instances.unshift(normalized);
  } else {
    state.instances = state.instances.map((x) => (x.id === normalized.id ? normalized : x));
  }

  saveInstancesToStorage(state.instances);
  applyInstanceToSettings(normalized);
}

function applyInstanceToSettings(instance: Instance) {
  state.settings.version = instance.mcVersion;
  state.settings.base_mc_version = instance.mcVersion;
  state.settings.ram_mb = instance.ramMb ?? 4096;
  state.settings.jvm_args = instance.jvmArgs || recommendedArgs();
  state.settings.selectedInstanceId = instance.id;
  state.settings.username = state.account?.username || state.settings.username || "Player";
  state.settings._instanceName = instance.name;
  state.settings._loader = instance.loader;
  state.settings._fabricLoaderVersion = instance.fabricLoaderVersion || "";
  state.currentInstance = instance;
  state.selectedInstanceId = instance.id;
}

function setSelectedInstanceById(id: string) {
  const found = state.instances.find((x) => x.id === id);
  if (!found) return;
  setCurrentInstance(found);
  refreshPageState();
}

function ensureAtLeastOneInstance() {
  if (state.instances.length) return;
  const baseVersion = state.settings?.base_mc_version || state.settings?.version || "";
  const inst = defaultInstance(baseVersion, "vanilla");
  state.instances = [inst];
  saveInstancesToStorage(state.instances);
  setCurrentInstance(inst);
}

async function loadSettings() {
  try {
    state.settings = (await invoke("get_settings")) as AppSettings;
  } catch {
    state.settings = {};
  }

  if (!state.settings.jvm_args?.trim()) {
    state.settings.jvm_args = recommendedArgs();
  }

  state.instances = loadInstancesFromStorage();
  ensureAtLeastOneInstance();

  const selected =
    state.instances.find((x) => x.id === state.settings.selectedInstanceId) ||
    state.instances[0];

  if (selected) {
    setCurrentInstance(selected);
  }
}

async function saveSettings() {
  await invoke("save_settings", { settings: state.settings });
}

function syncSelectedInstanceToSettings() {
  const inst = getCurrentInstance();
  if (!inst) return;

  inst.name = safeTrim(inst.name) || DEFAULT_INSTANCE_NAME;
  inst.mcVersion = safeTrim(inst.mcVersion);
  inst.loader = inst.loader === "fabric" ? "fabric" : "vanilla";
  inst.fabricLoaderVersion = safeTrim(inst.fabricLoaderVersion) || undefined;
  inst.ramMb = Number(inst.ramMb || state.settings.ram_mb || 4096);
  inst.jvmArgs = safeTrim(inst.jvmArgs) || state.settings.jvm_args || recommendedArgs();

  state.instances = state.instances.map((x) => (x.id === inst.id ? inst : x));
  saveInstancesToStorage(state.instances);
  applyInstanceToSettings(inst);
}

async function loadRemoteVersions() {
  try {
    const versions = (await invoke("list_remote_versions", {
      includeSnapshots: false,
    })) as RemoteVersion[];
    state.remoteVersions = Array.isArray(versions) ? versions : [];
  } catch {
    state.remoteVersions = [];
  }
}

async function loadFabricLoaders() {
  const inst = getCurrentInstance();
  if (!inst?.mcVersion) return;

  try {
    const loaders = (await invoke("list_fabric_loaders", {
      mcVersion: inst.mcVersion,
    })) as FabricLoader[];

    state.fabricLoaders = Array.isArray(loaders) ? loaders : [];
    if (!inst.fabricLoaderVersion) {
      const stable = state.fabricLoaders.find((x) => x.stable);
      inst.fabricLoaderVersion = stable?.version || state.fabricLoaders[0]?.version || "";
      syncSelectedInstanceToSettings();
    }
  } catch {
    state.fabricLoaders = [];
  }
}

async function refreshAuth() {
  try {
    const account = (await invoke("get_account")) as any;
    if (account && (account.loggedIn || account.username)) {
      state.account = {
        loggedIn: !!account.loggedIn,
        username: account.username || account.name || "Guest",
        uuid: account.uuid,
        activeUuid: account.activeUuid,
        accounts: account.accounts,
        needsRefresh: account.needsRefresh,
      };
    } else {
      state.account = { loggedIn: false, username: "Guest" };
    }
  } catch {
    state.account = { loggedIn: false, username: "Guest" };
  }
}

async function refreshInstallState() {
  const inst = getCurrentInstance();
  if (!inst?.mcVersion) {
    state.installed = false;
    return;
  }

  try {
    const res = await invoke<any>("is_version_installed", {
      mcVersion: inst.mcVersion,
      mcDir: state.settings?.mc_dir ?? null,
    });
    state.installed = !!res?.installed;
  } catch {
    state.installed = false;
  }
}

async function refreshLocalItems() {
  const inst = getCurrentInstance();
  if (!inst?.mcVersion) {
    state.localItems = [];
    return;
  }

  try {
    const items = (await invoke("list_instance_items", {
      mcVersion: inst.mcVersion,
      category: state.modCategory,
      mcDir: state.settings?.mc_dir ?? null,
    })) as LocalItem[];
    state.localItems = Array.isArray(items) ? items : [];
  } catch {
    state.localItems = [];
  }
}

async function searchMods() {
  const inst = getCurrentInstance();
  if (!inst?.mcVersion) return;

  try {
    const results = (await invoke("search_modrinth", {
      query: state.modQuery,
      category: state.modCategory,
      mcVersion: inst.mcVersion,
      loader: inst.loader === "fabric" ? "fabric" : "vanilla",
      limit: 24,
    })) as ModResult[];

    state.mods = Array.isArray(results) ? results : [];
    play("whoosh", 0.2);
  } catch {
    state.mods = [];
  }

  await refreshLocalItems();
}

function progressCard(title: string, message: string, value: number, animated = false) {
  return `
    <div class="progress-card">
      <div class="progress-head">
        <span>${esc(title)}</span>
        <span class="muted">${esc(message)}</span>
      </div>
      <div class="progress-bar ${animated ? "animated" : ""}">
        <div class="progress-fill" style="width:${value}%"></div>
      </div>
    </div>
  `;
}

function sidebarInstanceCards() {
  const current = getCurrentInstance();

  return state.instances
    .map(
      (inst) => `
        <button class="instance-row ${current?.id === inst.id ? "active" : ""}" data-action="select-instance" data-id="${esc(inst.id)}">
          <div class="instance-row-main">
            <strong>${esc(inst.name)}</strong>
            <span>${esc(inst.mcVersion || "No version")} · ${esc(inst.loader)}</span>
          </div>
          <div class="instance-row-actions">
            <button class="mini-btn" data-action="rename-instance" data-id="${esc(inst.id)}" title="Rename">✎</button>
            <button class="mini-btn danger" data-action="delete-instance" data-id="${esc(inst.id)}" title="Delete">×</button>
          </div>
        </button>
      `
    )
    .join("");
}

function renderLeftRail() {
  return `
    <aside class="rail left-rail">
      <div class="brand">
        <div class="brand-mark">
          <img src="/official.png" alt="Aqua" class="brand-icon" />
        </div>
        <div class="brand-copy">
          <h1>Aqua Client</h1>
          <p>${esc(getCurrentInstance()?.name || "Launcher")}</p>
        </div>
      </div>

      <div class="rail-section">
        <button class="nav-btn ${state.tab === "home" ? "active" : ""}" data-tab="home">
          <span>Play</span>
        </button>
        <button class="nav-btn ${state.tab === "versions" ? "active" : ""}" data-tab="versions">
          <span>Versions</span>
        </button>
        <button class="nav-btn ${state.tab === "mods" ? "active" : ""}" data-tab="mods">
          <span>Mods</span>
        </button>
        <button class="nav-btn ${state.tab === "settings" ? "active" : ""}" data-tab="settings">
          <span>Settings</span>
        </button>
      </div>

      <div class="rail-section scrollable">
        <div class="section-label">Instances</div>
        <div class="instance-list">
          ${sidebarInstanceCards()}
        </div>
        <button class="create-instance-btn" data-action="create-instance">+ New Instance</button>
      </div>

      <div class="rail-footer">
        <button class="social-btn" data-action="open-kofi">Ko-fi</button>
        <button class="social-btn" data-action="open-discord">Discord</button>
      </div>
    </aside>
  `;
}

function renderRightRail() {
  return `
    <aside class="rail right-rail">
      <div class="rail-section">
        <div class="section-label">News</div>
        <div class="news-card">
          <div class="news-empty">No news yet.</div>
        </div>
      </div>

      <div class="rail-section">
        <div class="section-label">Status</div>
        <div class="status-card">
          <div class="status-line">
            <span>Account</span>
            <strong>${esc(state.account.loggedIn ? state.account.username : "Not signed in")}</strong>
          </div>
          <div class="status-line">
            <span>Instance</span>
            <strong>${esc(getCurrentInstance()?.name || "None")}</strong>
          </div>
          <div class="status-line">
            <span>Version</span>
            <strong>${esc(getCurrentInstance()?.mcVersion || "Unset")}</strong>
          </div>
          <div class="status-line">
            <span>Loader</span>
            <strong>${esc(getCurrentInstance()?.loader || "vanilla")}</strong>
          </div>
        </div>
      </div>

      <div class="rail-section">
        <div class="section-label">Quick actions</div>
        <button class="ghost-btn" data-action="login">
          ${state.account.loggedIn ? "Refresh Account" : "Sign in with Microsoft"}
        </button>
        <button class="ghost-btn" data-action="open-folder">Open Game Folder</button>
      </div>
    </aside>
  `;
}

function renderHome() {
  const inst = getCurrentInstance();

  return `
    <section class="hero-card">
      <div class="hero-bg"></div>

      <div class="hero-top">
        <div class="hero-title">
          <h2>${esc(inst?.name || "No Instance Selected")}</h2>
          <p>${esc(inst?.mcVersion || "Select or create an instance to begin")}</p>
        </div>

        <button class="login-pill" data-action="login">
          ${state.account.loggedIn ? esc(state.account.username) : "Microsoft Login"}
        </button>
      </div>

      <div class="hero-center">
        <button class="instance-picker" data-action="cycle-instance">
          <div>
            <span class="small-label">Selected Instance</span>
            <strong>${esc(inst?.name || "Create an instance")}</strong>
          </div>
          <span>⌄</span>
        </button>

        <button class="play-btn" data-action="launch" ${state.running ? "disabled" : ""}>
          ${state.running ? "LAUNCHING..." : "PLAY"}
        </button>

        <div class="hero-actions">
          <button class="ghost-btn" data-action="install">
            ${state.installing ? "Installing..." : "Install / Repair"}
          </button>
          <button class="ghost-btn" data-action="rename-instance">Rename Instance</button>
          <button class="ghost-btn" data-action="new-instance">New Instance</button>
        </div>
      </div>

      <div class="hero-bottom">
        ${progressCard("Install", state.installMessage, state.installPct, state.installing)}
        ${progressCard("Launch", state.launchMessage, state.launchPct, state.running)}
      </div>
    </section>
  `;
}

function renderVersions() {
  const inst = getCurrentInstance();

  return `
    <section class="page-card">
      <div class="page-head">
        <div>
          <div class="eyebrow">Versions</div>
          <h2>Choose a version</h2>
        </div>
        <button class="ghost-btn" data-action="install">${state.installing ? "Installing..." : "Install / Repair"}</button>
      </div>

      <div class="form-grid">
        <label>
          Instance name
          <input data-bind="instance_name" value="${esc(inst?.name || "")}" placeholder="Custom instance name" />
        </label>

        <label>
          Minecraft version
          <select data-bind="targetVersion">
            ${state.remoteVersions
              .map(
                (v) => `
                  <option value="${esc(v.id)}" ${v.id === inst?.mcVersion ? "selected" : ""}>
                    ${esc(v.id)}${v.type ? ` — ${esc(v.type)}` : ""}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>

        <label>
          Loader
          <select data-bind="loader">
            <option value="vanilla" ${inst?.loader === "vanilla" ? "selected" : ""}>Vanilla</option>
            <option value="fabric" ${inst?.loader === "fabric" ? "selected" : ""}>Fabric</option>
          </select>
        </label>

        <label>
          Fabric loader
          <select data-bind="fabricLoaderVersion" ${inst?.loader === "fabric" ? "" : "disabled"}>
            ${state.fabricLoaders
              .map(
                (l) => `
                  <option value="${esc(l.version)}" ${l.version === inst?.fabricLoaderVersion ? "selected" : ""}>
                    ${esc(l.version)}${l.stable ? " (stable)" : ""}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>

        <label>
          RAM (MB)
          <input data-bind="ram_mb" type="number" min="512" max="32768" value="${esc(inst?.ramMb || 4096)}" />
        </label>

        <label>
          Java args
          <input data-bind="jvm_args" value="${esc(inst?.jvmArgs || state.settings.jvm_args || "")}" />
        </label>
      </div>

      <div class="action-row">
        <button class="primary-btn" data-action="save-instance">Save Instance</button>
        <button class="ghost-btn" data-action="install">${state.installing ? "Installing..." : "Install / Repair"}</button>
      </div>
    </section>
  `;
}

function renderMods() {
  const inst = getCurrentInstance();

  return `
    <section class="page-card">
      <div class="page-head">
        <div>
          <div class="eyebrow">Mods</div>
          <h2>Browse and install</h2>
        </div>

        <div class="chips">
          ${[
            ["mods", "Mods"],
            ["resourcepacks", "Texture Packs"],
            ["shaders", "Shaders"],
          ]
            .map(
              ([key, label]) => `
                <button class="chip ${state.modCategory === key ? "active" : ""}" data-action="category" data-value="${key}">
                  ${label}
                </button>
              `
            )
            .join("")}
        </div>
      </div>

      <div class="search-row">
        <input data-bind="modQuery" value="${esc(state.modQuery)}" placeholder="Search Modrinth..." />
        <button class="primary-btn" data-action="search-mods">Search</button>
      </div>

      <div class="split">
        <div class="list-pane">
          <div class="list-head">
            <h3>Search results</h3>
            <span class="muted">Installs to the selected instance</span>
          </div>

          <div class="result-list">
            ${
              state.mods.length
                ? state.mods
                    .map(
                      (m) => `
                        <article class="mod-card">
                          <div class="mod-info">
                            <div class="mod-title-row">
                              <strong>${esc(m.title)}</strong>
                              <span class="pill">${esc(m.project_type)}</span>
                            </div>
                            <p>${esc(m.description || "No description")}</p>
                            <div class="tiny muted">
                              ${m.downloads.toLocaleString()} downloads · ${esc((m.game_versions || []).slice(0, 4).join(", ") || "any version")}
                            </div>
                          </div>
                          <div class="mod-actions">
                            <button class="ghost-btn" data-action="open-link" data-url="${esc(m.page_url)}">Open</button>
                            <button class="primary-btn" data-action="install-mod" data-project="${esc(m.id)}">
                              Install
                            </button>
                          </div>
                        </article>
                      `
                    )
                    .join("")
                : `<div class="empty-state">Search something to see results.</div>`
            }
          </div>
        </div>

        <div class="list-pane">
          <div class="list-head">
            <h3>Installed in ${esc(inst?.name || "instance")}</h3>
            <span class="muted">${esc(inst?.mcVersion || "")}</span>
          </div>

          <div class="result-list">
            ${
              state.localItems.length
                ? state.localItems
                    .map(
                      (f) => `
                        <article class="mod-card local">
                          <div class="mod-info">
                            <strong>${esc(f.name)}</strong>
                            <div class="tiny muted">${Math.max(1, Math.round(f.size / 1024))} KB</div>
                          </div>
                          <div class="mod-actions">
                            <button class="danger-btn" data-action="remove-local" data-path="${esc(f.path)}">
                              Remove
                            </button>
                          </div>
                        </article>
                      `
                    )
                    .join("")
                : `<div class="empty-state">Nothing installed in this instance.</div>`
            }
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="page-card">
      <div class="page-head">
        <div>
          <div class="eyebrow">Settings</div>
          <h2>Launcher settings</h2>
        </div>
        <button class="primary-btn" data-action="save-settings">Save</button>
      </div>

      <div class="form-grid">
        <label>
          Minecraft folder
          <input data-bind="mc_dir" value="${esc(state.settings.mc_dir || "")}" placeholder="Default if empty" />
        </label>

        <label>
          Java path
          <input data-bind="java_path" value="${esc(state.settings.java_path || "")}" placeholder="Auto-detect if empty" />
        </label>

        <label>
          Default RAM (MB)
          <input data-bind="default_ram" type="number" min="512" max="32768" value="${esc(state.settings.ram_mb || 4096)}" />
        </label>

        <label>
          Default Java args
          <input data-bind="default_jvm_args" value="${esc(state.settings.jvm_args || "")}" />
        </label>
      </div>

      <div class="action-row">
        <button class="ghost-btn" data-action="optimize-args">Generate recommended args</button>
      </div>
    </section>
  `;
}

function render() {
  const inst = getCurrentInstance();

  root.innerHTML = `
    <div class="app-shell">
      ${renderLeftRail()}

      <main class="center-shell">
        <div class="center-top">
          <div class="center-meta">
            <div class="mini-title">Aqua Client</div>
            <div class="mini-sub">${esc(inst?.name || "Select an instance")}</div>
          </div>
          <div class="center-actions">
            <button class="tiny-pill ${state.installed ? "ok" : "warn"}">${state.installed ? "Installed" : "Not installed"}</button>
            <button class="tiny-pill">${esc(inst?.loader || "vanilla")}</button>
          </div>
        </div>

        <div class="center-scroll">
          ${state.tab === "home" ? renderHome() : ""}
          ${state.tab === "versions" ? renderVersions() : ""}
          ${state.tab === "mods" ? renderMods() : ""}
          ${state.tab === "settings" ? renderSettings() : ""}
        </div>
      </main>

      ${renderRightRail()}
    </div>
  `;
}

async function refreshPageState() {
  const inst = getCurrentInstance();
  if (!inst) return;

  applyInstanceToSettings(inst);
  await loadFabricLoaders();
  await refreshInstallState();
  await refreshLocalItems();
  render();
}

async function createInstance() {
  const baseVersion = getCurrentInstance()?.mcVersion || state.remoteVersions[0]?.id || "";
  const name = prompt("Instance name:", "New Instance");
  if (!name) return;

  const loader = prompt("Loader (vanilla/fabric):", "vanilla")?.trim().toLowerCase() === "fabric" ? "fabric" : "vanilla";
  const inst: Instance = normalizeInstance({
    id: uuidLike(),
    name,
    mcVersion: baseVersion,
    loader,
    ramMb: 4096,
    jvmArgs: recommendedArgs(),
  });

  state.instances.unshift(inst);
  saveInstancesToStorage(state.instances);
  setCurrentInstance(inst);
  await refreshPageState();
}

async function renameInstance() {
  const inst = getCurrentInstance();
  if (!inst) return;

  const next = prompt("Rename instance:", inst.name);
  if (!next) return;

  inst.name = next.trim() || inst.name;
  syncSelectedInstanceToSettings();
  await saveSettings();
  render();
}

async function deleteInstance(id?: string) {
  const targetId = id || getCurrentInstance()?.id;
  if (!targetId) return;
  if (!confirm("Delete this instance?")) return;

  state.instances = state.instances.filter((x) => x.id !== targetId);
  saveInstancesToStorage(state.instances);

  if (!state.instances.length) {
    ensureAtLeastOneInstance();
  }

  const next = state.instances[0];
  if (next) setCurrentInstance(next);

  await saveSettings();
  await refreshPageState();
}

async function saveInstanceFromForm() {
  const inst = getCurrentInstance();
  if (!inst) return;

  inst.name = safeTrim(inst.name) || DEFAULT_INSTANCE_NAME;
  inst.mcVersion = safeTrim(inst.mcVersion);
  inst.loader = inst.loader === "fabric" ? "fabric" : "vanilla";
  inst.fabricLoaderVersion = safeTrim(inst.fabricLoaderVersion) || undefined;
  inst.ramMb = Number(inst.ramMb || 4096);
  inst.jvmArgs = safeTrim(inst.jvmArgs) || recommendedArgs();

  syncSelectedInstanceToSettings();
  await saveSettings();
  render();
}

async function doInstall() {
  const inst = getCurrentInstance();
  if (!inst?.mcVersion) return;

  try {
    syncSelectedInstanceToSettings();
    state.installing = true;
    state.installMessage = `Installing ${inst.mcVersion}...`;
    state.installPct = 0;
    render();
    play("click", 0.3);

    const result = (await invoke("install_version", {
      loader: inst.loader,
      mcVersion: inst.mcVersion,
      fabricLoaderVersion: inst.loader === "fabric" ? inst.fabricLoaderVersion || null : null,
      mcDir: state.settings.mc_dir ?? null,
    })) as string;

    state.settings.version = result;
    state.settings.base_mc_version = inst.mcVersion;
    inst.mcVersion = result || inst.mcVersion;
    syncSelectedInstanceToSettings();
    await saveSettings();
    await refreshInstallState();

    state.installMessage = "Done";
    state.installPct = 100;
    play("success", 0.3);
  } catch (e: any) {
    state.installMessage = e?.toString?.() || "Install failed";
    play("error", 0.3);
  } finally {
    state.installing = false;
    render();
  }
}

async function doLaunch() {
  try {
    const inst = getCurrentInstance();
    if (!inst) return;

    syncSelectedInstanceToSettings();
    state.launchMessage = "Resolving...";
    state.launchPct = 5;
    state.running = true;
    render();
    play("click", 0.25);

    await invoke("launch_minecraft", {
      settings: state.settings,
    });
  } catch (e: any) {
    state.running = false;
    state.launchMessage = e?.toString?.() || "Launch failed";
    play("error", 0.3);
    render();
  }
}

async function doLogin() {
  try {
    play("click", 0.25);
    await invoke("msa_login");
    await refreshAuth();
    play("success", 0.25);
    render();
  } catch (e: any) {
    state.logs.push(String(e?.toString?.() || e));
    play("error", 0.3);
    render();
  }
}

async function optimizeArgs() {
  const inst = getCurrentInstance();
  const args = recommendedArgs();

  if (inst) {
    inst.jvmArgs = args;
    inst.ramMb = Math.max(
      2048,
      Math.min(8192, Math.round((((navigator as any).deviceMemory || 8) * 1024) * 0.65))
    );
    syncSelectedInstanceToSettings();
  } else {
    state.settings.jvm_args = args;
  }

  await saveSettings();
  play("success", 0.25);
  render();
}

async function openGameFolder() {
  const path = state.settings.mc_dir;
  if (!path) {
    alert("No Minecraft folder set.");
    return;
  }
  openExternal(`file://${path}`);
}

function renderInstanceSwitcher() {
  const current = getCurrentInstance();
  return `
    <div class="switcher">
      <button class="switcher-btn" data-action="cycle-instance">
        <div class="switcher-copy">
          <span class="small-label">Selected instance</span>
          <strong>${esc(current?.name || "No Instance")}</strong>
        </div>
        <span class="switcher-arrow">⌄</span>
      </button>
    </div>
  `;
}

async function cycleInstance() {
  if (!state.instances.length) return;
  const currentId = getCurrentInstance()?.id;
  const idx = Math.max(0, state.instances.findIndex((x) => x.id === currentId));
  const next = state.instances[(idx + 1) % state.instances.length];
  setCurrentInstance(next);
  await saveSettings();
  await refreshPageState();
}

function setTab(tab: string) {
  state.tab = tab;
  render();
}

function attachHandlers() {
  root.onclick = async (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-action], [data-tab]");
    if (!target) return;

    const action = target.dataset.action;
    const tab = target.dataset.tab;

    if (tab) {
      setTab(tab);
      play("whoosh", 0.15);
      return;
    }

    if (!action) return;

    switch (action) {
      case "login":
        await doLogin();
        break;
      case "install":
        await doInstall();
        break;
      case "launch":
        await doLaunch();
        break;
      case "save-settings":
        syncSelectedInstanceToSettings();
        await saveSettings();
        render();
        break;
      case "optimize-args":
        await optimizeArgs();
        break;
      case "search-mods":
        await searchMods();
        render();
        break;
      case "open-kofi":
        openExternal("https://ko-fi.com/Zyehacker");
        break;
      case "open-discord":
        openExternal("https://discord.gg/aeavxn8BAe");
        break;
      case "open-folder":
        await openGameFolder();
        break;
      case "create-instance":
      case "new-instance":
        await createInstance();
        break;
      case "rename-instance":
        await renameInstance();
        break;
      case "delete-instance":
        await deleteInstance(target.dataset.id);
        break;
      case "select-instance":
        setSelectedInstanceById(target.dataset.id || "");
        break;
      case "cycle-instance":
        await cycleInstance();
        break;
      case "save-instance":
        await saveInstanceFromForm();
        break;
      case "open-link":
        openExternal(target.dataset.url || "https://modrinth.com");
        break;
      case "install-mod":
        {
          const inst = getCurrentInstance();
          if (!inst?.mcVersion) return;
          try {
            play("click", 0.25);
            await invoke("install_modrinth_project", {
              projectId: target.dataset.project,
              category: state.modCategory,
              mcVersion: inst.mcVersion,
              loader: inst.loader === "fabric" ? "fabric" : "vanilla",
              mcDir: state.settings.mc_dir ?? null,
            });
            play("success", 0.25);
            await refreshLocalItems();
            render();
          } catch (e: any) {
            state.logs.push(String(e?.toString?.() || e));
            play("error", 0.25);
            render();
          }
        }
        break;
      case "remove-local":
        {
          try {
            await invoke("remove_instance_item", {
              path: target.dataset.path,
            });
            play("success", 0.2);
            await refreshLocalItems();
            render();
          } catch {
            play("error", 0.2);
          }
        }
        break;
      case "category":
        state.modCategory = target.dataset.value || "mods";
        await refreshLocalItems();
        play("whoosh", 0.15);
        render();
        break;
    }
  };

  root.oninput = (ev) => {
    const target = ev.target as HTMLInputElement;
    const bind = target.dataset.bind;
    if (!bind) return;

    const inst = getCurrentInstance();

    if (bind === "instance_name" && inst) {
      inst.name = target.value;
      return;
    }

    if (bind === "targetVersion" && inst) {
      inst.mcVersion = target.value;
      state.settings.base_mc_version = target.value;
      state.settings.version = target.value;
      loadFabricLoaders();
      refreshInstallState();
      render();
      return;
    }

    if (bind === "loader" && inst) {
      inst.loader = target.value === "fabric" ? "fabric" : "vanilla";
      render();
      return;
    }

    if (bind === "fabricLoaderVersion" && inst) {
      inst.fabricLoaderVersion = target.value;
      return;
    }

    if (bind === "ram_mb" && inst) {
      inst.ramMb = Number(target.value || 0);
      return;
    }

    if (bind === "jvm_args" && inst) {
      inst.jvmArgs = target.value;
      return;
    }

    if (bind === "mc_dir") {
      state.settings.mc_dir = target.value;
      return;
    }

    if (bind === "java_path") {
      state.settings.java_path = target.value;
      return;
    }

    if (bind === "default_ram") {
      state.settings.ram_mb = Number(target.value || 0);
      return;
    }

    if (bind === "default_jvm_args") {
      state.settings.jvm_args = target.value;
      return;
    }

    if (bind === "modQuery") {
      state.modQuery = target.value;
    }
  };

  root.onchange = async (ev) => {
    const target = ev.target as HTMLSelectElement;
    const bind = target.dataset.bind;
    if (!bind) return;

    const inst = getCurrentInstance();

    if (bind === "targetVersion" && inst) {
      inst.mcVersion = target.value;
      state.settings.base_mc_version = target.value;
      state.settings.version = target.value;
      await loadFabricLoaders();
      await refreshInstallState();
      render();
      return;
    }

    if (bind === "loader" && inst) {
      inst.loader = target.value === "fabric" ? "fabric" : "vanilla";
      await loadFabricLoaders();
      render();
      return;
    }

    if (bind === "fabricLoaderVersion" && inst) {
      inst.fabricLoaderVersion = target.value;
      return;
    }

    if (bind === "instance_name" && inst) {
      inst.name = target.value;
      syncSelectedInstanceToSettings();
      render();
      return;
    }

    if (bind === "ram_mb" && inst) {
      inst.ramMb = Number(target.value || 0);
      return;
    }

    if (bind === "jvm_args" && inst) {
      inst.jvmArgs = target.value;
      return;
    }
  };
}

async function bootstrap() {
  state.instances = loadInstancesFromStorage();
  await loadSettings();
  await loadRemoteVersions();

  const inst = getCurrentInstance();
  if (inst) {
    applyInstanceToSettings(inst);
  } else {
    ensureAtLeastOneInstance();
  }

  await refreshAuth();
  await loadFabricLoaders();
  await refreshInstallState();
  await refreshLocalItems();

  await listen<any>("install-status", (event) => {
    const p = event.payload || {};
    state.installMessage = p.message || "Installing...";
    state.installPct = p.total
      ? pct(Number(p.done || 0), Number(p.total || 0))
      : p.phase === "done"
        ? 100
        : state.installPct;
    state.installing = p.phase !== "done" && p.phase !== "error";
    if (p.phase === "done") play("success", 0.2);
    if (p.phase === "error") play("error", 0.2);
    render();
  });

  await listen<any>("launch-status", (event) => {
    const p = event.payload || {};
    state.launchMessage = p.message || "Launching...";
    if (p.phase === "starting") state.launchPct = 10;
    if (p.phase === "running") state.launchPct = 100;
    if (p.phase === "exited" || p.phase === "error") state.running = false;
    render();
  });

  await listen<any>("launch-log", (event) => {
    const p = event.payload || {};
    if (p.line) {
      state.logs.push(String(p.line));
      if (state.logs.length > 80) state.logs.shift();
      render();
    }
  });

  render();
  attachHandlers();
}

bootstrap();
