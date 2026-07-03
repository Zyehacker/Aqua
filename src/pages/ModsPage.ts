import { state } from "../types/state";
import { iconImg } from "../utils/icons";
import { formatBytes } from "../utils/format";
import { getModIcon } from "../services/modIcons";
import { activeMcVersion, activeProfileId } from "../utils/profile";

const CATEGORIES = [
  { id: "mods", label: "Mods" },
  { id: "texturepacks", label: "Resource packs" },
  { id: "shaders", label: "Shaders" },
];

const LIST_RENDER_LIMIT = 96;

export function renderMods(): string {
  const profileId = activeProfileId();
  const mcVersion = activeMcVersion();

  return `
    <div class="page-enter mods-page">
      <div class="page-head">
        <div>
          <p class="eyebrow">Modrinth</p>
          <h2>Mod Browser</h2>
          <p class="tiny">Profile <strong>${escapeHtml(profileId)}</strong> · Minecraft ${escapeHtml(mcVersion)}</p>
        </div>
        <div class="tabs">
          <button type="button" class="tab-btn ${state.modTab === "browse" ? "active" : ""}" data-mod-tab="browse">
            Browse
          </button>
          <button type="button" class="tab-btn ${state.modTab === "installed" ? "active" : ""}" data-mod-tab="installed">
            Installed
          </button>
        </div>
      </div>

      <div class="filter-row">
        ${CATEGORIES.map(
          (c) => `
          <button
            type="button"
            class="tab-btn ${state.modCategory === c.id ? "active" : ""}"
            data-mod-category="${c.id}"
          >${c.label}</button>`
        ).join("")}
      </div>

      ${
        state.modTab === "browse"
          ? renderBrowseMods(mcVersion)
          : renderInstalledMods()
      }
    </div>
  `;
}

function renderInstalledMods(): string {
  const filtered = state.mods.filter(
    (m) =>
      !state.modSearchQuery ||
      m.filename.toLowerCase().includes(state.modSearchQuery.toLowerCase())
  );
  const visible = filtered.slice(0, LIST_RENDER_LIMIT);

  return `
    <div class="mods-toolbar">
      <div class="search-row">
        <input type="search" id="mod-filter" placeholder="Filter installed…" value="${escapeAttr(state.modSearchQuery)}" />
        <button type="button" class="ghost-btn" data-action="add-mod-file">${iconImg("plus.svg")} Add file</button>
        <button type="button" class="ghost-btn" data-action="open-mods-folder">${iconImg("folder-open.svg")} Open folder</button>
      </div>
    </div>

    <div class="mod-browser-grid">
      ${
        visible.length
          ? `${visible.map(renderModRow).join("")}
             ${filtered.length > visible.length ? renderListLimitNote(filtered.length, visible.length) : ""}`
          : `<div class="empty-state glass-card">No mods installed for this profile yet. Switch to Browse to find mods on Modrinth.</div>`
      }
    </div>
  `;
}

function renderModRow(mod: (typeof state.mods)[0]): string {
  const icon = getModIcon(mod.filename);

  return `
    <article class="mod-browser-card glass-card">
      ${
        icon
          ? `<img class="mod-browser-icon" src="${icon}" alt="" loading="lazy" />`
          : `<div class="mod-browser-icon mod-browser-icon-fallback">${iconImg("puzzle-piece.svg")}</div>`
      }
      <div class="mod-browser-body">
        <h3>${escapeHtml(mod.filename)}</h3>
        <p class="tiny">${formatBytes(mod.size)} · ${mod.enabled ? "Enabled" : "Disabled"}</p>
        <div class="mod-browser-actions">
          <button
            type="button"
            class="ghost-btn"
            data-action="toggle-mod"
            data-filename="${escapeAttr(mod.filename)}"
            data-enabled="${mod.enabled ? "0" : "1"}"
          >${mod.enabled ? "Disable" : "Enable"}</button>
          <button
            type="button"
            class="danger-btn"
            data-action="delete-mod"
            data-filename="${escapeAttr(mod.filename)}"
          >Remove</button>
        </div>
      </div>
    </article>
  `;
}

