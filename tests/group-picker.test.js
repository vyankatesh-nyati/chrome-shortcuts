import { describe, it, expect, vi } from 'vitest'
import {
  reorderGroupsWithDefaultFirst,
  filterGroups,
  shouldShowCreateRow,
  moveHighlight,
  createGroupAndMoveTab,
} from '../src/sidepanel/group-picker.js'

describe('reorderGroupsWithDefaultFirst', () => {
  it('moves the default group to the front', () => {
    const groups = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(reorderGroupsWithDefaultFirst(groups, 2)).toEqual([{ id: 2 }, { id: 1 }, { id: 3 }])
  })

  it('leaves order unchanged when the default is already first', () => {
    const groups = [{ id: 1 }, { id: 2 }]
    expect(reorderGroupsWithDefaultFirst(groups, 1)).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('leaves order unchanged when the default id matches no group', () => {
    const groups = [{ id: 1 }, { id: 2 }]
    expect(reorderGroupsWithDefaultFirst(groups, 999)).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('leaves order unchanged when defaultGroupId is null', () => {
    const groups = [{ id: 1 }, { id: 2 }]
    expect(reorderGroupsWithDefaultFirst(groups, null)).toEqual([{ id: 1 }, { id: 2 }])
  })
})

describe('filterGroups', () => {
  const groups = [{ id: 1, title: 'Work' }, { id: 2, title: 'Personal' }, { id: 3, title: 'work travel' }]

  it('returns all groups when the query is empty', () => {
    expect(filterGroups(groups, '')).toEqual(groups)
  })

  it('returns all groups when the query is only whitespace', () => {
    expect(filterGroups(groups, '   ')).toEqual(groups)
  })

  it('filters case-insensitively by substring', () => {
    expect(filterGroups(groups, 'work')).toEqual([{ id: 1, title: 'Work' }, { id: 3, title: 'work travel' }])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterGroups(groups, 'xyz')).toEqual([])
  })
})

describe('shouldShowCreateRow', () => {
  const groups = [{ id: 1, title: 'Work' }]

  it('is false when the query is empty', () => {
    expect(shouldShowCreateRow(groups, '')).toBe(false)
  })

  it('is false when the query exactly matches an existing group (case-insensitive)', () => {
    expect(shouldShowCreateRow(groups, 'work')).toBe(false)
  })

  it('is true when the query has no exact match', () => {
    expect(shouldShowCreateRow(groups, 'Research')).toBe(true)
  })

  it('is false when the query is only whitespace', () => {
    expect(shouldShowCreateRow(groups, '   ')).toBe(false)
  })
})

describe('moveHighlight', () => {
  it('increases the highlighted index by delta', () => {
    expect(moveHighlight(0, 1, 3)).toBe(1)
  })

  it('decreases the highlighted index by delta', () => {
    expect(moveHighlight(1, -1, 3)).toBe(0)
  })

  it('clamps at the last index', () => {
    expect(moveHighlight(2, 1, 3)).toBe(2)
  })

  it('clamps at zero', () => {
    expect(moveHighlight(0, -1, 3)).toBe(0)
  })

  it('clamps to zero when total is zero', () => {
    expect(moveHighlight(0, 1, 0)).toBe(0)
  })
})

function makeFakeChrome() {
  return {
    tabs: { group: vi.fn(async () => 55) },
    tabGroups: { update: vi.fn(async () => {}) },
  }
}

describe('createGroupAndMoveTab', () => {
  it('creates a new group containing the tab in the given window', async () => {
    const chrome = makeFakeChrome()
    await createGroupAndMoveTab(chrome, 9, 3, 'Research', [])
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [3], createProperties: { windowId: 9 } })
  })

  it('names the new group with the trimmed title and the next unused color', async () => {
    const chrome = makeFakeChrome()
    await createGroupAndMoveTab(chrome, 9, 3, '  Research  ', [{ color: 'grey' }])
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(55, { title: 'Research', color: 'blue' })
  })

  it('falls back to "New group" when the title is blank', async () => {
    const chrome = makeFakeChrome()
    await createGroupAndMoveTab(chrome, 9, 3, '   ', [])
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(55, { title: 'New group', color: 'grey' })
  })

  it('returns the new group id', async () => {
    const chrome = makeFakeChrome()
    const groupId = await createGroupAndMoveTab(chrome, 9, 3, 'Research', [])
    expect(groupId).toBe(55)
  })
})
