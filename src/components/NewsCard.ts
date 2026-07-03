import type { NewsItem } from "../types/api";
import { formatDate } from "../utils/format";

export function renderNewsCard(item: NewsItem): string {
  const image = item.image_url ?? item.image;
  const summary = item.summary ?? item.body ?? "";
  const date = formatDate(item.date ?? item.created_at);
  const category = item.category ?? "Update";

  return `
    <article class="news-card float-card radius-news panel-soft">
      ${image ? `<div class="news-media"><img src="${image}" alt="" loading="lazy" /></div>` : `<div class="news-media news-media-fallback"></div>`}
      <div class="news-body">
        <div class="news-meta-row">
          <span class="news-category">${escapeHtml(category)}</span>
          <time class="news-date">${date}</time>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="news-summary">${escapeHtml(summary)}</p>
        <button type="button" class="ghost-btn tiny-btn news-read" data-action="read-news" data-news-id="${item.id ?? ""}">
          Read more
        </button>
      </div>
    </article>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
