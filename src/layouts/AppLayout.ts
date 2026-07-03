import type { LauncherState } from "../types/state";
import { renderSidebar } from "../components/Sidebar";
import { renderTopBar } from "../components/TopBar";
import { renderHome } from "../pages/HomePage";
import { renderPrivacy } from "../pages/PrivacyPage";

type LazyRenderer = () => string;

const pageModules: Partial<Record<LauncherState["page"], LazyRenderer>> = {};
const pageLoads: Partial<Record<LauncherState["page"], Promise<void>>> = {};

const lazyPages = {
  profile: () => import("../pages/ProfilePage").then((m) => m.renderProfile),
  instances: () => import("../pages/InstancesPage").then((m) => m.renderInstances),
  mods: () => import("../pages/ModsPage").then((m) => m.renderMods),
  versions: () => import("../pages/VersionsPage").then((m) => m.renderVersions),
  logs: () => import("../pages/LogsPage").then((m) => m.renderLogs),
  settings: () => import("../pages/SettingsPage").then((m) => m.renderSettings),
  about: () => import("../pages/AboutPage").then((m) => m.renderAbout),
} satisfies Partial<Record<LauncherState["page"], () => Promise<LazyRenderer>>>;

function renderLazyPage(page: LauncherState["page"]): string {
  const renderer = pageModules[page];
  if (renderer) return renderer();

  const load = lazyPages[page as keyof typeof lazyPages];
  if (!load) return renderHome();

  if (!pageLoads[page]) {
    pageLoads[page] = load().then((render) => {
      pageModules[page] = render;
      window.dispatchEvent(new Event("aqua:lazy-page-ready"));
    });
  }

  return `<div class="page-enter empty-state glass-card lazy-page-state">Loading page…</div>`;
}

export function renderPage(state: LauncherState): string {
  if (!state.privacyAccepted) return renderPrivacy();

  switch (state.page) {
    case "home":
      return renderHome();
    case "profile":
    case "instances":
    case "mods":
    case "versions":
    case "logs":
    case "settings":
    case "about":
      return renderLazyPage(state.page);
    case "privacy":
      return renderPrivacy();
    default:
      return renderHome();
  }
}

export function renderLayout(state: LauncherState): string {
  if (!state.privacyAccepted) {
    return renderPrivacy();
  }

  return `
    <div class="app-frame">
      ${renderSidebar()}
      <div class="main-column">
        ${renderTopBar()}
        <main class="main-scroll" id="main-scroll">
          ${renderPage(state)}
        </main>
      </div>
    </div>
  `;
}
