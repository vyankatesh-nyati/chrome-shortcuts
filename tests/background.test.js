// tests/background.test.js
import { describe, it, expect, vi } from 'vitest'
import { isPanelOpen, setPanelOpen, handleToggleSidebar } from '../src/background.js'

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
  it('isPanelOpen is false when nothing is stored', async () => {
    const chrome = makeFakeChrome()
    expect(await isPanelOpen(chrome, 1)).toBe(false)
  })

  it('setPanelOpen then isPanelOpen reflects the stored value', async () => {
    const chrome = makeFakeChrome()
    await setPanelOpen(chrome, 1, true)
    expect(await isPanelOpen(chrome, 1)).toBe(true)
  })

  it('tracks panel state per window independently', async () => {
    const chrome = makeFakeChrome()
    await setPanelOpen(chrome, 1, true)
    expect(await isPanelOpen(chrome, 2)).toBe(false)
  })
})

describe('handleToggleSidebar', () => {
  it('opens the panel when it is currently closed', async () => {
    const chrome = makeFakeChrome()
    await handleToggleSidebar(chrome, 7)
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 })
    expect(chrome.sidePanel.close).not.toHaveBeenCalled()
  })

  it('closes the panel when it is currently open', async () => {
    const chrome = makeFakeChrome()
    await setPanelOpen(chrome, 7, true)
    await handleToggleSidebar(chrome, 7)
    expect(chrome.sidePanel.close).toHaveBeenCalledWith({ windowId: 7 })
    expect(chrome.sidePanel.open).not.toHaveBeenCalled()
  })
})
