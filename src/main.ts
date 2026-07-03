import { bindEvents, loadInitialData, setRerender, setupTauriListeners } from "./bindings/events";
import { renderLayout, renderPage } from "./layouts/AppLayout";
import { renderSidebar } from "./components/Sidebar";
import { renderTopBar } from "./components/TopBar";
import { state } from "./types/state";

const app = document.querySelector<HTMLDivElement>("#app")!;
const splash = document.querySelector<HTMLDivElement>("#splash");
let renderedFrame = false;
let lastPrivacyAccepted = state.privacyAccepted;

function render(): void {
  const needsFrame =
    !renderedFrame ||
    lastPrivacyAccepted !== state.privacyAccepted ||
    !app.querySelector(".app-frame");

  if (needsFrame) {
    app.innerHTML = renderLayout(state);
    renderedFrame = true;
    lastPrivacyAccepted = state.privacyAccepted;
    bindEvents(app);
    return;
  }

  const sidebar = app.querySelector<HTMLElement>(".sidebar-rail");
  const topbar = app.querySelector<HTMLElement>(".topbar");
  const main = app.querySelector<HTMLElement>("#main-scroll");

  if (sidebar) sidebar.outerHTML = renderSidebar();
  if (topbar) topbar.outerHTML = renderTopBar();
  if (main) main.innerHTML = renderPage(state);

  bindEvents(app);
}

window.addEventListener("aqua:lazy-page-ready", render);

async function runSplash(): Promise<void> {
  return new Promise((resolve) => {
    const fill = splash?.querySelector<HTMLElement>(".splash-fill");
    if (fill) {
      let w = 0;
      const id = setInterval(() => {
        w = Math.min(100, w + 4);
        fill.style.width = `${w}%`;
        if (w >= 100) clearInterval(id);
      }, 40);
    }
    setTimeout(() => {
      splash?.classList.add("hide");
      resolve();
    }, 1800);
  });
}

async function boot(): Promise<void> {
  setRerender(render);
  setupTauriListeners();
  await runSplash();
  await loadInitialData();
  render();
}

boot();
