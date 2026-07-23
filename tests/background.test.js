// tests/background.test.js
import { describe, it, expect, vi } from 'vitest'
import { createPanelState, isPanelOpen, setPanelOpen, handleToggleSidebar, registerListeners } from '../src/background.js'

function makeFakeChrome(sessionData = {}) {
  return {
    storage: {
      session: {
        get: vi.fn(async (key) => ({ [key]: sessionData[key] })),
        set: vi.fn(async (obj) => Object.assign(sessionData, obj)),
      },
    },
    sidePanel: {
      open: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      onOpened: { addListener: vi.fn() },
      onClosed: { addListener: vi.fn() },
    },
    commands: { onCommand: { addListener: vi.fn() } },
    tabGroups: { onCreated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
  }
}

describe('panel open state', () => {
  it('isPanelOpen is false for a window with no recorded state', () => {
    const panelState = createPanelState()
    expect(isPanelOpen(panelState, 1)).toBe(false)
  })

  it('setPanelOpen then isPanelOpen reflects the stored value', () => {
    const panelState = createPanelState()
    setPanelOpen(panelState, 1, true)
    expect(isPanelOpen(panelState, 1)).toBe(true)
  })

  it('tracks panel state per window independently', () => {
    const panelState = createPanelState()
    setPanelOpen(panelState, 1, true)
    expect(isPanelOpen(panelState, 2)).toBe(false)
  })
})

describe('handleToggleSidebar', () => {
  it('opens the panel when it is currently closed', async () => {
    const chrome = makeFakeChrome()
    const panelState = createPanelState()
    await handleToggleSidebar(chrome, panelState, 7)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 })
    expect(chrome.sidePanel.close).not.toHaveBeenCalled()
  })

  it('closes the panel when it is currently open', async () => {
    const chrome = makeFakeChrome()
    const panelState = createPanelState()
    setPanelOpen(panelState, 7, true)
    await handleToggleSidebar(chrome, panelState, 7)
    expect(chrome.sidePanel.close).toHaveBeenCalledWith({ windowId: 7 })
    expect(chrome.sidePanel.open).not.toHaveBeenCalled()
  })
})

describe('registerListeners', () => {
  it('routes the toggle-sidebar command to handleToggleSidebar', async () => {
    const chrome = makeFakeChrome()
    registerListeners(chrome)
    const onCommand = chrome.commands.onCommand.addListener.mock.calls[0][0]
    await onCommand('toggle-sidebar', { windowId: 5 })
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 5 })
  })

  it('ignores unknown commands', async () => {
    const chrome = makeFakeChrome()
    registerListeners(chrome)
    const onCommand = chrome.commands.onCommand.addListener.mock.calls[0][0]
    await onCommand('some-other-command', { windowId: 5 })
    expect(chrome.sidePanel.open).not.toHaveBeenCalled()
    expect(chrome.sidePanel.close).not.toHaveBeenCalled()
  })

  it('records the panel as open when sidePanel.onOpened fires', async () => {
    const chrome = makeFakeChrome()
    registerListeners(chrome)
    const onOpened = chrome.sidePanel.onOpened.addListener.mock.calls[0][0]
    const onCommand = chrome.commands.onCommand.addListener.mock.calls[0][0]
    onOpened({ windowId: 9 })
    await onCommand('toggle-sidebar', { windowId: 9 })
    expect(chrome.sidePanel.close).toHaveBeenCalledWith({ windowId: 9 })
  })

  it('records the panel as closed when sidePanel.onClosed fires', async () => {
    const chrome = makeFakeChrome()
    registerListeners(chrome)
    const onOpened = chrome.sidePanel.onOpened.addListener.mock.calls[0][0]
    const onClosed = chrome.sidePanel.onClosed.addListener.mock.calls[0][0]
    const onCommand = chrome.commands.onCommand.addListener.mock.calls[0][0]
    onOpened({ windowId: 9 })
    onClosed({ windowId: 9 })
    await onCommand('toggle-sidebar', { windowId: 9 })
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 9 })
  })
})

import { getGroupRecency, recordGroupRecency, handleCreateTabGroup } from '../src/background.js'

