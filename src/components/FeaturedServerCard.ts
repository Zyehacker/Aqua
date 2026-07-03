import type { FeaturedServer } from "../types/api";
import { iconImg } from "../utils/icons";

export function renderServerCard(server: FeaturedServer): string {
  const banner = server.banner_url ?? server.banner;
  const logo = server.logo_url ?? server.logo;
  const players = server.player_count ?? server.players ?? 0;
  const max = server.max_players;
  const version = server.version ?? "Any";
  const tags = server.tags ?? [];

  return `
    <article class="server-card float-card radius-news panel-soft">
      <div class="server-banner" ${banner ? `style="background-image:url('${banner}')"` : ""}>
        <div class="server-banner-shade"></div>
        ${logo ? `<img class="server-logo" src="${logo}" alt="" loading="lazy" />` : `<div class="server-logo server-logo-fallback">${iconImg("server.svg")}</div>`}
      </div>
      <div class="server-body">
        <div class="server-head">
          <h3>${escapeHtml(server.name)}</h3>
          <span class="pill">${players}${max ? ` / ${max}` : ""} online</span>
        </div>
        <p>${escapeHtml(server.description ?? "")}</p>
        <div class="server-meta">
          <span class="tag">${escapeHtml(version)}</span>
          ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>
        <button
          type="button"
          class="primary-btn server-join"
          data-action="join-server"
          data-address="${escapeAttr(server.address ?? "")}"
        >
          ${iconImg("play.svg")} Join
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
