import { state, type SettingsTab } from "../types/state";
import { iconImg } from "../utils/icons";
import { BACKGROUND_OPTIONS } from "../services/appearance";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "launcher", label: "Launcher" },
  { id: "java", label: "Java" },
  { id: "memory", label: "Memory" },
  { id: "discord", label: "Discord RPC" },
  { id: "downloads", label: "Downloads" },
  { id: "appearance", label: "Appearance" },
  { id: "privacy", label: "Privacy" },
  { id: "developer", label: "Developer" },
];

export function renderSettings(): string {
  return `
    <div class="page-enter settings-layout">
      <div class="page-head">
        <div>
          <p class="eyebrow">Preferences</p>
          <h2>Settings</h2>
        </div>
        <button type="button" class="primary-btn" data-action="save-settings">Save changes</button>
      </div>

      <div class="settings-shell">
        <nav class="settings-nav glass-card radius-settings">
          ${TABS.map(
            (t) => `
            <button
              type="button"
              class="settings-nav-btn ${state.settingsTab === t.id ? "active" : ""}"
              data-settings-tab="${t.id}"
            >${t.label}</button>`
          ).join("")}
        </nav>

        <div class="settings-panel glass-card radius-settings">
          ${renderSettingsTab()}
        </div>
      </div>
    </div>
  `;
}

function renderToggle(
  label: string,
  action: string,
  on: boolean
): string {
  return `
    <div class="toggle-field">
      <span class="toggle-label">${label}</span>
      <button
        type="button"
        class="toggle ${on ? "on" : ""}"
        data-action="${action}"
        role="switch"
        aria-checked="${on}"
      ></button>
    </div>
  `;
}

