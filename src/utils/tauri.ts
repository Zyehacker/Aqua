// Small, safe Tauri bridge: calls into Tauri when available, otherwise falls back to no-op
// Keep this minimal to avoid adding @tauri-apps/api dependency.

declare global {
  interface Window {
    __TAURI__: any
  }
}

export async function invoke<T = any>(cmd: string, args?: Record<string, any>): Promise<T | null> {
  try {
    // modern Tauri exposes globalThis.__TAURI__ in some setups; attempt invoke if present
    const tauri = (window as any).__TAURI__
    if (tauri && typeof tauri.invoke === 'function') {
      return await tauri.invoke(cmd, args)
    }
    // fallback: try window.__TAURI_IPC__ or other shapes
    if (typeof (window as any).ipc === 'object' && typeof (window as any).ipc.invoke === 'function') {
      return await (window as any).ipc.invoke(cmd, args)
    }
  } catch (e) {
    // swallow and return null so UI can fallback gracefully
    // eslint-disable-next-line no-console
    console.warn('Tauri invoke failed', cmd, e)
  }
  return null
}

export async function launchInstance(instanceId: string) {
  return invoke('launch_instance', { id: instanceId })
}

export async function openContent(id: string) {
  return invoke('open_content', { id })
}

export async function startDownload(jobId: string) {
  return invoke('start_download', { id: jobId })
}
