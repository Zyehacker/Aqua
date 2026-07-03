import { state } from "../types/state";
import { iconImg } from "../utils/icons";

export function renderLogs(): string {
  return `
    <div class="page-enter logs-page">
      <div class="page-head">
        <div>
          <p class="eyebrow">Diagnostics</p>
          <h2>Launcher logs</h2>
          <p class="tiny">Live output from Minecraft and the launcher.</p>
        </div>
        <div class="logs-actions">
          <button type="button" class="ghost-btn" data-action="clear-logs">Clear</button>
          <button type="button" class="ghost-btn" data-action="copy-logs">Copy</button>
        </div>
      </div>

      <div class="logs-panel glass-card" id="logs-panel">
        ${
          state.logLines.length
            ? state.logLines.map(renderLine).join("")
            : `<div class="logs-empty">Launch Minecraft or run an install to see logs here.</div>`
        }
      </div>
    </div>
  `;
}

function renderLine(entry: (typeof state.logLines)[0]): string {
  return `<div class="log-line log-${entry.stream}"><time>${entry.time}</time><span>${escapeHtml(entry.line)}</span></div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
