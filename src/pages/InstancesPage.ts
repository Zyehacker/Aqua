import { state } from "../types/state";
import { iconImg } from "../utils/icons";

const LIST_RENDER_LIMIT = 96;

export function renderInstances(): string {
  const profiles = state.userProfiles;
  const query = state.globalSearch.trim().toLowerCase();
  const filtered = query
    ? profiles.filter((p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query))
    : profiles;

  // Sort: favorites first, then by last played, then by created date
  const sorted = filtered.sort((a, b) => {
    if ((a.favorite ?? false) !== (b.favorite ?? false)) {
      return (b.favorite ?? false) ? 1 : -1;
    }
    const aTime = new Date(a.lastPlayed || a.createdAt).getTime();
    const bTime = new Date(b.lastPlayed || b.createdAt).getTime();
    return bTime - aTime;
  });
  const visible = sorted.slice(0, LIST_RENDER_LIMIT);

  return `
    <div class="page-enter">
      <div class="page-head">
        <div>
          <p class="eyebrow">Library</p>
          <h2>Instances</h2>
          <p class="tiny">Instances you create appear here. Install a version to get started.</p>
        </div>
        <div style="display:grid;gap:8px;width:260px">
          <input id="instance-search" type="search" class="search" placeholder="Search instances…" value="${escapeAttr(state.globalSearch)}" />
          <div style="display:flex;gap:8px">
            <button type="button" class="primary-btn" data-page="versions">${iconImg("plus.svg")} Create</button>
            <button type="button" class="ghost-btn" data-action="open-mods-folder">${iconImg("folder-open.svg")} Mods</button>
          </div>
        </div>
      </div>

      ${
        sorted.length
          ? `<div class="instance-grid">
          ${visible.map(renderInstanceCard).join("")}
          ${sorted.length > visible.length ? renderListLimitNote(sorted.length, visible.length) : ""}
        </div>`
          : `<div class="empty-state glass-card instances-empty">
          <p>No instances yet</p>
          <p class="tiny">Go to Versions, install Minecraft with Fabric, and your instance will show up here.</p>
          <button type="button" class="primary-btn" data-page="versions">Install a version</button>
        </div>`
      }

      ${
        state.renameInstanceId
          ? `
          <div class="modal-overlay" data-action="close-rename-modal">
            <div class="modal-panel glass-card" onclick="event.stopPropagation()">
              <h3>Rename Instance</h3>
              <input type="text" id="rename-input" class="search" value="${escapeAttr(state.renameInstanceName)}" placeholder="New name…" />
              <div style="display:flex;gap:8px;margin-top:16px">
                <button type="button" class="primary-btn" data-action="confirm-rename" style="flex:1">Rename</button>
                <button type="button" class="ghost-btn" data-action="close-rename-modal" style="flex:1">Cancel</button>
              </div>
            </div>
          </div>`
          : ""
      }
    </div>
  `;
}

function renderListLimitNote(total: number, visible: number): string {
  return `<div class="empty-state glass-card list-window-note">Showing ${visible.toLocaleString()} of ${total.toLocaleString()} instances. Use search to narrow the list.</div>`;
}

function renderInstanceCard(profile: (typeof state.userProfiles)[0]): string {
  const active = state.selectedInstanceId === profile.id;
  const lastPlayedDate = profile.lastPlayed ? new Date(profile.lastPlayed).toLocaleDateString() : "Never";
  const createdDate = new Date(profile.createdAt).toLocaleDateString();

  return `
    <article class="instance-tile glass-card float-card ${active ? "active" : ""} ${profile.favorite ? "favorite" : ""}">
      <div class="instance-tile-icon">${iconImg("cube.svg")}</div>
      <div class="instance-tile-body">
        <div style="display:flex;align-items:center;gap:8px">
          <h3>${escapeHtml(profile.name)}</h3>
          ${profile.favorite ? `<span class="favorite-badge">${iconImg("star.svg")}</span>` : ""}
        </div>
        <div class="instance-tile-meta">
          <span class="tag">${escapeHtml(profile.version)}</span>
          <span class="tag">${escapeHtml(profile.loader)}</span>
        </div>
        ${profile.description ? `<p class="tiny">${escapeHtml(profile.description)}</p>` : ""}
        <div class="instance-tile-dates">
          <span class="tiny">Last played: ${lastPlayedDate}</span>
          <span class="tiny">Created: ${createdDate}</span>
        </div>
      </div>
      <div class="instance-tile-actions">
        <button type="button" class="primary-btn" data-action="launch-instance" data-instance="${escapeAttr(profile.id)}">
          ${iconImg("play.svg")} Launch
        </button>
        <button type="button" class="ghost-btn" data-action="toggle-favorite" data-instance="${escapeAttr(profile.id)}" title="Toggle favorite">
          ★
        </button>
        <button type="button" class="ghost-btn" data-action="rename-instance" data-instance="${escapeAttr(profile.id)}">
          Rename
        </button>
        <button type="button" class="ghost-btn" data-action="duplicate-instance" data-instance="${escapeAttr(profile.id)}">Duplicate</button>
        <button type="button" class="ghost-btn" data-action="open-instance-folder" data-instance="${escapeAttr(profile.id)}">
          ${iconImg("folder.svg")}
        </button>
        <button type="button" class="danger-btn" data-action="remove-profile" data-instance="${escapeAttr(profile.id)}">
          ${iconImg("trash.svg")}
        </button>
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
