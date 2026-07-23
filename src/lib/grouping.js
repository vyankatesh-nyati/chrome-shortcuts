export function pickTabsToGroup(highlightedTabs) {
  if (!Array.isArray(highlightedTabs)) return []
  return highlightedTabs.map(tab => tab.id)
}