function makeFakeChromeWithTabs(sessionData = {}, { tabs = [], groups = [] } = {}) {
  const chrome = makeFakeChrome(sessionData)
  chrome.tabs = {
    query: vi.fn(async () => tabs),
    group: vi.fn(async () => 42),
  }
  chrome.tabGroups.query = vi.fn(async () => groups)
  chrome.tabGroups.update = vi.fn(async () => {})
  return chrome
}

describe('group recency tracking', () => {
  it('is empty before anything is recorded', async () => {
    const chrome = makeFakeChrome()
    expect(await getGroupRecency(chrome)).toEqual({})
  })

  it('records a timestamp for a group id', async () => {
    const chrome = makeFakeChrome()
    await recordGroupRecency(chrome, 5)
    const recency = await getGroupRecency(chrome)
    expect(typeof recency[5]).toBe('number')
  })
})

describe('handleCreateTabGroup', () => {
  it('groups all highlighted tabs and names/colors the new group', async () => {
    const tabs = [{ id: 1, url: 'https://example.com/', active: true }]
    const chrome = makeFakeChromeWithTabs({}, { tabs, groups: [] })

    await handleCreateTabGroup(chrome, 9)

    expect(chrome.tabs.query).toHaveBeenCalledWith({ highlighted: true, windowId: 9 })
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [1], createProperties: { windowId: 9 } })
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(42, { title: 'example.com', color: 'grey' })
  })

  it('does nothing when there are no highlighted tabs', async () => {
    const chrome = makeFakeChromeWithTabs({}, { tabs: [], groups: [] })
    await handleCreateTabGroup(chrome, 9)
    expect(chrome.tabs.group).not.toHaveBeenCalled()
  })

  it('records the new group as the most recent one', async () => {
    const tabs = [{ id: 1, url: 'https://example.com/', active: true }]
    const chrome = makeFakeChromeWithTabs({}, { tabs, groups: [] })
    await handleCreateTabGroup(chrome, 9)
    const recency = await getGroupRecency(chrome)
    expect(typeof recency[42]).toBe('number')
  })
})

import { handleMoveTabToGroup, GROUP_PICKER_REQUEST_KEY } from '../src/background.js'

function makeFakeChromeForMove(sessionData, { activeTab, groups }) {
  const chrome = makeFakeChromeWithTabs(sessionData, { tabs: [activeTab], groups })
  chrome.tabs.query = vi.fn(async () => [activeTab])
  return chrome
}

describe('handleMoveTabToGroup', () => {
  it('opens the side panel for the window', async () => {
    const activeTab = { id: 3, active: true }
    const chrome = makeFakeChromeForMove({}, { activeTab, groups: [] })

    await handleMoveTabToGroup(chrome, 9)

    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 9 })
  })

  it('does not call chrome.tabs.group directly (the panel performs the move)', async () => {
    const activeTab = { id: 3, active: true }
    const groups = [{ id: 10 }, { id: 20 }]
    const chrome = makeFakeChromeForMove({ groupRecency: { 10: 100, 20: 200 } }, { activeTab, groups })

    await handleMoveTabToGroup(chrome, 9)

    expect(chrome.tabs.group).not.toHaveBeenCalled()
  })

  it('writes a group-picker request with the active tab and the most-recently-used group as default', async () => {
    const activeTab = { id: 3, active: true }
    const groups = [{ id: 10 }, { id: 20 }]
    const chrome = makeFakeChromeForMove({ groupRecency: { 10: 100, 20: 200 } }, { activeTab, groups })

    await handleMoveTabToGroup(chrome, 9)

    const stored = await chrome.storage.session.get(GROUP_PICKER_REQUEST_KEY)
    const request = stored[GROUP_PICKER_REQUEST_KEY]
    expect(request.windowId).toBe(9)
    expect(request.tabId).toBe(3)
    expect(request.defaultGroupId).toBe(20)
    expect(typeof request.requestId).toBe('number')
  })

  it('requests a null default group when none exist yet', async () => {
    const activeTab = { id: 3, active: true }
    const chrome = makeFakeChromeForMove({}, { activeTab, groups: [] })

    await handleMoveTabToGroup(chrome, 9)

    const stored = await chrome.storage.session.get(GROUP_PICKER_REQUEST_KEY)
    expect(stored[GROUP_PICKER_REQUEST_KEY].defaultGroupId).toBeNull()
  })
})
