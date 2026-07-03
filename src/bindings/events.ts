import { api, isTauri, minimizeWindow, openExternal, pickModFile, detectFrameless, toggleMaximizeWindow, closeWindow } from "../api/tauri";
import { applyAppearance, resetAppearanceBackground, saveAppearance } from "../services/appearance";
import { addUserProfile, profileFromInstall, removeUserProfile, saveUserProfiles, renameProfile, duplicateProfile, toggleFavorite, updateLastPlayed } from "../services/profiles";
import { setModIconFromProject } from "../services/modIcons";
import { fetchFeaturedServers, fetchNews } from "../services/supabase";
import {
  equipOfficialCape,
  fetchMinecraftCosmetics,
  OFFICIAL_SKIN_URL,
} from "../services/minecraftCosmetics";
import { acceptPrivacy, isPrivacyAccepted } from "../services/privacy";
import { state, defaultSettings } from "../types/state";
import { debounce } from "../utils/debounce";
import { activeMcVersion, activeProfileId } from "../utils/profile";
import { filterAllowedVersions } from "../utils/versions";
import { baseMcVersion } from "../utils/format";

type Rerender = () => void;

function pushLog(stream: "stdout" | "stderr" | "system", line: string): void {
  const time = new Date().toLocaleTimeString();
  state.logLines.push({ stream, line, time });
  if (state.logLines.length > 500) state.logLines.shift();
}

export async function refreshCosmetics(): Promise<void> {
  if (!state.account?.mc_access_token) {
    state.mcCosmetics = null;
    state.mcCosmeticsError = "";
    return;
  }

  state.mcCosmeticsLoading = true;
  state.mcCosmeticsError = "";
  requestRerender();

  try {
    state.mcCosmetics = await fetchMinecraftCosmetics(state.account.mc_access_token);
  } catch (e) {
    state.mcCosmeticsError = e instanceof Error ? e.message : String(e);
  } finally {
    state.mcCosmeticsLoading = false;
    requestRerender();
  }
}

export async function loadInitialData(): Promise<void> {
  state.privacyAccepted = isPrivacyAccepted();
  applyAppearance(state.appearance);

  if (!isTauri()) {
    state.ready = true;
    state.javaLabel = "Browser preview";
    return;
  }

  try {
    const [settings, account, instances, versions, optimal] = await Promise.all([
      api.getSettings(),
      api.getAccount(),
      api.listInstances(null),
      api.listVersions(null),
      api.generateOptimalArgs(),
    ]);

    state.settings = { ...defaultSettings(), ...settings };
    state.account = account;
    state.instances = instances;
    state.installedVersions = filterAllowedVersions(versions);
    state.optimalJvm = optimal;

    if (!state.selectedInstanceId && state.userProfiles.length) {
      state.selectedInstanceId = state.userProfiles[0].id;
      state.settings.version = state.userProfiles[0].id;
    }

    state.javaLabel = settings.java_path ? "Custom Java" : "Auto-detected";
    state.installState = await api
      .isVersionInstalled(activeMcVersion(), state.settings.mc_dir)
      .catch(() => null);

    if (state.settings.loader_type === "fabric") {
      state.fabricLoaders = await api
        .listFabricLoaders(activeMcVersion())
        .catch(() => []);
    }
  } catch {
    state.javaLabel = "Java status unknown";
  }

  try {
    const [news, servers] = await Promise.all([fetchNews(), fetchFeaturedServers()]);
    state.news = news;
    state.servers = servers;
  } catch {
    /* optional */
  }

  if (isTauri()) {
    state.frameless = await detectFrameless();
  }

  state.ready = true;
}

export async function refreshInstances(): Promise<void> {
  if (!isTauri()) return;
  state.instances = await api.listInstances(state.settings.mc_dir);
  state.installedVersions = filterAllowedVersions(
    await api.listVersions(state.settings.mc_dir)
  );
}

export async function refreshMods(): Promise<void> {
  if (!isTauri()) return;
  state.mods = await api.listMods(
    activeProfileId(),
    state.modCategory,
    state.settings.mc_dir
  );
}

