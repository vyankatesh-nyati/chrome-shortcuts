// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, activateTab, moveTabToGroup } from '../src/sidepanel/panel.js'
import { buildTree } from '../src/sidepanel/tree.js'

function makeFakeChrome() {
  return {
    tabs: { update: vi.fn(async () => {}), group: vi.fn(async () => {}) },
  }
}

describe('render', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
  })

  it('renders one .group element per group and lists its tabs', () => {
    const tree = buildTree(
      [{ id: 1, title: 'A', url: 'https://a.com', active: false, groupId: 100 }],
      [{ id: 100, title: 'Work', color: 'blue' }],
    )
    render(container, tree, makeFakeChrome())

    const groupEls = container.querySelectorAll('.group')
    expect(groupEls.length).toBe(1)
    expect(groupEls[0].querySelector('.group-title').textContent).toBe('Work')
    expect(groupEls[0].querySelectorAll('.tab').length).toBe(1)
    expect(groupEls[0].querySelector('.tab').textContent).toBe('A')
  })

  it('renders ungrouped tabs in a separate section', () => {
    const tree = buildTree([{ id: 2, title: 'B', url: 'https://b.com', active: true, groupId: -1 }], [])
    render(container, tree, makeFakeChrome())

    const ungroupedEl = container.querySelector('.ungrouped')
    expect(ungroupedEl.querySelectorAll('.tab').length).toBe(1)
  })

  it('marks the active tab with the active class', () => {
    const tree = buildTree([{ id: 2, title: 'B', url: 'https://b.com', active: true, groupId: -1 }], [])
    render(container, tree, makeFakeChrome())

    expect(container.querySelector('.tab.active')).not.toBeNull()
  })

  it('clicking a tab row calls chrome.tabs.update to activate it', () => {
    const tree = buildTree([{ id: 7, title: 'C', url: 'https://c.com', active: false, groupId: -1 }], [])
    const chrome = makeFakeChrome()
    render(container, tree, chrome)

    container.querySelector('.tab').dispatchEvent(new window.Event('click', { bubbles: true }))

    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true })
  })
})

describe('activateTab', () => {
  it('calls chrome.tabs.update with active: true', async () => {
    const chrome = makeFakeChrome()
    await activateTab(chrome, 4)
    expect(chrome.tabs.update).toHaveBeenCalledWith(4, { active: true })
  })
})

describe('moveTabToGroup', () => {
  it('calls chrome.tabs.group with the tab and target group', async () => {
    const chrome = makeFakeChrome()
    await moveTabToGroup(chrome, 4, 100)
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [4], groupId: 100 })
  })
})

describe('drag and drop', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
  })

  it('does nothing on drop when no drag is in progress', () => {
    const tree = buildTree([], [{ id: 200, title: 'Empty', color: 'red' }])
    const chrome = makeFakeChrome()
    render(container, tree, chrome)

    container.querySelector('.group').dispatchEvent(new window.Event('drop', { bubbles: true }))

    expect(chrome.tabs.group).not.toHaveBeenCalled()
  })

  it('moves a tab into a group when dropped after dragstart', () => {
    const tree = buildTree(
      [{ id: 9, title: 'D', url: 'https://d.com', active: false, groupId: -1 }],
      [{ id: 300, title: 'Target', color: 'green' }],
    )
    const chrome = makeFakeChrome()
    render(container, tree, chrome)

    container.querySelector('.tab').dispatchEvent(new window.Event('dragstart', { bubbles: true }))
    container.querySelector('.group').dispatchEvent(new window.Event('drop', { bubbles: true }))

    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [9], groupId: 300 })
  })
})
