import { state } from "../types/state";
import { renderPlayCard } from "../components/PlayCard";
import { renderNewsCard } from "../components/NewsCard";
import { renderServerCard } from "../components/FeaturedServerCard";
import { iconImg } from "../utils/icons";
import { baseMcVersion } from "../utils/format";

function emptyBlock(icon: string, title: string, hint: string): string {
  return `
    <div class="empty-state empty-state-rich panel-soft">
      <div class="empty-icon">${iconImg(icon)}</div>
      <p><strong>${title}</strong></p>
      <p class="tiny">${hint}</p>
    </div>`;
}

export function renderHome(): string {
  const latest = baseMcVersion(state.settings.version);

  return `
    <div class="home-mosaic page-enter">
      <div class="home-top">
        <div class="mosaic-main">
          ${renderPlayCard()}
        </div>

        <div class="mosaic-side">
          <section class="panel-flat quick-card">
            <p class="eyebrow">Quick actions</p>
            <div class="quick-grid">
              <button type="button" class="quick-tile" data-page="versions">
                <span class="quick-icon">${iconImg("plus.svg")}</span>
                <span>New instance</span>
              </button>
              <button type="button" class="quick-tile" data-page="mods" data-mod-tab="browse">
                <span class="quick-icon">${iconImg("puzzle-piece.svg")}</span>
                <span>Browse mods</span>
              </button>
              <button type="button" class="quick-tile" data-action="repair">
                <span class="quick-icon">${iconImg("wrench.svg")}</span>
                <span>Repair</span>
              </button>
              <button type="button" class="quick-tile" data-action="open-instance-folder">
                <span class="quick-icon">${iconImg("folder-open.svg")}</span>
                <span>Open folder</span>
              </button>
            </div>
          </section>

          <section class="panel-soft announce-card">
            <p class="eyebrow">Announcements</p>
            <div class="announce-item">
              <strong>Latest stable</strong>
              <p>Minecraft ${escapeHtml(latest)} with automatic Fabric.</p>
            </div>
          </section>

          <section class="panel-soft activity-card">
            <p class="eyebrow">Recent activity</p>
            ${
              state.userProfiles.length
                ? `<ul class="activity-list">
                    ${state.userProfiles
                      .slice(0, 4)
                      .map(
                        (profile) => `
                    <li>
                      <span>${iconImg("cube.svg")}</span>
                      <div>
                        <strong>${escapeHtml(profile.name)}</strong>
                        <span class="tiny">${escapeHtml(profile.loader)} · ${escapeHtml(profile.version)}</span>
                      </div>
                    </li>`
                      )
                      .join("")}
                  </ul>`
                : emptyBlock(
                    "activity.svg",
                    "No recent activity",
                    "Install a version or browse mods to get started."
                  )
            }
          </section>
        </div>
      </div>

      <section class="mosaic-row">
        <div class="section-head">
          <div>
            <p class="eyebrow">News</p>
            <h2>Updates</h2>
          </div>
        </div>
        <div class="news-grid">
          ${
            state.news.length
              ? state.news.map(renderNewsCard).join("")
              : emptyBlock(
                  "globe.svg",
                  "No announcements",
                  "News and updates will appear here when published."
                )
          }
        </div>
      </section>

      <section class="mosaic-row mosaic-offset">
        <div class="section-head">
          <div>
            <p class="eyebrow">Multiplayer</p>
            <h2>Featured servers</h2>
          </div>
        </div>
        <div class="server-grid">
          ${
            state.servers.length
              ? state.servers.map(renderServerCard).join("")
              : emptyBlock(
                  "server.svg",
                  "No featured servers",
                  "Community servers will be highlighted here soon."
                )
          }
        </div>
      </section>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
