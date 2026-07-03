import { state } from "../types/state";
import { iconImg } from "../utils/icons";

export function renderTopBar(): string {
  const accountName = state.account?.username ?? state.settings.username;

  return `
    <header class="topbar glass-bar topbar-compact" data-tauri-drag-region>
      <div class="topbar-search">
        <span class="search-icon" aria-hidden="true">${iconImg("activity.svg", "")}</span>
        <input
          type="search"
          id="global-search"
          placeholder="Search…"
          value="${escapeAttr(state.globalSearch)}"
          autocomplete="off"
        />
      </div>

      <div class="topbar-right">
        <button type="button" class="topbar-icon-btn notif-btn" data-action="notifications" title="Notifications" aria-label="Notifications">
          ${iconImg("alert-circle.svg")}
          <span class="notif-dot" aria-hidden="true"></span>
        </button>

        ${
          state.account
            ? renderAccountPill(accountName)
            : renderMicrosoftLogin()
        }

        ${
          state.frameless
            ? `<div class="window-controls">
                <button type="button" class="win-btn" data-action="win-minimize" title="Minimize">−</button>
                <button type="button" class="win-btn" data-action="win-maximize" title="Maximize">□</button>
                <button type="button" class="win-btn win-close" data-action="win-close" title="Close">×</button>
              </div>`
            : ""
        }
      </div>
    </header>
  `;
}

function renderMicrosoftLogin(): string {
  return `
    <button type="button" class="ms-login-btn" data-action="msa-login">
      <span class="ms-login-icon" aria-hidden="true">
        <svg viewBox="0 0 21 21" width="18" height="18" fill="currentColor">
          <rect x="1" y="1" width="9" height="9"></rect>
          <rect x="11" y="1" width="9" height="9"></rect>
          <rect x="1" y="11" width="9" height="9"></rect>
          <rect x="11" y="11" width="9" height="9"></rect>
        </svg>
      </span>
      <span class="ms-login-label">Sign in with Microsoft</span>
    </button>
  `;
}

function renderAccountPill(name: string): string {
  return `
    <div class="account-wrap">
      <button type="button" class="login-pill login-pill-compact" data-action="account-toggle">
        <span class="avatar-chip">${name.charAt(0).toUpperCase()}</span>
        <span class="account-copy">
          <strong>${escapeHtml(name)}</strong>
        </span>
      </button>
      ${
        state.accountMenuOpen
          ? `<div class="account-menu glass-pop">
              <button type="button" class="ghost-btn menu-item" data-page="profile">${iconImg("user.svg")} Profile</button>
              <button type="button" class="ghost-btn menu-item" data-action="msa-logout">${iconImg("log-out.svg")} Sign out</button>
            </div>`
          : ""
      }
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
