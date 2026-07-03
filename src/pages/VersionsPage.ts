import { state } from "../types/state";
import { selectableVersions } from "../utils/versions";
import { iconImg } from "../utils/icons";

export function renderVersions(): string {
  const allowed = selectableVersions();
  const query = state.versionsSearch.trim().toLowerCase();
  const list = query ? allowed.filter((v) => v.includes(query)) : allowed;

  return `
    <div class="page-enter">
      <div class="page-head">
        <div>
          <p class="eyebrow">Install</p>
          <h2>Versions</h2>
          <p class="tiny">Fabric is installed automatically for supported releases.</p>
        </div>
      </div>

      <div class="search-row">
        <input
          type="search"
          id="versions-search"
          placeholder="Search supported versions…"
          value="${escapeAttr(state.versionsSearch)}"
        />
      </div>

      <div class="version-install-grid">
        ${list.map((v) => renderVersionRow(v)).join("")}
      </div>
    </div>
  `;
}

function renderVersionRow(version: string): string {
  const installed =
    state.installedVersions.includes(version) ||
    state.installedVersions.some((id) => id.endsWith(version));

  return `
    <article class="version-row glass-card float-card">
      <div class="version-row-main">
        ${iconImg("download.svg")}
        <div>
          <strong>Minecraft ${version}</strong>
          <p class="tiny">Fabric loader · automatic</p>
        </div>
      </div>
      <div class="version-row-actions">
        <span class="pill ${installed ? "ok-pill" : ""}">${installed ? "Installed" : "Not installed"}</span>
        <button
          type="button"
          class="primary-btn"
          data-action="install-version"
          data-version="${version}"
          ${state.installProgress ? "disabled" : ""}
        >
          ${installed ? "Reinstall" : "Install"}
        </button>
        ${
          state.settings.version !== version
            ? `<button type="button" class="ghost-btn" data-action="select-version" data-version="${version}">Select</button>`
            : ""
        }
      </div>
    </article>
  `;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
