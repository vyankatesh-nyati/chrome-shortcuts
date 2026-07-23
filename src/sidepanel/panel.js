import { buildTree } from './tree.js'
import { glyphForTab, colorForTab } from './icon.js'

let draggedTabId = null

export async function activateTab(chrome, tabId) {
  await chrome.tabs.update(tabId, { active: true })
}

export async function moveTabToGroup(chrome, tabId, groupId) {
  await chrome.tabs.group({ tabIds: [tabId], groupId })
}

export async function closeTab(chrome, tabId) {
  await chrome.tabs.remove(tabId)
}

function makeTabIcon(tab) {
  const icon = document.createElement('div')
  icon.className = 'tab-icon'
  if (tab.favIconUrl) {
    const img = document.createElement('img')
    img.src = tab.favIconUrl
    img.alt = ''
    icon.appendChild(img)
  } else {
    icon.textContent = glyphForTab(tab)
    icon.style.backgroundColor = colorForTab(tab)
  }
  return icon
}

function makeTabRow(chrome, tab) {
  const row = document.createElement('div')
  row.className = 'tab' + (tab.active ? ' active' : '')
  row.dataset.tabId = String(tab.id)
  row.draggable = true

  row.appendChild(makeTabIcon(tab))

  const label = document.createElement('div')
  label.className = 'tab-label'
  label.textContent = tab.title
  row.appendChild(label)

  const closeButton = document.createElement('button')
  closeButton.className = 'tab-close'
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', 'Close tab')
  closeButton.textContent = '✕'
  closeButton.addEventListener('click', event => {
    event.stopPropagation()
    closeTab(chrome, tab.id)
  })
  row.appendChild(closeButton)

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

  const colorDot = document.createElement('span')
  colorDot.className = 'group-color'
  colorDot.dataset.color = group.color
  title.appendChild(colorDot)

  const titleLabel = document.createElement('span')
  titleLabel.textContent = group.title
  title.appendChild(titleLabel)

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
