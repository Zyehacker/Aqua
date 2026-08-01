import { CONTENT_LIBRARY } from '../data/mock'
import type { ContentCategory, ContentItem } from '../types'

export function getContentByCategory(category: Exclude<ContentCategory, 'overview'>): ContentItem[] {
  return CONTENT_LIBRARY.filter((item) => item.category === category)
}

export function getInstalledCount(category?: Exclude<ContentCategory, 'overview'>) {
  return CONTENT_LIBRARY.filter((item) => item.installed && (!category || item.category === category)).length
}

export function searchContent(
  category: Exclude<ContentCategory, 'overview'>,
  query: string,
  installedOnly = false,
): ContentItem[] {
  const needle = query.trim().toLowerCase()
  return getContentByCategory(category).filter((item) => {
    if (installedOnly && !item.installed) return false
    if (!needle) return true
    return (
      item.name.toLowerCase().includes(needle) ||
      item.author.toLowerCase().includes(needle) ||
      item.tags.some((tag) => tag.toLowerCase().includes(needle))
    )
  })
}
