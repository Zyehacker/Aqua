const ICONS = {
  home: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 3l9 8.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5z"/></svg>`,
  instances: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
  mods: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>`,
  logs: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h8"/><path d="M8 12h8"/><path d="M8 18h5"/><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6 1.65 1.65 0 0 0 9.51 4H10a2 2 0 0 1 4 0h.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 8a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 15s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/><path d="M17 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`,
  kofi: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H8a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4z"/><path d="M10 9h4"/><path d="M10 14h4"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
};

export function renderLauncher(): string {
  return `
    <style>
      .launcher-root { min-height: 100vh; display: flex; flex-wrap: wrap; background: #1a1a1a; color: #ffffff; font-family: Inter, system-ui, sans-serif; padding: 16px; gap: 16px; }
      .launcher-sidebar { min-width: 240px; flex: 0 0 240px; display: flex; flex-direction: column; gap: 16px; background: #2a2a2a; border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .launcher-header { display: flex; align-items: center; gap: 12px; }
      .launcher-title { margin: 0; font-size: 18px; line-height: 1.2; }
      .launcher-subtitle { margin: 0; color: #888888; font-size: 12px; }
      .launcher-nav { display: grid; gap: 8px; margin-top: 8px; }
      .launcher-nav button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px; border-radius: 8px; border: 4px solid transparent; background: transparent; color: #ffffff; font-size: 12px; text-align: left; cursor: pointer; }
      .launcher-nav button.active { border-color: #0066ff; background: rgba(0,102,255,0.12); }
      .launcher-section-label { color: #888888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .launcher-community { display: grid; gap: 8px; }
      .launcher-community button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #ffffff; font-size: 12px; cursor: pointer; }
      .launcher-main { flex: 1 1 0; display: grid; gap: 16px; min-width: 0; }
      .launcher-topbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; background: #2a2a2a; border-radius: 12px; padding: 16px; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .launcher-search { flex: 1 1 320px; min-width: 220px; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.04); border: 1px solid transparent; border-radius: 8px; padding: 8px 12px; }
      .launcher-search input { border: none; outline: none; background: transparent; color: #ffffff; width: 100%; font-size: 14px; }
      .launcher-search input::placeholder { color: rgba(255,255,255,0.75); opacity: 0.5; }
      .launcher-search input:focus { border-color: transparent; }
      .launcher-search:focus-within { border-color: #0066ff; }
      .launcher-profile { display: flex; align-items: center; gap: 12px; background: #2a2a2a; border-radius: 12px; padding: 8px; min-width: 180px; }
      .launcher-avatar { width: 32px; height: 32px; border-radius: 8px; background: #0066ff; display: grid; place-items: center; color: #ffffff; font-weight: 700; }
      .launcher-hero, .launcher-panel { display: grid; gap: 16px; padding: 20px; border-radius: 12px; background: #2a2a2a; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .launcher-hero-info { display: grid; gap: 8px; }
      .launcher-play-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
      .launcher-primary-btn { height: 48px; min-width: 160px; padding: 0 24px; border-radius: 8px; border: none; background: #0066ff; color: #ffffff; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: filter 150ms ease; }
      .launcher-primary-btn:hover { filter: brightness(1.1); }
      .launcher-secondary-btn { height: 48px; min-width: 160px; padding: 0 24px; border-radius: 8px; border: 1px solid #888888; background: transparent; color: #ffffff; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
      .launcher-status-line { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; font-size: 12px; color: #ffffff; opacity: 0.9; }
      .launcher-status-mini { display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #888888; }
      .launcher-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
      .launcher-action-card { min-height: 80px; border-radius: 8px; padding: 12px; background: #2a2a2a; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; flex-direction: column; justify-content: center; text-align: left; }
      .launcher-action-card strong { display: block; font-size: 14px; margin-bottom: 4px; }
      .launcher-action-card span { font-size: 12px; color: #888888; }
      .launcher-panels { display: grid; grid-template-columns: 1.5fr 1fr; gap: 8px; width: 100%; }
      .launcher-panel h2 { margin: 0; font-size: 16px; }
      .launcher-announce-scroll { max-width: 280px; overflow-y: auto; display: grid; gap: 8px; padding-right: 4px; }
      .launcher-announce-item { border-radius: 8px; background: rgba(255,255,255,0.04); padding: 12px; font-size: 12px; color: #ffffff; }
      @media (max-width: 960px) { .launcher-side, .launcher-panels { display: block; } .launcher-panels { grid-template-columns: 1fr; } }
      @media (max-width: 640px) { .launcher-sidebar { flex: 1 1 100%; min-width: auto; } .launcher-topbar { flex-direction: column; } }
    </style>
    <div class="launcher-root">
      <aside class="launcher-sidebar">
        <div class="launcher-header">
          <div style="font-size:24px;color:#0066ff;">${ICONS.play}</div>
          <div>
            <h1 class="launcher-title">Aqua</h1>
            <p class="launcher-subtitle">Launcher</p>
          </div>
        </div>
        <div class="launcher-section-label">Navigate</div>
        <nav class="launcher-nav" aria-label="Main navigation">
          <button type="button" class="active">${ICONS.home}<span>Home</span></button>
          <button type="button">${ICONS.instances}<span>Instances</span></button>
          <button type="button">${ICONS.mods}<span>Mod Browser</span></button>
          <button type="button">${ICONS.logs}<span>Logs</span></button>
          <button type="button">${ICONS.settings}<span>Settings</span></button>
        </nav>
        <div class="launcher-section-label">Community</div>
        <div class="launcher-community">
          <button type="button" aria-label="Open Discord">${ICONS.discord}<span>Discord</span></button>
          <button type="button" aria-label="Open Ko-fi">${ICONS.kofi}<span>Ko-fi</span></button>
        </div>
      </aside>
      <div class="launcher-main">
        <header class="launcher-topbar">
          <div class="launcher-search">
            <span style="color:#888888;">${ICONS.search}</span>
            <input aria-label="Search" type="search" placeholder="Search…" />
          </div>
          <div class="launcher-profile">
            <div class="launcher-avatar">A</div>
            <div>
              <div style="font-size:14px;font-weight:700;">Alex</div>
              <div style="font-size:12px;color:#888888;">Online</div>
            </div>
          </div>
        </header>
        <section class="launcher-hero">
          <div class="launcher-hero-info">
            <span style="color:#888888;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Version info</span>
            <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
              <strong style="font-size:24px;">Minecraft 1.20.4</strong>
              <span style="color:#888888;font-size:14px;">Fabric Loader</span>
            </div>
          </div>
          <div class="launcher-play-row">
            <button type="button" class="launcher-primary-btn" aria-label="Launch game">${ICONS.play}<span style="margin-left:8px;">Play</span></button>
            <button type="button" class="launcher-secondary-btn" aria-label="Install current version">Install</button>
          </div>
          <div style="display:grid;gap:8px;">
            <div class="launcher-status-line"><span>Status</span><span style="color:#0066ff;">Ready</span></div>
            <div class="launcher-status-mini"><span>Profile: Default</span><span>RAM: 4096 MB</span></div>
          </div>
        </section>
        <section class="launcher-actions" aria-label="Quick actions">
          <button type="button" class="launcher-action-card" aria-label="New instance"><strong>New Instance</strong><span>Create a fresh setup</span></button>
          <button type="button" class="launcher-action-card" aria-label="Update mods"><strong>Update Mods</strong><span>Sync your mod list</span></button>
          <button type="button" class="launcher-action-card" aria-label="Game settings"><strong>Game Settings</strong><span>Adjust launch options</span></button>
          <button type="button" class="launcher-action-card" aria-label="View logs"><strong>View Logs</strong><span>Inspect launch output</span></button>
        </section>
        <section class="launcher-panels">
          <div class="launcher-panel">
            <div style="display:flex;justify-content:space-between;align-items:center;"><h2>System Status</h2><span style="font-size:12px;color:#888888;">Updated now</span></div>
            <div style="display:grid;gap:8px;">
              <div class="launcher-status-line"><span>Launch status</span><span style="color:#0066ff;">Ready</span></div>
              <div class="launcher-status-line"><span>Java version</span><span style="color:#0066ff;">17.0.9</span></div>
              <div class="launcher-status-line"><span>Memory</span><span style="color:#0066ff;">4096 MB</span></div>
            </div>
          </div>
          <div class="launcher-panel" style="max-width:280px;overflow-y:auto;padding-right:12px;">
            <h2>Announcements</h2>
            <div class="launcher-announce-scroll">
              <div class="launcher-announce-item">A new launcher update is available.</div>
              <div class="launcher-announce-item">Mod browser search improvements shipped.</div>
              <div class="launcher-announce-item">Performance mode now defaults on launch.</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}
