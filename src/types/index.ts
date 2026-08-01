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

export type DownloadJob = {
  id: string
  name: string
  category: string
  progress: number
  speed: string
  status: 'Downloading' | 'Queued' | 'Paused' | 'Completed' | 'Failed'
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