function renderBrowseMods(mcVersion: string): string {
  const visible = state.modrinthResults.slice(0, LIST_RENDER_LIMIT);

  return `
    <div class="mods-toolbar">
      <div class="search-row">
        <input
          type="search"
          id="modrinth-search"
          placeholder="Search mods, shaders, resource packs…"
          value="${escapeAttr(state.modSearchQuery)}"
          autofocus
        />
        <button type="button" class="primary-btn" data-action="search-modrinth" ${state.modBrowserLoading ? "disabled" : ""}>
          ${state.modBrowserLoading ? "Searching…" : "Search"}
        </button>
      </div>
      <p class="tiny">Results for Minecraft ${escapeHtml(mcVersion)} · Fabric</p>
      ${state.modBrowserError ? `<p class="error-text">${escapeHtml(state.modBrowserError)}</p>` : ""}
    </div>

    <div class="mod-browser-grid">
      ${
        state.modBrowserLoading
          ? `<div class="empty-state glass-card">Searching Modrinth…</div>`
          : state.modrinthResults.length
            ? `${visible.map(renderModrinthCard).join("")}
               ${state.modrinthResults.length > visible.length ? renderListLimitNote(state.modrinthResults.length, visible.length) : ""}`
            : `<div class="empty-state glass-card">Search Modrinth to discover and install content. Try "sodium", "lithium", or "iris".</div>`
      }
    </div>
  `;
}

function renderListLimitNote(total: number, visible: number): string {
  return `<div class="empty-state glass-card list-window-note">Showing ${visible.toLocaleString()} of ${total.toLocaleString()} items. Use search to narrow the list.</div>`;
}

function renderModrinthCard(mod: (typeof state.modrinthResults)[0]): string {
  const isCompatible = mod.game_versions.includes(activeMcVersion()) && 
                       (state.settings.loader_type === "fabric" ? mod.loaders.includes("fabric") : true);
  const compatibilityBadge = isCompatible ? "✓ Compatible" : mod.game_versions.includes(activeMcVersion()) ? "⚠ Check loader" : "✗ Version";
  const compatibilityClass = isCompatible ? "compatible" : mod.game_versions.includes(activeMcVersion()) ? "partial" : "incompatible";

  return `
    <article class="mod-browser-card glass-card">
      <div class="mod-card-header">
        ${
          mod.icon_url
            ? `<img class="mod-card-icon" src="${mod.icon_url}" alt="" loading="lazy" />`
            : `<div class="mod-card-icon mod-card-icon-fallback">${iconImg("puzzle-piece.svg")}</div>`
        }
        <div class="mod-card-title-group">
          <h3>${escapeHtml(mod.title)}</h3>
          <span class="compatibility-badge ${compatibilityClass}">${compatibilityBadge}</span>
        </div>
      </div>
      <div class="mod-card-meta">
        <span class="tiny">Category: <strong>${escapeHtml(mod.project_type)}</strong></span>
        <span class="tiny">Downloads: <strong>${mod.downloads.toLocaleString()}</strong></span>
      </div>
      <p class="mod-card-desc">${escapeHtml(mod.description)}</p>
      <div class="mod-card-tags">
        ${mod.game_versions.slice(0, 3).map((v) => `<span class="tag">${escapeHtml(v)}</span>`).join("")}
        ${mod.loaders.map((l) => `<span class="tag">${escapeHtml(l)}</span>`).join("")}
      </div>
      <div class="mod-card-actions">
        <button
          type="button"
          class="primary-btn"
          data-action="install-modrinth"
          data-project="${escapeAttr(mod.id)}"
          data-icon="${escapeAttr(mod.icon_url ?? "")}"
        >Install</button>
        <button type="button" class="ghost-btn" data-external="${escapeAttr(mod.page_url)}">Details</button>
      </div>
    </article>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