export async function refreshInstallState(): Promise<void> {
  if (!isTauri()) return;
  state.installState = await api.isVersionInstalled(
    activeMcVersion(),
    state.settings.mc_dir
  );
}

export async function saveSettingsFromForm(): Promise<void> {
  if (!isTauri()) return;
  await api.saveSettings(state.settings);
}

export async function handleLaunch(): Promise<void> {
  if (!isTauri() || state.launching) return;

  state.launching = true;
  state.launchMessage = "Preparing launch…";
  pushLog("system", "Starting launch…");
  requestRerender();

  try {
    await api.saveSettings(state.settings);
    await api.launchMinecraft(state.settings);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.launchMessage = msg;
    pushLog("system", `Launch error: ${msg}`);
    state.launching = false;
    requestRerender();
  }
}

export async function handleInstallVersion(version: string): Promise<void> {
  if (!isTauri()) return;
  state.installProgress = { phase: "install", message: "Starting…", done: 0, total: 1 };
  pushLog("system", `Installing Minecraft ${version} with Fabric…`);
  requestRerender();

  try {
    const profileId = await api.installVersion(
      "fabric",
      version,
      state.settings.fabric_loader_version,
      state.settings.mc_dir
    );
    state.settings.version = profileId;
    state.selectedInstanceId = profileId;
    state.userProfiles = addUserProfile(profileFromInstall(profileId, version));
    await api.saveSettings(state.settings);
    await refreshInstances();
    await refreshInstallState();
    state.installProgress = null;
    pushLog("system", `Installed ${profileId}`);
  } catch (e) {
    state.installProgress = null;
    const msg = e instanceof Error ? e.message : String(e);
    state.launchMessage = msg;
    pushLog("system", `Install error: ${msg}`);
  }
  requestRerender();
}

export async function searchModrinth(query?: string): Promise<void> {
  if (!isTauri()) {
    state.modBrowserError = "Mod browser requires the desktop app.";
    requestRerender();
    return;
  }

  const q = (query ?? state.modSearchQuery).trim();
  state.modSearchQuery = q;
  state.modBrowserLoading = true;
  state.modBrowserError = "";
  requestRerender();

  try {
    state.modrinthResults = await api.searchModrinth(
      q,
      state.modCategory,
      activeMcVersion(),
      state.settings.loader_type === "fabric" ? "fabric" : "vanilla"
    );
    if (!state.modrinthResults.length) {
      state.modBrowserError = q ? "No results found. Try a different search." : "No mods found for this version.";
    }
  } catch (e) {
    state.modrinthResults = [];
    state.modBrowserError = e instanceof Error ? e.message : String(e);
  }

  state.modBrowserLoading = false;
  requestRerender();
}

let rerenderFn: Rerender = () => undefined;

export function setRerender(fn: Rerender): void {
  rerenderFn = fn;
}

export function requestRerender(): void {
  rerenderFn();
}

export function setupTauriListeners(): void {
  if (!isTauri()) return;

  import("@tauri-apps/api/event").then(({ listen }) => {
    listen<{ phase: string; message?: string }>("launch-status", (ev) => {
      const { phase, message } = ev.payload;
      if (message) {
        state.launchMessage = message;
        if (state.appearance.verboseLogs) pushLog("system", message);
      }

      // Capture optional detailed payload from backend (code, java, version, loader, cwd)
      const payloadAny = ev.payload as any;
      if (phase === "checking") {
        state.launchDetails = null;
      } else {
        const details: Record<string, string | number> = {};
        if (payloadAny.code !== undefined) details.code = payloadAny.code;
        if (payloadAny.error) details.error = String(payloadAny.error);
        if (payloadAny.java) details.java = String(payloadAny.java);
        if (payloadAny.version) details.version = String(payloadAny.version);
        if (payloadAny.loader) details.loader = String(payloadAny.loader);
        if (payloadAny.cwd) details.cwd = String(payloadAny.cwd);
        state.launchDetails = Object.keys(details).length ? details : null;
      }

      if (phase === "running") {
        state.launching = false;
        if (state.settings.minimize_on_launch) void minimizeWindow();
      } else if (phase === "error") {
        state.launching = false;
      } else if (phase === "exited") {
        state.launching = false;
      } else if (phase === "starting" || phase === "checking") {
        state.launching = true;
      }
      requestRerender();
    });

    listen<{ phase: string; message: string; done: number; total: number }>(
      "install-status",
      (ev) => {
        state.installProgress = ev.payload;
        pushLog("system", ev.payload.message);
        requestRerender();
      }
    );

    listen<{ stream: string; line: string }>("launch-log", (ev) => {
      const stream = ev.payload.stream === "stderr" ? "stderr" : "stdout";
      pushLog(stream, ev.payload.line);
      if (state.page === "logs") {
        requestRerender();
        scrollLogsToBottom();
      }
    });

    listen("auth-changed", async () => {
      state.account = await api.getAccount();
      state.mcCosmetics = null;
      if (state.page === "profile") void refreshCosmetics();
      requestRerender();
    });
  });
}

