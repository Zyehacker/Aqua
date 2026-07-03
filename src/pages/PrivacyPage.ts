import { PRIVACY_SECTIONS } from "../services/privacy";

export function renderPrivacy(): string {
  return `
    <div class="privacy-overlay page-enter">
      <div class="privacy-modal glass-card">
        <div class="privacy-head">
          <p class="eyebrow">Before you continue</p>
          <h2>Privacy Policy</h2>
          <p class="tiny">You must accept the privacy policy to use Aqua Client.</p>
        </div>

        <div class="privacy-scroll">
          ${PRIVACY_SECTIONS.map(
            (s) => `
            <section>
              <h3>${s.title}</h3>
              <p>${s.body}</p>
            </section>`
          ).join("")}
        </div>

        <div class="privacy-actions">
          <button type="button" class="ghost-btn" data-action="privacy-decline">Decline & exit</button>
          <button type="button" class="primary-btn" data-action="privacy-accept">I agree</button>
        </div>
      </div>
    </div>
  `;
}
