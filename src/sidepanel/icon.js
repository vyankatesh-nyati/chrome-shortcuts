const ICON_COLORS = ['#3a3a3d', '#e8622c', '#e14b3d', '#2f6fed', '#8a5cf6', '#0ea5a4', '#d946a0']
const FALLBACK_GLYPH = '◐'

export function hostnameOf(url) {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function glyphForTab(tab) {
  const host = hostnameOf(tab.url)
  return host ? host[0].toUpperCase() : FALLBACK_GLYPH
}

export function colorForTab(tab) {
  const key = hostnameOf(tab.url) || tab.title || ''
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return ICON_COLORS[hash % ICON_COLORS.length]
}
