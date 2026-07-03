import { state } from "../types/state";

export function renderAbout(): string {
  return `
    <div class="page-enter about-page">
      <div class="about-hero glass-card float-card">
        <img class="about-logo" src="/official.png" alt="" width="72" height="72" />
        <div>
          <p class="eyebrow">About</p>
          <h2>Aqua Client</h2>
          <p class="tiny">Version ${escapeHtml(state.appVersion)}</p>
        </div>
      </div>

      <div class="about-grid">
        <section class="glass-card float-card">
          <h3>Crafted for play</h3>
          <p>Aqua is a premium Minecraft launcher built with Tauri and Rust. Install Fabric versions, browse Modrinth, and launch quickly — with a calm, focused interface.</p>
        </section>

        <section class="glass-card float-card">
          <h3>Credits</h3>
          <p class="tiny">Minecraft is a trademark of Mojang Studios. Aqua is not affiliated with Mojang or Microsoft.</p>
        </section>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
