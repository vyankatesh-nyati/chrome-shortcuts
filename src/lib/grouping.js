export function pickTabsToGroup(highlightedTabs) {
  if (!Array.isArray(highlightedTabs)) return []
  return highlightedTabs.map(tab => tab.id)
}

export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']

export function nextGroupColor(existingGroups) {
  const groups = existingGroups || []
  const used = new Set(groups.map(g => g.color))
  const unused = GROUP_COLORS.find(color => !used.has(color))
  if (unused) return unused
  return GROUP_COLORS[groups.length % GROUP_COLORS.length]
}

const MAX_GROUP_NAME_LENGTH = 30

export function nameForGroup(activeTab) {
  if (!activeTab || !activeTab.url) return 'New group'
  let hostname
  try {
    hostname = new URL(activeTab.url).hostname
  } catch {
    return 'New group'
  }
  if (!hostname) return 'New group'
  return hostname.length > MAX_GROUP_NAME_LENGTH
    ? `${hostname.slice(0, MAX_GROUP_NAME_LENGTH - 1)}…`
    : hostname
}