function scrollLogsToBottom(): void {
  requestAnimationFrame(() => {
    const panel = document.getElementById("logs-panel");
    if (panel) panel.scrollTop = panel.scrollHeight;
  });
}

function persistAppearance(): void {
  saveAppearance(state.appearance);
  applyAppearance(state.appearance);
}

export function bindEvents(root: HTMLElement): void {
  root.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", () => {
      const page = (el as HTMLElement).dataset.page;
      if (!page) return;
      const tab = (el as HTMLElement).dataset.settingsTab;
      const modTab = (el as HTMLElement).dataset.modTab;
      if (tab) state.settingsTab = tab as typeof state.settingsTab;
      if (modTab) state.modTab = modTab as typeof state.modTab;
      state.page = page as typeof state.page;
      state.accountMenuOpen = false;
      if (page === "mods") {
        state.modTab = modTab === "installed" ? "installed" : "browse";
        if (state.modTab === "installed") refreshMods().then(requestRerender);
        else if (!state.modrinthResults.length) searchModrinth("");
        else requestRerender();
        return;
      }
      if (page === "logs") scrollLogsToBottom();
      if (page === "profile") void refreshCosmetics();
      requestRerender();
    });
  });

  root.querySelectorAll("[data-settings-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      state.settingsTab = (el as HTMLElement).dataset.settingsTab as typeof state.settingsTab;
      requestRerender();
    });
  });

  root.querySelectorAll("[data-mod-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      state.modTab = (el as HTMLElement).dataset.modTab as typeof state.modTab;
      if (state.modTab === "browse") {
        if (!state.modrinthResults.length) searchModrinth(state.modSearchQuery);
        else requestRerender();
      } else {
        refreshMods().then(requestRerender);
      }
    });
  });

  root.querySelectorAll("[data-mod-category]").forEach((el) => {
    el.addEventListener("click", () => {
      state.modCategory = (el as HTMLElement).dataset.modCategory ?? "mods";
      state.modrinthResults = [];
      if (state.modTab === "browse") searchModrinth(state.modSearchQuery);
      else refreshMods().then(requestRerender);
    });
  });

  root.querySelectorAll("[data-external]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = (el as HTMLElement).dataset.external;
      if (url) void openExternal(url);
    });
  });

  bindAction(root, "launch", () => handleLaunch());
  bindAction(root, "install-current", () => handleInstallVersion(activeMcVersion()));
  bindAction(root, "verify-current", () => handleInstallVersion(activeMcVersion()));
  bindAction(root, "repair", () => handleInstallVersion(activeMcVersion()));

  root.querySelectorAll("[data-action='install-version']").forEach((el) => {
    el.addEventListener("click", () => {
      const v = (el as HTMLElement).dataset.version;
      if (v) handleInstallVersion(v);
    });
  });

  root.querySelectorAll("[data-action='select-version']").forEach((el) => {
    el.addEventListener("click", () => {
      const v = (el as HTMLElement).dataset.version;
      if (!v) return;
      state.settings.version = v;
      state.settings.loader_type = "fabric";
      refreshInstallState().then(requestRerender);
    });
  });

  root.querySelectorAll("[data-action='version-pick']").forEach((el) => {
    el.addEventListener("click", () => {
      const v = (el as HTMLElement).dataset.version;
      if (!v) return;
      state.settings.version = v;
      state.settings.loader_type = "fabric";
      state.versionDropdownOpen = false;
      refreshInstallState().then(requestRerender);
    });
  });

  bindAction(root, "version-toggle", (e) => {
    e?.stopPropagation();
    state.versionDropdownOpen = !state.versionDropdownOpen;
    requestRerender();
  });

  bindAction(root, "play-advanced-toggle", () => {
    state.playAdvancedOpen = !state.playAdvancedOpen;
    requestRerender();
  });

  const versionSearch = root.querySelector<HTMLInputElement>("#version-search");
  versionSearch?.addEventListener("input", () => {
    state.versionSearch = versionSearch.value;
    requestRerender();
    setTimeout(() => root.querySelector<HTMLInputElement>("#version-search")?.focus(), 0);
  });

  const instanceSearch = root.querySelector<HTMLInputElement>("#instance-search");
  instanceSearch?.addEventListener("input", () => {
    state.globalSearch = instanceSearch.value;
    requestRerender();
  });

  const globalSearch = root.querySelector<HTMLInputElement>("#global-search");
  globalSearch?.addEventListener("input", () => {
    state.globalSearch = globalSearch.value;
    if (state.page !== "instances") state.page = "instances";
    requestRerender();
  });

  const ramSlider = root.querySelector<HTMLInputElement>("#ram-slider");
  ramSlider?.addEventListener("input", () => {
    const val = parseInt(ramSlider.value, 10);
    state.settings.ram_mb = val;
    const label = root.querySelector("#ram-value");
    if (label) label.textContent = `${val} MB`;
  });
  ramSlider?.addEventListener("change", () => saveSettingsFromForm());

  bindAction(root, "save-settings", () => {
    readSettingsForm(root);
    readAppearanceForm(root);
    persistAppearance();
    saveSettingsFromForm().then(requestRerender);
  });

  bindAll(root, "msa-login", async () => {
    try {
      state.account = await api.msaLogin();
      pushLog("system", `Signed in as ${state.account.username}`);
    } catch (e) {
      state.launchMessage = e instanceof Error ? e.message : String(e);
    }
    requestRerender();
  });

  bindAll(root, "msa-logout", async () => {
    await api.msaLogout();
    state.account = null;
    state.accountMenuOpen = false;
    requestRerender();
  });

  bindAction(root, "account-toggle", () => {
    state.accountMenuOpen = !state.accountMenuOpen;
    requestRerender();
  });

  bindAction(root, "refresh-cosmetics", () => refreshCosmetics());
  bindAction(root, "change-skin", () => openExternal(OFFICIAL_SKIN_URL));
  bindAction(root, "pick-skin-png", () => {
    root.querySelector<HTMLInputElement>("#skin-file-input")?.click();
  });
  bindAction(root, "confirm-skin-upload", () => {
    state.skinUploadPending = false;
    state.skinUploadError =
      "Official skin upload is waiting for backend support. Use the official Minecraft profile link for now.";
    requestRerender();
  });
  bindAction(root, "win-minimize", () => minimizeWindow());
  bindAction(root, "win-maximize", () => toggleMaximizeWindow());
  bindAction(root, "win-close", () => closeWindow());

  root.querySelector<HTMLInputElement>("#skin-file-input")?.addEventListener("change", (e) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") {
      state.skinUploadError = "Select a PNG skin file.";
      requestRerender();
      return;
    }
    if (state.skinUploadPreviewUrl) URL.revokeObjectURL(state.skinUploadPreviewUrl);
    state.skinUploadPreviewUrl = URL.createObjectURL(file);
    state.skinUploadName = file.name;
    state.skinUploadError = "";
    requestRerender();
  });

  root.querySelectorAll("[data-action='skin-model']").forEach((el) => {
    el.addEventListener("click", () => {
      const model = (el as HTMLElement).dataset.model;
      state.skinUploadModel = model === "SLIM" ? "SLIM" : "CLASSIC";
      requestRerender();
    });
  });

  root.querySelectorAll("[data-action='equip-cape']").forEach((el) => {
    el.addEventListener("click", async () => {
      const capeId = (el as HTMLElement).dataset.capeId;
      if (!capeId || !state.account?.mc_access_token) return;
      const btn = el as HTMLButtonElement;
      btn.disabled = true;
      try {
        state.mcCosmetics = await equipOfficialCape(state.account.mc_access_token, capeId);
        state.mcCosmeticsError = "";
      } catch (e) {
        state.mcCosmeticsError = e instanceof Error ? e.message : String(e);
      }
      requestRerender();
    });
  });

  bindAction(root, "open-instance-folder", async () => {
    await api.openModsFolder(activeProfileId(), "mods", state.settings.mc_dir);
  });

  bindAction(root, "privacy-accept", () => {
    acceptPrivacy();
    state.privacyAccepted = true;
    state.page = "home";
    requestRerender();
  });

  bindAction(root, "privacy-decline", () => {
    if (isTauri()) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
    }
  });

  bindAction(root, "apply-optimal-jvm", () => {
    if (!state.optimalJvm) return;
    state.settings.ram_mb = state.optimalJvm.recommended_ram_mb;
    state.settings.jvm_args = state.optimalJvm.recommended_args;
    requestRerender();
  });

  bindAll(root, "search-modrinth", () => {
    const input = root.querySelector<HTMLInputElement>("#modrinth-search");
    searchModrinth(input?.value ?? state.modSearchQuery);
  });

  root.querySelectorAll("[data-action='show-mod-details']").forEach((el) => {
    el.addEventListener("click", () => {
      state.modDetailsId = (el as HTMLElement).dataset.project ?? null;
      requestRerender();
    });
  });

  bindAction(root, "close-mod-details", () => {
    state.modDetailsId = null;
    requestRerender();
  });

  const modrinthSearch = root.querySelector<HTMLInputElement>("#modrinth-search");
  modrinthSearch?.addEventListener("input", () => {
    state.modSearchQuery = modrinthSearch.value;
  });
  modrinthSearch?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchModrinth(modrinthSearch.value);
  });

  bindAction(root, "add-mod-file", async () => {
    const path = await pickModFile();
    if (!path) return;
    await api.addMod(activeProfileId(), path, state.modCategory, state.settings.mc_dir);
    await refreshMods();
    requestRerender();
  });

  root.querySelectorAll("[data-action='toggle-mod']").forEach((el) => {
    el.addEventListener("click", async () => {
      const filename = (el as HTMLElement).dataset.filename!;
      const enabled = (el as HTMLElement).dataset.enabled === "1";
      await api.toggleMod(activeProfileId(), filename, enabled, state.modCategory, state.settings.mc_dir);
      await refreshMods();
      requestRerender();
    });
  });

  root.querySelectorAll("[data-action='delete-mod']").forEach((el) => {
    el.addEventListener("click", async () => {
      const filename = (el as HTMLElement).dataset.filename!;
      await api.deleteMod(activeProfileId(), filename, state.modCategory, state.settings.mc_dir);
      await refreshMods();
      requestRerender();
    });
  });

  root.querySelectorAll("[data-action='install-modrinth']").forEach((el) => {
    el.addEventListener("click", async () => {
      const projectId = (el as HTMLElement).dataset.project!;
      const icon = (el as HTMLElement).dataset.icon || null;
      const btn = el as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = "Installing…";
      try {
        const filename = await api.installModrinthProject(
          projectId,
          state.modCategory,
          activeProfileId(),
          state.settings.loader_type === "fabric" ? "fabric" : "vanilla",
          state.settings.mc_dir
        );
        if (icon) setModIconFromProject(projectId, icon, filename);
        pushLog("system", `Installed ${filename}`);
        await refreshMods();
      } catch (e) {
        state.modBrowserError = e instanceof Error ? e.message : String(e);
      }
      requestRerender();
    });
  });

  root.querySelectorAll("[data-action='open-mods-folder']").forEach((el) => {
    el.addEventListener("click", async () => {
      const profile =
        (el as HTMLElement).dataset.instance ?? activeProfileId();
      await api.openModsFolder(profile, state.modCategory, state.settings.mc_dir);
    });
  });

  root.querySelectorAll("[data-action='select-instance']").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.instance!;
      const profile = state.userProfiles.find((p) => p.id === id);
      state.selectedInstanceId = id;
      state.settings.version = id;
      if (profile) {
        state.settings.loader_type = profile.loader.toLowerCase();
      }
      state.page = "settings";
      requestRerender();
    });
  });

  root.querySelectorAll("[data-action='launch-instance']").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.instance!;
      const profile = state.userProfiles.find((p) => p.id === id);
      state.selectedInstanceId = id;
      state.settings.version = id;
      if (profile) {
        state.settings.loader_type = profile.loader.toLowerCase();
      }
      state.userProfiles = updateLastPlayed(id);
      handleLaunch();
    });
  });

  root.querySelectorAll("[data-action='remove-profile']").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.instance!;
      state.userProfiles = removeUserProfile(id);
      if (state.selectedInstanceId === id) {
        state.selectedInstanceId = state.userProfiles[0]?.id ?? "";
        state.settings.version = state.userProfiles[0]?.id ?? state.settings.version;
      }
      requestRerender();
    });
  });

  root.querySelectorAll("[data-action='rename-instance']").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.instance!;
      const profile = state.userProfiles.find((p) => p.id === id);
      if (!profile) return;
      state.renameInstanceId = id;
      state.renameInstanceName = profile.name;
      requestRerender();
      setTimeout(() => {
        const input = root.querySelector<HTMLInputElement>("#rename-input");
        if (input) input.focus();
      }, 0);
    });
  });

  bindAction(root, "close-rename-modal", () => {
    state.renameInstanceId = null;
    state.renameInstanceName = "";
    requestRerender();
  });

  bindAction(root, "confirm-rename", () => {
    if (!state.renameInstanceId) return;
    const newName = state.renameInstanceName.trim();
    if (!newName) return;
    state.userProfiles = renameProfile(state.renameInstanceId, newName);
    state.renameInstanceId = null;
    state.renameInstanceName = "";
    requestRerender();
  });

  root.querySelectorAll("[data-action='duplicate-instance']").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.instance!;
      state.userProfiles = duplicateProfile(id);
      requestRerender();
    });
  });

  root.querySelectorAll("[data-action='toggle-favorite']").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.instance!;
      state.userProfiles = toggleFavorite(id);
      requestRerender();
    });
  });

  root.querySelectorAll("[data-action='open-instance-folder']").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = (el as HTMLElement).dataset.instance!;
      await api.openModsFolder(id, "mods", state.settings.mc_dir);
    });
  });

  root.querySelectorAll("[data-action='join-server']").forEach((el) => {
    el.addEventListener("click", () => {
      const address = (el as HTMLElement).dataset.address;
      if (address) void openExternal(`minecraft://?addExternalServer=${encodeURIComponent(address)}`);
    });
  });

  const versionsSearch = root.querySelector<HTMLInputElement>("#versions-search");
  versionsSearch?.addEventListener("input", () => {
    state.versionsSearch = versionsSearch.value;
    requestRerender();
  });

  const modFilter = root.querySelector<HTMLInputElement>("#mod-filter");
  modFilter?.addEventListener("input", () => {
    state.modSearchQuery = modFilter.value;
    requestRerender();
  });

  bindToggle(root, "toggle-snapshots", () => {
    state.settings.show_snapshots = !state.settings.show_snapshots;
    requestRerender();
  });

  bindToggle(root, "toggle-minimize-on-launch", () => {
    state.settings.minimize_on_launch = !state.settings.minimize_on_launch;
    saveSettingsFromForm().then(requestRerender);
  });

  bindToggle(root, "toggle-discord-rpc", () => {
    state.appearance.discordRpc = !state.appearance.discordRpc;
    persistAppearance();
    requestRerender();
  });

  bindToggle(root, "toggle-reduce-motion", () => {
    state.appearance.reduceMotion = !state.appearance.reduceMotion;
    persistAppearance();
    requestRerender();
  });

  bindToggle(root, "toggle-verbose-logs", () => {
    state.appearance.verboseLogs = !state.appearance.verboseLogs;
    persistAppearance();
    requestRerender();
  });

  const bgSelect = root.querySelector<HTMLSelectElement>("#set-background");
  bgSelect?.addEventListener("change", () => {
    state.appearance.background = bgSelect.value;
    state.appearance.customBackgroundName = "";
    persistAppearance();
    requestRerender();
  });

  bindAction(root, "pick-background-image", () => {
    root.querySelector<HTMLInputElement>("#background-file-input")?.click();
  });

  bindAction(root, "reset-background-image", () => {
    state.appearance = resetAppearanceBackground(state.appearance);
    persistAppearance();
    requestRerender();
  });

  root.querySelector<HTMLInputElement>("#background-file-input")?.addEventListener("change", (e) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      state.appearance.background = reader.result;
      state.appearance.customBackgroundName = file.name;
      persistAppearance();
      requestRerender();
    });
    reader.readAsDataURL(file);
  });

  const overlay = root.querySelector<HTMLInputElement>("#set-overlay");
  overlay?.addEventListener("input", () => {
    state.appearance.overlayOpacity = parseFloat(overlay.value);
    const label = root.querySelector("#overlay-value");
    if (label) label.textContent = `${Math.round(state.appearance.overlayOpacity * 100)}%`;
    persistAppearance();
  });

  const blur = root.querySelector<HTMLInputElement>("#set-blur");
  blur?.addEventListener("input", () => {
    state.appearance.blur = parseInt(blur.value, 10);
    const label = root.querySelector("#blur-value");
    if (label) label.textContent = `${state.appearance.blur}px`;
    persistAppearance();
  });

  bindAction(root, "clear-logs", () => {
    state.logLines = [];
    requestRerender();
  });

  bindAction(root, "copy-logs", async () => {
    const text = state.logLines.map((l) => `[${l.time}] ${l.line}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  });
}

function bindAction(root: HTMLElement, action: string, fn: (e?: Event) => void): void {
  root.querySelector(`[data-action='${action}']`)?.addEventListener("click", fn);
}

function bindAll(root: HTMLElement, action: string, fn: () => void): void {
  root.querySelectorAll(`[data-action='${action}']`).forEach((el) => {
    el.addEventListener("click", fn);
  });
}

function bindToggle(root: HTMLElement, action: string, fn: () => void): void {
  root.querySelectorAll(`[data-action='${action}']`).forEach((el) => {
    el.addEventListener("click", fn);
  });
}

function readSettingsForm(root: HTMLElement): void {
  const val = (id: string) => root.querySelector<HTMLInputElement>(id)?.value;
  const username = val("#set-username");
  const mcDir = val("#set-mc-dir");
  const loader = root.querySelector<HTMLSelectElement>("#set-loader")?.value;
  const version = val("#set-version");
  const fabricLoader = val("#set-fabric-loader");
  const javaPath = val("#set-java-path");
  const javaRuntime = val("#set-java-runtime");
  const ram = val("#set-ram");
  const jvm = root.querySelector<HTMLTextAreaElement>("#set-jvm-args")?.value;

  if (username !== undefined) state.settings.username = username;
  if (mcDir !== undefined) state.settings.mc_dir = mcDir || null;
  if (loader) state.settings.loader_type = loader;
  if (version) state.settings.version = version;
  if (fabricLoader !== undefined) state.settings.fabric_loader_version = fabricLoader || null;
  if (javaPath !== undefined) state.settings.java_path = javaPath || null;
  if (javaRuntime !== undefined) state.settings.java_runtime = javaRuntime || null;
  if (ram) state.settings.ram_mb = parseInt(ram, 10) || state.settings.ram_mb;
  if (jvm !== undefined) state.settings.jvm_args = jvm;
}

function readAppearanceForm(root: HTMLElement): void {
  const bg = root.querySelector<HTMLSelectElement>("#set-background")?.value;
  if (bg !== undefined) state.appearance.background = bg;
}

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  if (state.versionDropdownOpen && !target.closest("#version-picker")) {
    state.versionDropdownOpen = false;
    requestRerender();
  }

  if (state.accountMenuOpen && !target.closest(".account-wrap")) {
    state.accountMenuOpen = false;
    requestRerender();
  }
});
