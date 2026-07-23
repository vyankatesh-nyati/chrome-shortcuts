// src/background.js
import { pickTabsToGroup, nextGroupColor, nameForGroup, pickTargetGroupForMove } from './lib/grouping.js'

export function createPanelState() {
  return new Map()
}

export function isPanelOpen(panelState, windowId) {
  return panelState.get(windowId) === true
}

export function setPanelOpen(panelState, windowId, isOpen) {
  panelState.set(windowId, isOpen)
}

// sidePanel.open()/close() must be called synchronously (no preceding await)
// or Chrome loses the user-gesture context from commands.onCommand and the
// call silently fails. panelState is a plain Map (not chrome.storage.session)
// specifically so this check can happen with zero awaits.
export async function handleToggleSidebar(chrome, panelState, windowId) {
  if (isPanelOpen(panelState, windowId)) {
    await chrome.sidePanel.close({ windowId })
  } else {
    await chrome.sidePanel.open({ windowId })
  }
}

const GROUP_RECENCY_KEY = 'groupRecency'

export async function getGroupRecency(chrome) {
  const stored = await chrome.storage.session.get(GROUP_RECENCY_KEY)
  return stored[GROUP_RECENCY_KEY] || {}
}

export async function recordGroupRecency(chrome, groupId) {
  const recency = await getGroupRecency(chrome)
  recency[groupId] = Date.now()
  await chrome.storage.session.set({ [GROUP_RECENCY_KEY]: recency })
}

export async function handleCreateTabGroup(chrome, windowId) {
  const highlightedTabs = await chrome.tabs.query({ highlighted: true, windowId })
  const tabIds = pickTabsToGroup(highlightedTabs)
  if (tabIds.length === 0) return

  const existingGroups = await chrome.tabGroups.query({ windowId })
  const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } })
  const activeTab = highlightedTabs.find(tab => tab.active) || highlightedTabs[0]

  await chrome.tabGroups.update(groupId, {
    title: nameForGroup(activeTab),
    color: nextGroupColor(existingGroups),
  })
  await recordGroupRecency(chrome, groupId)
}

export async function handleMoveTabToGroup(chrome, windowId) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId })
  const groups = await chrome.tabGroups.query({ windowId })
  const recency = await getGroupRecency(chrome)
  const target = pickTargetGroupForMove(groups, recency)

  if (!target) {
    await chrome.action.setBadgeText({ text: '!' })
    return
  }

  await chrome.tabs.group({ tabIds: [activeTab.id], groupId: target.id })
  await recordGroupRecency(chrome, target.id)
  await chrome.action.setBadgeText({ text: '' })
}

export function registerListeners(chrome) {
  const panelState = createPanelState()
  chrome.commands.onCommand.addListener(async (command, tab) => {
    const windowId = tab.windowId
    if (command === 'toggle-sidebar') return handleToggleSidebar(chrome, panelState, windowId)
    if (command === 'create-tab-group') return handleCreateTabGroup(chrome, windowId)
    if (command === 'move-tab-to-group') return handleMoveTabToGroup(chrome, windowId)
  })
  chrome.sidePanel.onOpened.addListener(({ windowId }) => setPanelOpen(panelState, windowId, true))
  chrome.sidePanel.onClosed.addListener(({ windowId }) => setPanelOpen(panelState, windowId, false))
  chrome.tabGroups.onCreated.addListener(group => recordGroupRecency(chrome, group.id))
  chrome.tabGroups.onUpdated.addListener(group => recordGroupRecency(chrome, group.id))
}

if (typeof chrome !== 'undefined') {
  registerListeners(chrome)
}
