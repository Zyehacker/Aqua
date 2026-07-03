import { state } from "../types/state";
import { iconImg } from "../utils/icons";

const NAV = [
  { id: "home", label: "Home", icon: "home.svg" },
  { id: "profile", label: "Profile", icon: "user.svg" },
  { id: "instances", label: "Instances", icon: "cube.svg" },
  { id: "mods", label: "Mod Browser", icon: "puzzle-piece.svg" },
  { id: "versions", label: "Versions", icon: "download.svg" },
  { id: "logs", label: "Logs", icon: "terminal.svg" },
  { id: "settings", label: "Settings", icon: "settings.svg" },
  { id: "about", label: "About", icon: "globe.svg" },
] as const;

const SOCIAL = [
  { id: "discord", label: "Discord", icon: "server.svg", url: "https://discord.gg/aeavxn8BAe" },
  { id: "kofi", label: "Ko-fi", icon: "cloud-download.svg", url: "https://ko-fi.com/Zyehacker" },
];

export function renderSidebar(): string {
  return `
    <aside class="rail sidebar-rail">
      <div class="brand">
        <img class="brand-icon" src="/official.png" alt="" width="40" height="40" />
        <div class="brand-copy">
          <h1>Aqua</h1>
          <p>Launcher</p>
        </div>
      </div>

      <div class="section-label">Navigate</div>
      <nav class="nav-list sidebar-nav" aria-label="Main">
        ${NAV.map(
          (item) => `
          <button
            type="button"
            class="nav-btn ${state.page === item.id ? "active" : ""}"
            data-page="${item.id}"
            aria-current="${state.page === item.id ? "page" : "false"}"
          >
            <span class="nav-btn-left">
              ${iconImg(item.icon)}
              <span>${item.label}</span>
            </span>
          </button>`
        ).join("")}
      </nav>

      <div class="rail-footer sidebar-community">
        <div class="community-divider"></div>
        <div class="section-label">Community</div>
        <div class="social-actions">
          ${SOCIAL.map(
            (s) => `
            <button type="button" class="social-btn social-btn-secondary" data-external="${s.url}">
              ${iconImg(s.icon)}
              <span>${s.label}</span>
            </button>`
          ).join("")}
        </div>
      </div>
    </aside>
  `;
}
