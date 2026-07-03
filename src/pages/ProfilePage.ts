import { state } from "../types/state";
import type { MinecraftCosmeticProfile } from "../types/api";
import { iconImg } from "../utils/icons";
import {
  activeSkinUrl,
  offlineSkinPreview,
  skinPreviewUrl,
} from "../services/minecraftCosmetics";

export function renderProfile(): string {
  const account = state.account;
  const cosmetics = state.mcCosmetics;
  const username = account?.username ?? state.settings.username;
  const uuid = account?.uuid ?? "Not signed in";
  const loading = state.mcCosmeticsLoading;
  const error = state.mcCosmeticsError;
  const activeSkin = activeSkinUrl(cosmetics);
  const activeCape = cosmetics?.capes.find((cape) => cape.active) ?? null;
  const launcherAvatar = account
    ? `https://crafatar.com/avatars/${account.uuid.replace(/-/g, "")}?overlay&size=96`
    : `https://minotar.net/avatar/${encodeURIComponent(username)}/96.png`;

  const preview = account
    ? cosmetics
      ? activeSkin
        ? `<img class="skin-render" src="${skinPreviewUrl(account.uuid, 200)}" alt="" loading="lazy" />`
        : `<img class="skin-render" src="${skinPreviewUrl(account.uuid, 200)}" alt="" loading="lazy" />`
      : `<div class="skin-skeleton"></div>`
    : `<img class="skin-render offline" src="${offlineSkinPreview(username, 200)}" alt="" loading="lazy" />`;

  return `
    <div class="page-enter profile-page">
      <div class="page-head">
        <div>
          <p class="eyebrow">Minecraft account</p>
          <h2>Profile</h2>
        </div>
        ${
          account
            ? `<button type="button" class="ghost-btn" data-action="refresh-cosmetics" ${loading ? "disabled" : ""}>
                ${iconImg("refresh.svg")} Refresh
              </button>`
            : ""
        }
      </div>

      <div class="profile-layout profile-layout-pro">
        <section class="profile-hero glass-card radius-play">
          <div class="profile-skin-stage">
            ${preview}
            <div class="skin-stage-glow"></div>
          </div>
          <div class="profile-identity">
            <div class="profile-title-row">
              <img class="launcher-avatar" src="${launcherAvatar}" alt="" loading="lazy" />
              <div>
                <h3>${escapeHtml(username)}</h3>
                <p class="tiny">${account ? "Signed in with Microsoft" : "Microsoft account not connected"}</p>
              </div>
            </div>
            <div class="profile-status-grid">
              ${renderStatus("Microsoft", account ? "Connected" : "Not signed in", account ? "ok" : "warn")}
              ${renderStatus("Minecraft username", username, account ? "ok" : "")}
              ${renderStatus("UUID", uuid, account ? "" : "muted")}
              ${renderStatus("Current cape", activeCape?.alias ?? "None equipped", activeCape ? "ok" : "muted")}
            </div>
          </div>
          <div class="profile-actions-row">
            ${
              account
                ? `<button type="button" class="primary-btn" data-action="refresh-cosmetics" ${loading ? "disabled" : ""}>
                    ${iconImg("refresh.svg")} Refresh official profile
                  </button>`
                : `<button type="button" class="ms-login-btn ms-login-prominent" data-action="msa-login">
                    <span class="ms-login-icon" aria-hidden="true">
                      <svg viewBox="0 0 21 21" width="18" height="18" fill="currentColor">
                        <rect x="1" y="1" width="9" height="9"></rect>
                        <rect x="11" y="1" width="9" height="9"></rect>
                        <rect x="1" y="11" width="9" height="9"></rect>
                        <rect x="11" y="11" width="9" height="9"></rect>
                      </svg>
                    </span>
                    <span>Sign in with Microsoft</span>
                  </button>`
            }
          </div>
          ${
            error
              ? `<p class="profile-error tiny">${escapeHtml(error)}</p>`
              : loading
                ? `<p class="tiny muted">Loading profile…</p>`
                : ""
          }
        </section>

        <section class="skin-manager glass-card radius-settings">
          <div class="profile-section-head">
            <div>
              <p class="eyebrow">Skin manager</p>
              <h3>Official skin</h3>
            </div>
            ${activeSkin ? `<span class="pill ok-pill">Current skin loaded</span>` : `<span class="pill muted-pill">No official skin data</span>`}
          </div>
          <div class="skin-manager-grid">
            <div class="skin-preview-panel">
              <p class="tiny">Current skin preview</p>
              <div class="skin-preview-frame">
                ${preview}
              </div>
            </div>
            <div class="skin-preview-panel">
              <p class="tiny">PNG preview before upload</p>
              <div class="skin-preview-frame skin-upload-frame">
                ${
                  state.skinUploadPreviewUrl
                    ? `<img class="skin-upload-preview" src="${state.skinUploadPreviewUrl}" alt="" />`
                    : `<div class="skin-upload-empty">${iconImg("user.svg")}<span>Select a PNG skin</span></div>`
                }
              </div>
            </div>
            <div class="skin-controls-panel">
              <label class="field-label">Model
                <div class="segmented-control">
                  <button type="button" class="${state.skinUploadModel === "CLASSIC" ? "active" : ""}" data-action="skin-model" data-model="CLASSIC">Steve</button>
                  <button type="button" class="${state.skinUploadModel === "SLIM" ? "active" : ""}" data-action="skin-model" data-model="SLIM">Alex</button>
                </div>
              </label>
              <input id="skin-file-input" type="file" accept="image/png" hidden />
              <button type="button" class="ghost-btn" data-action="pick-skin-png">${iconImg("folder-open.svg")} Upload PNG</button>
              <button type="button" class="primary-btn" data-action="confirm-skin-upload" ${!account || !state.skinUploadPreviewUrl || state.skinUploadPending ? "disabled" : ""}>
                ${state.skinUploadPending ? "Preparing…" : "Confirm upload"}
              </button>
              <button type="button" class="ghost-btn" data-action="change-skin">${iconImg("globe.svg")} Open official profile</button>
              <p class="tiny">
                ${state.skinUploadName ? `Selected: ${escapeHtml(state.skinUploadName)}` : "PNG upload is staged locally until official backend support is available."}
              </p>
              ${state.skinUploadError ? `<p class="profile-error tiny">${escapeHtml(state.skinUploadError)}</p>` : ""}
            </div>
          </div>
        </section>

        <section class="profile-capes glass-card radius-settings">
          <div class="profile-section-head">
            <div>
              <p class="eyebrow">Cosmetics</p>
              <h3>Official capes</h3>
            </div>
            <span class="pill muted-pill">Owned capes only</span>
          </div>

          ${
            !account
              ? `<div class="empty-state">
                  <p>Sign in with Microsoft to view capes linked to your account.</p>
                  <p class="tiny">Only official Minecraft capes you already own can be equipped here.</p>
                </div>`
              : loading
                ? `<div class="empty-state"><p>Loading capes…</p></div>`
                : renderCapes(cosmetics)
          }
        </section>
      </div>
    </div>
  `;
}

function renderStatus(label: string, value: string, tone: "ok" | "warn" | "muted" | "" = ""): string {
  return `
    <div class="profile-status ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderCapes(cosmetics: MinecraftCosmeticProfile | null): string {
  if (!cosmetics?.capes.length) {
    return `<div class="empty-state">
      <p>No official capes on this account.</p>
      <p class="tiny">Capes earned through Minecraft events and promotions appear here when available.</p>
    </div>`;
  }

  return `<div class="cape-grid">
    ${cosmetics.capes
      .map(
        (cape) => `
      <article class="cape-card ${cape.active ? "active" : ""}">
        <div class="cape-preview">
          <img src="${cape.url}" alt="" loading="lazy" />
        </div>
        <div class="cape-meta">
          <strong>${escapeHtml(cape.alias)}</strong>
          ${
            cape.active
              ? `<span class="pill ok-pill">Equipped</span>`
              : `<button
                  type="button"
                  class="ghost-btn cape-equip"
                  data-action="equip-cape"
                  data-cape-id="${escapeAttr(cape.id)}"
                >Equip</button>`
          }
        </div>
      </article>`
      )
      .join("")}
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
