// src/background.js
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

export function registerListeners(chrome) {
  const panelState = createPanelState()
  chrome.commands.onCommand.addListener(async (command, tab) => {
    const windowId = tab.windowId
    if (command === 'toggle-sidebar') return handleToggleSidebar(chrome, panelState, windowId)
  })
  chrome.sidePanel.onOpened.addListener(({ windowId }) => setPanelOpen(panelState, windowId, true))
  chrome.sidePanel.onClosed.addListener(({ windowId }) => setPanelOpen(panelState, windowId, false))
}

if (typeof chrome !== 'undefined') {
  registerListeners(chrome)
}
