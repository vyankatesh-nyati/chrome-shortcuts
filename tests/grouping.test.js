import { describe, it, expect } from 'vitest'
import { pickTabsToGroup, nextGroupColor, GROUP_COLORS, nameForGroup, pickTargetGroupForMove } from '../src/lib/grouping.js'

describe('pickTabsToGroup', () => {
  it('returns the id of the single highlighted tab', () => {
    const result = pickTabsToGroup([{ id: 5 }])
    expect(result).toEqual([5])
  })

  it('returns ids of all highlighted tabs when multiple are selected', () => {
    const result = pickTabsToGroup([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(result).toEqual([1, 2, 3])
  })

  it('returns an empty array when given an empty array', () => {
    const result = pickTabsToGroup([])
    expect(result).toEqual([])
  })

  it('returns an empty array when given a non-array', () => {
    const result = pickTabsToGroup(undefined)
    expect(result).toEqual([])
  })
})

describe('nextGroupColor', () => {
  it('returns the first color when there are no existing groups', () => {
    expect(nextGroupColor([])).toBe('grey')
  })

  it('skips colors already used in the window', () => {
    const existing = [{ color: 'grey' }, { color: 'blue' }]
    expect(nextGroupColor(existing)).toBe('red')
  })

  it('wraps around once all 9 colors are used', () => {
    const existing = GROUP_COLORS.map(color => ({ color }))
    expect(nextGroupColor(existing)).toBe('grey')
  })

  it('ignores duplicate colors when counting for wraparound', () => {
    const existing = [{ color: 'grey' }, { color: 'grey' }, { color: 'grey' }]
    expect(nextGroupColor(existing)).toBe('blue')
  })
})

describe('nameForGroup', () => {
  it('returns the hostname of the active tab URL', () => {
    expect(nameForGroup({ url: 'https://github.com/foo/bar' })).toBe('github.com')
  })

  it('returns "New group" when the tab has no url', () => {
    expect(nameForGroup({})).toBe('New group')
  })

  it('returns "New group" when the tab is null', () => {
    expect(nameForGroup(null)).toBe('New group')
  })

  it('returns "New group" for an unparseable url', () => {
    expect(nameForGroup({ url: 'not a url' })).toBe('New group')
  })

  it('returns "New group" for a url with an empty hostname', () => {
    expect(nameForGroup({ url: 'about:blank' })).toBe('New group')
  })

  it('truncates hostnames longer than 30 characters', () => {
    const longHost = 'a'.repeat(35) + '.com'
    const result = nameForGroup({ url: `https://${longHost}/path` })
    expect(result).toBe(`${longHost.slice(0, 29)}…`)
    expect(result.length).toBe(30)
  })
})

describe('pickTargetGroupForMove', () => {
  it('returns null when there are no groups', () => {
    expect(pickTargetGroupForMove([], {})).toBeNull()
  })

  it('returns the group with the highest recorded recency', () => {
    const groups = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const recency = { 1: 100, 2: 300, 3: 200 }
    expect(pickTargetGroupForMove(groups, recency)).toEqual({ id: 2 })
  })

  it('falls back to the last group when no recency data exists', () => {
    const groups = [{ id: 1 }, { id: 2 }]
    expect(pickTargetGroupForMove(groups, {})).toEqual({ id: 2 })
  })

  it('ignores recency entries for groups that no longer exist', () => {
    const groups = [{ id: 1 }, { id: 2 }]
    const recency = { 99: 999 }
    expect(pickTargetGroupForMove(groups, recency)).toEqual({ id: 2 })
  })
})
