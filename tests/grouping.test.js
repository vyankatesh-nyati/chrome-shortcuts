import { describe, it, expect } from 'vitest'
import { pickTabsToGroup, nextGroupColor, GROUP_COLORS } from '../src/lib/grouping.js'

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
