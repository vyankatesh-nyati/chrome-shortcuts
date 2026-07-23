const NO_GROUP = -1

export function buildTree(tabs, groups) {
  const groupsById = new Map(groups.map(g => [g.id, { id: g.id, title: g.title, color: g.color, tabs: [] }]))
  const ungrouped = []

  for (const tab of tabs) {
    const entry = { id: tab.id, title: tab.title, url: tab.url, active: Boolean(tab.active), favIconUrl: tab.favIconUrl || null }
    if (tab.groupId !== NO_GROUP && groupsById.has(tab.groupId)) {
      groupsById.get(tab.groupId).tabs.push(entry)
    } else {
      ungrouped.push(entry)
    }
  }

  return { ungrouped, groups: Array.from(groupsById.values()) }
}
