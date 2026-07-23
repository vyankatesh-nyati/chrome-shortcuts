import { buildTree } from './tree.js'

let draggedTabId = null

export async function activateTab(chrome, tabId) {
  await chrome.tabs.update(tabId, { active: true })
}

export async function moveTabToGroup(chrome, tabId, groupId) {
  await chrome.tabs.group({ tabIds: [tabId], groupId })
}

function makeTabRow(chrome, tab) {
  const row = document.createElement('div')
  row.className = 'tab' + (tab.active ? ' active' : '')
  row.textContent = tab.title
  row.dataset.tabId = String(tab.id)
  row.draggable = true
  row.addEventListener('click', () => activateTab(chrome, tab.id))
  row.addEventListener('dragstart', () => {
    draggedTabId = tab.id
  })
  return row
}

function makeGroupSection(chrome, group) {
  const section = document.createElement('div')
  section.className = 'group'
  section.dataset.groupId = String(group.id)

  const title = document.createElement('div')
  title.className = 'group-title'
  title.textContent = group.title
  section.appendChild(title)

  for (const tab of group.tabs) {
    section.appendChild(makeTabRow(chrome, tab))
  }

  section.addEventListener('dragover', event => event.preventDefault())
  section.addEventListener('drop', () => {
    if (draggedTabId != null) {
      moveTabToGroup(chrome, draggedTabId, group.id)
      draggedTabId = null
    }
  })

  return section
}

export function render(container, tree, chrome) {
  container.innerHTML = ''

  for (const group of tree.groups) {
    container.appendChild(makeGroupSection(chrome, group))
  }

  const ungroupedSection = document.createElement('div')
  ungroupedSection.className = 'ungrouped'
  for (const tab of tree.ungrouped) {
    ungroupedSection.appendChild(makeTabRow(chrome, tab))
  }
  container.appendChild(ungroupedSection)
}

export async function loadAndRender(chrome, container) {
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
  ])
  render(container, buildTree(tabs, groups), chrome)
}

if (typeof chrome !== 'undefined' && typeof document !== 'undefined') {
  const container = document.getElementById('root')
  const refresh = () => loadAndRender(chrome, container)
  refresh()
  chrome.tabs.onUpdated.addListener(refresh)
  chrome.tabs.onMoved.addListener(refresh)
  chrome.tabs.onRemoved.addListener(refresh)
  chrome.tabs.onActivated.addListener(refresh)
  chrome.tabGroups.onUpdated.addListener(refresh)
  chrome.tabGroups.onRemoved.addListener(refresh)
}