function renderSettingsTab(): string {
  const s = state.settings;
  const a = state.appearance;

  switch (state.settingsTab) {
    case "general":
      return `
        <h3>General</h3>
        <div class="form-grid">
          <label class="field-label">Username
            <input type="text" id="set-username" value="${escapeAttr(s.username)}" />
          </label>
          <label class="field-label">Game directory
            <input type="text" id="set-mc-dir" value="${escapeAttr(s.mc_dir ?? "")}" placeholder="Default" />
          </label>
        </div>
        <div class="account-block">
          <p class="eyebrow">Account</p>
          ${
            state.account
              ? `<p>Signed in as <strong>${escapeHtml(state.account.username)}</strong></p>
                 <button type="button" class="ghost-btn" data-action="msa-logout">Sign out of Microsoft</button>`
              : `<button type="button" class="ms-login-btn settings-ms-btn" data-action="msa-login">
                   <span class="ms-login-icon" aria-hidden="true">
                     <svg viewBox="0 0 21 21" width="18" height="18" fill="currentColor">
                       <rect x="1" y="1" width="9" height="9"></rect>
                       <rect x="11" y="1" width="9" height="9"></rect>
                       <rect x="1" y="11" width="9" height="9"></rect>
                       <rect x="11" y="11" width="9" height="9"></rect>
                     </svg>
                   </span>
                   <span>Sign in with Microsoft</span>
                 </button>
                 <p class="tiny">Or play offline using the username above.</p>`
          }
        </div>`;

    case "launcher":
      return `
        <h3>Launcher</h3>
        <div class="form-grid">
          <label class="field-label">Loader
            <select id="set-loader">
              <option value="fabric" ${s.loader_type === "fabric" ? "selected" : ""}>Fabric</option>
              <option value="vanilla" ${s.loader_type === "vanilla" ? "selected" : ""}>Vanilla</option>
            </select>
          </label>
          <label class="field-label">Minecraft version
            <input type="text" id="set-version" value="${escapeAttr(s.version)}" />
          </label>
          <label class="field-label">Fabric loader
            <input type="text" id="set-fabric-loader" value="${escapeAttr(s.fabric_loader_version ?? "")}" placeholder="Auto" />
          </label>
        </div>
        ${renderToggle("Show snapshots in remote list", "toggle-snapshots", s.show_snapshots)}
        ${renderToggle("Minimize Aqua after Minecraft starts", "toggle-minimize-on-launch", s.minimize_on_launch)}`;

    case "java":
      return `
        <h3>Java</h3>
        <p class="tiny">${escapeHtml(state.javaLabel)}</p>
        <div class="form-grid">
          <label class="field-label">Java path
            <input type="text" id="set-java-path" value="${escapeAttr(s.java_path ?? "")}" placeholder="Auto-detect" />
          </label>
          <label class="field-label">Java runtime
            <input type="text" id="set-java-runtime" value="${escapeAttr(s.java_runtime ?? "")}" placeholder="Optional" />
          </label>
        </div>
        <button type="button" class="ghost-btn" data-page="logs">Open logs</button>`;

    case "memory":
      return `
        <h3>Memory</h3>
        ${
          state.optimalJvm
            ? `<p class="tiny">System: ${state.optimalJvm.memory_mb} MB RAM · ${state.optimalJvm.cores} cores</p>`
            : ""
        }
        <label class="field-label">RAM (MB)
          <input type="number" id="set-ram" min="1024" max="16384" step="256" value="${s.ram_mb}" />
        </label>
        <label class="field-label">JVM arguments
          <textarea id="set-jvm-args" rows="5">${escapeHtml(s.jvm_args)}</textarea>
        </label>
        <button type="button" class="ghost-btn" data-action="apply-optimal-jvm">Apply recommended JVM args</button>`;

    case "discord":
      return `
        <h3>Discord Rich Presence</h3>
        <p class="tiny">Show your Aqua activity on Discord.</p>
        ${renderToggle("Enable Discord RPC", "toggle-discord-rpc", a.discordRpc)}`;

    case "downloads":
      return `
        <h3>Downloads</h3>
        <p class="tiny">Repair reinstalls missing game files for the selected version.</p>
        <button type="button" class="ghost-btn" data-action="repair">Repair installation</button>
        <button type="button" class="ghost-btn" data-action="verify-current">Verify files</button>`;

    case "appearance":
      return `
        <h3>Appearance</h3>
        <div class="background-preview" style="${a.background ? `background-image:url('${escapeAttr(a.background)}')` : ""}">
          <span>${a.customBackgroundName ? escapeHtml(a.customBackgroundName) : "Current launcher background"}</span>
        </div>
        <input id="background-file-input" type="file" accept="image/*" hidden />
        <div class="button-row">
          <button type="button" class="ghost-btn" data-action="pick-background-image">${iconImg("image.svg")} Choose image</button>
          <button type="button" class="ghost-btn" data-action="reset-background-image">${iconImg("refresh.svg")} Reset default</button>
        </div>
        <label class="field-label">Background
          <select id="set-background">
            ${BACKGROUND_OPTIONS.map(
              (opt) =>
                `<option value="${escapeAttr(opt.url)}" ${a.background === opt.url ? "selected" : ""}>${opt.label}</option>`
            ).join("")}
          </select>
        </label>
        <label class="field-label">Overlay darkness
          <div class="range-field">
            <input type="range" id="set-overlay" min="0" max="0.85" step="0.05" value="${a.overlayOpacity}" />
            <span id="overlay-value">${Math.round(a.overlayOpacity * 100)}%</span>
          </div>
        </label>
        <label class="field-label">Background blur
          <div class="range-field">
            <input type="range" id="set-blur" min="0" max="24" step="2" value="${a.blur}" />
            <span id="blur-value">${a.blur}px</span>
          </div>
        </label>
        ${renderToggle("Reduce motion", "toggle-reduce-motion", a.reduceMotion)}`;

    case "privacy":
      return `
        <h3>Privacy</h3>
        <p class="tiny">Review how Aqua handles your data.</p>
        <button type="button" class="ghost-btn" data-page="privacy">View privacy policy</button>
        <button type="button" class="danger-btn" data-action="reset-privacy">Reset privacy acceptance</button>`;

    case "developer":
      return `
        <h3>Developer</h3>
        <p class="tiny">Diagnostics and tooling for advanced users.</p>
        <button type="button" class="ghost-btn" data-page="logs">Open logs</button>
        ${renderToggle("Verbose launch logging", "toggle-verbose-logs", a.verboseLogs)}`;

    default:
      return "";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
