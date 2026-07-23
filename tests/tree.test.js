import { describe, it, expect } from 'vitest'
import { buildTree } from '../src/sidepanel/tree.js'

describe('buildTree', () => {
  it('puts all tabs in ungrouped when there are no groups', () => {
    const tabs = [{ id: 1, title: 'A', url: 'https://a.com', active: true, groupId: -1 }]
    const result = buildTree(tabs, [])
    expect(result).toEqual({
      ungrouped: [{ id: 1, title: 'A', url: 'https://a.com', active: true }],
      groups: [],
    })
  })

  it('nests tabs under their matching group', () => {
    const tabs = [
      { id: 1, title: 'A', url: 'https://a.com', active: false, groupId: 100 },
      { id: 2, title: 'B', url: 'https://b.com', active: true, groupId: -1 },
    ]
    const groups = [{ id: 100, title: 'Work', color: 'blue' }]
    const result = buildTree(tabs, groups)
    expect(result).toEqual({
      ungrouped: [{ id: 2, title: 'B', url: 'https://b.com', active: true }],
      groups: [{ id: 100, title: 'Work', color: 'blue', tabs: [{ id: 1, title: 'A', url: 'https://a.com', active: false }] }],
    })
  })

  it('treats a tab whose groupId matches no known group as ungrouped', () => {
    const tabs = [{ id: 1, title: 'A', url: 'https://a.com', active: false, groupId: 999 }]
    const result = buildTree(tabs, [])
    expect(result.ungrouped).toEqual([{ id: 1, title: 'A', url: 'https://a.com', active: false }])
    expect(result.groups).toEqual([])
  })

  it('includes empty groups with no tabs', () => {
    const result = buildTree([], [{ id: 5, title: 'Empty', color: 'red' }])
    expect(result.groups).toEqual([{ id: 5, title: 'Empty', color: 'red', tabs: [] }])
  })
})
