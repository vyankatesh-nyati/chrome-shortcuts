// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openGroupPicker, maybeOpenGroupPickerForThisWindow } from '../src/sidepanel/group-picker.js'
import { GROUP_PICKER_REQUEST_KEY } from '../src/lib/messages.js'

function makeFakeChrome({ groups = [], sessionData = {} } = {}) {
  return {
    windows: { getCurrent: vi.fn(async () => ({ id: 9 })) },
    tabs: { group: vi.fn(async () => 55) },
    tabGroups: {
      query: vi.fn(async () => groups),
      update: vi.fn(async () => {}),
    },
    storage: {
      session: {
        get: vi.fn(async key => ({ [key]: sessionData[key] })),
        set: vi.fn(async obj => Object.assign(sessionData, obj)),
      },
    },
  }
}

describe('openGroupPicker', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
  })

  it('renders an overlay with a search input and the groups, default group first', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }, { id: 2, title: 'Personal', color: 'red' }] })
    await openGroupPicker(chrome, container, 3, 2, 9)

    expect(container.querySelector('.group-picker-input')).not.toBeNull()
    const rows = container.querySelectorAll('.group-picker-row')
    expect(rows.length).toBe(2)
    expect(rows[0].querySelector('.group-picker-label').textContent).toBe('Personal')
    expect(rows[1].querySelector('.group-picker-label').textContent).toBe('Work')
  })

  it('filters the list as the user types', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }, { id: 2, title: 'Personal', color: 'red' }] })
    await openGroupPicker(chrome, container, 3, null, 9)

    const input = container.querySelector('.group-picker-input')
    input.value = 'pers'
    input.dispatchEvent(new window.Event('input', { bubbles: true }))

    const rows = container.querySelectorAll('.group-picker-row:not(.group-picker-create)')
    expect(rows.length).toBe(1)
    expect(rows[0].querySelector('.group-picker-label').textContent).toBe('Personal')
  })

  it('shows a create row when the query matches no existing group', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }] })
    await openGroupPicker(chrome, container, 3, null, 9)

    const input = container.querySelector('.group-picker-input')
    input.value = 'Research'
    input.dispatchEvent(new window.Event('input', { bubbles: true }))

    const createRow = container.querySelector('.group-picker-create')
    expect(createRow).not.toBeNull()
    expect(createRow.textContent).toContain('Research')
  })

  it('hides the create row when the query exactly matches an existing group', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }] })
    await openGroupPicker(chrome, container, 3, null, 9)

    const input = container.querySelector('.group-picker-input')
    input.value = 'work'
    input.dispatchEvent(new window.Event('input', { bubbles: true }))

    expect(container.querySelector('.group-picker-create')).toBeNull()
  })

  const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0))

  it('clicking a group row moves the tab into it and removes the overlay', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }] })
    await openGroupPicker(chrome, container, 3, null, 9)

    container.querySelector('.group-picker-row').dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushAsync()

    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [3], groupId: 1 })
    expect(container.querySelector('.group-picker-overlay')).toBeNull()
  })

  it('clicking the create row creates a new group and moves the tab into it', async () => {
    const chrome = makeFakeChrome({ groups: [] })
    await openGroupPicker(chrome, container, 3, null, 9)

    const input = container.querySelector('.group-picker-input')
    input.value = 'Research'
    input.dispatchEvent(new window.Event('input', { bubbles: true }))

    container.querySelector('.group-picker-create').dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushAsync()

    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [3], createProperties: { windowId: 9 } })
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(55, { title: 'Research', color: expect.any(String) })
    expect(container.querySelector('.group-picker-overlay')).toBeNull()
  })

  it('pressing Enter with no typing selects the default (first) group', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }, { id: 2, title: 'Personal', color: 'red' }] })
    await openGroupPicker(chrome, container, 3, 2, 9)

    const input = container.querySelector('.group-picker-input')
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await Promise.resolve()

    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [3], groupId: 2 })
  })

  it('ArrowDown then Enter selects the second item', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }, { id: 2, title: 'Personal', color: 'red' }] })
    await openGroupPicker(chrome, container, 3, 1, 9)

    const input = container.querySelector('.group-picker-input')
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await Promise.resolve()

    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [3], groupId: 2 })
  })

  it('Escape closes the overlay without moving or creating anything', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }] })
    await openGroupPicker(chrome, container, 3, 1, 9)

    const input = container.querySelector('.group-picker-input')
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(chrome.tabs.group).not.toHaveBeenCalled()
    expect(container.querySelector('.group-picker-overlay')).toBeNull()
  })

  it('clicking the overlay background closes it; clicking inside the box does not', async () => {
    const chrome = makeFakeChrome({ groups: [{ id: 1, title: 'Work', color: 'blue' }] })
    await openGroupPicker(chrome, container, 3, 1, 9)

    container.querySelector('.group-picker-box').dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(container.querySelector('.group-picker-overlay')).not.toBeNull()

    container.querySelector('.group-picker-overlay').dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(container.querySelector('.group-picker-overlay')).toBeNull()
  })
})

describe('maybeOpenGroupPickerForThisWindow', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
  })

  it('does nothing when there is no pending request', async () => {
    const chrome = makeFakeChrome({ sessionData: {} })
    await maybeOpenGroupPickerForThisWindow(chrome, container)

    expect(container.querySelector('.group-picker-overlay')).toBeNull()
  })

  it('does nothing when the request is for a different window', async () => {
    const chrome = makeFakeChrome({
      sessionData: { [GROUP_PICKER_REQUEST_KEY]: { windowId: 999, tabId: 3, defaultGroupId: null, requestId: 1 } },
    })
    await maybeOpenGroupPickerForThisWindow(chrome, container)

    expect(container.querySelector('.group-picker-overlay')).toBeNull()
  })

  it('opens the picker and clears the request when it matches this window', async () => {
    const chrome = makeFakeChrome({
      groups: [{ id: 1, title: 'Work', color: 'blue' }],
      sessionData: { [GROUP_PICKER_REQUEST_KEY]: { windowId: 9, tabId: 3, defaultGroupId: 1, requestId: 1 } },
    })
    await maybeOpenGroupPickerForThisWindow(chrome, container)

    expect(container.querySelector('.group-picker-overlay')).not.toBeNull()
    const stored = await chrome.storage.session.get(GROUP_PICKER_REQUEST_KEY)
    expect(stored[GROUP_PICKER_REQUEST_KEY]).toBeNull()
  })
})
