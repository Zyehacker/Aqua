export type ToastVariant = 'success' | 'error' | 'info'

export type ContentCategory =
  | 'overview'
  | 'mods'
  | 'modpacks'
  | 'resource-packs'
  | 'shaders'
  | 'data-packs'

export type ContentPlatform = 'modrinth' | 'curseforge'

export type ContentItem = {
  id: string
  name: string
  author: string
  description: string
  category: Exclude<ContentCategory, 'overview'>
  downloads: string
  tags: string[]
  version: string
  installed: boolean
  iconLabel: string
  accent: string
  pageUrl?: string
  iconUrl?: string
}

export type Instance = {
  id: string
  name: string
  version: string
  loader: string
  lastPlayed: string
  status: 'Ready' | 'Updating' | 'Idle' | 'Error'
  mods: number
}

export type Profile = {
  id: string
  name: string
  version: string
  loader: string
  java: string
  ram: string
  isolated: boolean
  active: boolean
  updated: string
}

export type DownloadJobStatus = 'queued' | 'downloading' | 'installing' | 'completed' | 'failed' | 'cancelled'

export type DownloadJob = {
  id: number
  name: string
  url: string
  dest: string
  status: DownloadJobStatus
  downloaded_bytes: number
  total_bytes: number | null
  percentage: number | null
  speed: string | null
  error: string | null
  created_at: number
  updated_at: number
}

export type NewsItem = {
  id: string
  title: string
  summary: string
  time: string
}

export type NavItem = {
  to: string
  label: string
}
