import { state } from "../types/state";
import { selectableVersions, LEGACY_VERSIONS, modernVersions } from "../utils/versions";
import { baseMcVersion } from "../utils/format";
import { iconImg } from "../utils/icons";

function renderVersionOption(v: string, current: string): string {
  const installed = state.installedVersions.includes(v);
  return `
    <button
      type="button"
      class="version-option ${v === current ? "active" : ""}"
      data-action="version-pick"
      data-version="${v}"
      role="option"
    >
      <span>${v}</span>
      ${installed ? '<span class="pill tiny-pill">Installed</span>' : ""}
    </button>`;
}

export function renderVersionSelector(): string {
  const current = baseMcVersion(state.settings.version);
  const query = state.versionSearch.trim().toLowerCase();
  const searching = query.length > 0;

  const legacy = searching
    ? LEGACY_VERSIONS.filter((v) => v.includes(query))
    : [...LEGACY_VERSIONS];
  const modern = searching
    ? modernVersions().filter((v) => v.includes(query))
    : modernVersions();

  const hasResults = legacy.length + modern.length > 0;

  return `
    <div class="version-picker version-picker-hero ${state.versionDropdownOpen ? "open" : ""}" id="version-picker">
      <button type="button" class="version-trigger version-trigger-large" data-action="version-toggle">
        <span class="version-trigger-label">
          <span class="small-label">Version</span>
          <strong>${escapeHtml(current)}</strong>
        </span>
        <span class="version-caret">▾</span>
      </button>

      ${
        state.versionDropdownOpen
          ? `
        <div class="version-menu glass-pop">
          <input
            type="search"
            class="version-search"
            id="version-search"
            placeholder="Search versions…"
            value="${escapeAttr(state.versionSearch)}"
            autocomplete="off"
          />
          <div class="version-list" role="listbox">
            ${
              hasResults
                ? `
              ${legacy.length ? `<div class="version-group-label">Legacy</div>${legacy.map((v) => renderVersionOption(v, current)).join("")}` : ""}
              ${modern.length ? `<div class="version-group-label">Modern</div>${modern.map((v) => renderVersionOption(v, current)).join("")}` : ""}
            `
                : `<div class="empty-state tiny">No matching versions</div>`
            }
          </div>
        </div>`
          : ""
      }
    </div>
  `;
}

export function renderPlayCard(): string {
  const profile = state.selectedInstanceId || baseMcVersion(state.settings.version);
  const ram = state.settings.ram_mb;
  const loader =
    state.settings.loader_type === "fabric" ? "Fabric" : state.settings.loader_type;
  const installed = state.installState?.installed;
  const progress = state.installProgress;
  const installPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;
  const showStatus = state.launching || state.launchMessage || progress;

  return `
    <section class="play-card play-card-simple radius-play">
      <div class="play-card-glow" aria-hidden="true"></div>
      <div class="play-card-inner">
        ${renderVersionSelector()}

        <div class="play-primary">
          <button
            type="button"
            class="play-button play-button-main primary-btn"
            id="play-btn"
            data-action="launch"
            ${state.launching ? "disabled" : ""}
          >
            <span class="play-button-icon">${iconImg("play.svg")}</span>
            <span class="play-button-label">${state.launching ? "Launching…" : "Play"}</span>
          </button>
          ${
            !installed
              ? `<button type="button" class="ghost-btn play-secondary" data-action="install-current">Install</button>`
              : ""
          }
        </div>

        ${
          showStatus
            ? `
          <div class="launch-status-block">
            ${
              state.launching || state.launchMessage
                ? `
              <div class="launch-status-row">
                <span class="status-dot ${state.launching ? "pulse" : ""}"></span>
                <span>${state.launching ? "Launching" : "Status"}</span>
                  <span class="tiny launch-status-msg">${escapeHtml(state.launchMessage || "…")}</span>
                  ${!state.launching && state.launchMessage ? `<button type="button" class="ghost-btn tiny-btn" data-page="logs">Open logs</button>` : ""}
              </div>
              <div class="progress-bar slim">
                <div class="progress-fill ${state.launching ? "indeterminate" : ""}" style="width:${state.launching ? "40%" : "0%"}"></div>
              </div>`
                : ""
            }
            ${
              !state.launching && state.launchDetails
                ? `
              <div class="launch-details tiny" style="margin-top:8px;display:grid;gap:6px;">
                ${state.launchDetails.java ? `<div>Java: <strong>${escapeHtml(String((state.launchDetails as any).java))}</strong></div>` : ""}
                ${state.launchDetails.version ? `<div>Version: <strong>${escapeHtml(String((state.launchDetails as any).version))}</strong></div>` : ""}
                ${state.launchDetails.loader ? `<div>Loader: <strong>${escapeHtml(String((state.launchDetails as any).loader))}</strong></div>` : ""}
                ${state.launchDetails.cwd ? `<div>Work dir: <strong>${escapeHtml(String((state.launchDetails as any).cwd))}</strong></div>` : ""}
                ${state.launchDetails.code !== undefined ? `<div>Exit code: <strong>${escapeHtml(String((state.launchDetails as any).code))}</strong></div>` : ""}
              </div>`
                : ""
            }
            ${
              progress
                ? `
              <div class="launch-status-row">
                <span>${escapeHtml(progress.phase)}</span>
                <span class="tiny">${escapeHtml(progress.message)}</span>
              </div>
              <div class="progress-bar slim">
                <div class="progress-fill" style="width:${installPct}%"></div>
              </div>`
                : ""
            }
          </div>`
            : `<div class="launch-status-hint ${installed ? "ok" : "warn"}">
                <span class="status-dot"></span>
                ${installed ? "Ready to launch" : "Install required before playing"}
              </div>`
        }

        <button
          type="button"
          class="play-advanced-toggle"
          data-action="play-advanced-toggle"
          aria-expanded="${state.playAdvancedOpen}"
        >
          <span>Advanced</span>
          <span class="version-caret ${state.playAdvancedOpen ? "open" : ""}">▾</span>
        </button>

        ${
          state.playAdvancedOpen
            ? `
          <div class="play-advanced">
            <div class="play-advanced-grid">
              <div class="adv-item"><span>Loader</span><strong>${loader}</strong></div>
              <div class="adv-item"><span>Java</span><strong>${escapeHtml(state.javaLabel)}</strong></div>
              <div class="adv-item"><span>Instance</span><strong>${escapeHtml(profile)}</strong></div>
            </div>
            <label class="ram-row-compact" for="ram-slider">
              <span>Memory · <strong id="ram-value">${ram} MB</strong></span>
              <input type="range" id="ram-slider" min="1024" max="8192" step="256" value="${ram}" />
            </label>
            ${
              installed
                ? `<button type="button" class="ghost-btn tiny-btn" data-action="verify-current">Verify files</button>`
                : ""
            }
          </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
