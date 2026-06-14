import "./styles/app.css";
import { state } from "./state";
import { renderSidebar } from "./components/Sidebar";
import { renderRightRail } from "./components/RightRail";
import { renderHome } from "./components/HomePage";
import { renderVersions } from "./components/VersionsPage";
import { renderMods } from "./components/ModsPage";
import { renderSettings } from "./components/SettingsPage";
import { renderSplash } from "./components/SplashScreen";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app");

const splash = document.getElementById("splash");

function render() {
  const rightRail = renderRightRail(state.page);

  root.innerHTML = `
    <div class="app-shell ${state.page !== "home" ? "no-right" : ""}">
      ${renderSidebar(state.page)}
      <main class="center-shell">
        <div class="center-top">
          <div class="center-copy">
            <div class="center-title">Aqua Client</div>
            <div class="center-subtitle">${state.selectedInstanceName || "Select an instance"}</div>
          </div>
          <div class="center-pills">
            <span class="info-pill ${state.installState === "installed" ? "ok" : "warn"}">${state.installLabel}</span>
            <span class="info-pill">${state.selectedLoader}</span>
          </div>
        </div>

        <div class="center-scroll">
          ${
            state.page === "home"
              ? renderHome()
              : state.page === "versions"
                ? renderVersions()
                : state.page === "mods"
                  ? renderMods()
                  : renderSettings()
          }
        </div>
      </main>
      ${rightRail}
    </div>
  `;

  bind();
}

function bind() {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", () => {
      state.page = (el as HTMLElement).dataset.page as any;
      render();
    });
  });

  document.querySelectorAll("[data-select-instance]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.selectInstance!;
      const inst = state.instances.find((x) => x.id === id);
      if (!inst) return;
      state.selectedInstanceId = id;
      state.selectedInstanceName = inst.name;
      state.selectedLoader = inst.loader;
      render();
    });
  });

  document.querySelectorAll("[data-action='splash-close']").forEach((el) => {
    el.addEventListener("click", () => {
      splash?.classList.add("hide");
    });
  });
}

setTimeout(() => {
  splash?.classList.add("hide");
  render();
}, 2200);

render();
