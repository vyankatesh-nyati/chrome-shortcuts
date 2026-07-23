// src/background.js
const PANEL_OPEN_PREFIX = 'panelOpen:'

export async function isPanelOpen(chrome, windowId) {
  const key = PANEL_OPEN_PREFIX + windowId
  const stored = await chrome.storage.session.get(key)
  return Boolean(stored[key])
}

export async function setPanelOpen(chrome, windowId, isOpen) {
  await chrome.storage.session.set({ [PANEL_OPEN_PREFIX + windowId]: isOpen })
}

export async function handleToggleSidebar(chrome, windowId) {
  const open = await isPanelOpen(chrome, windowId)
  if (open) {
    await chrome.sidePanel.close({ windowId })
  } else {
    await chrome.sidePanel.open({ windowId })
  }
}

export function registerListeners(chrome) {
  chrome.commands.onCommand.addListener(async (command, tab) => {
    const windowId = tab.windowId
    if (command === 'toggle-sidebar') return handleToggleSidebar(chrome, windowId)
  })
  chrome.sidePanel.onOpened.addListener(({ windowId }) => setPanelOpen(chrome, windowId, true))
  chrome.sidePanel.onClosed.addListener(({ windowId }) => setPanelOpen(chrome, windowId, false))
}

if (typeof chrome !== 'undefined') {
  registerListeners(chrome)
}
