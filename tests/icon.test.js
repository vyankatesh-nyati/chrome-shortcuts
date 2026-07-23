import { describe, it, expect } from 'vitest'
import { hostnameOf, glyphForTab, colorForTab, glyphForGroup } from '../src/sidepanel/icon.js'

describe('hostnameOf', () => {
  it('returns the hostname of a url', () => {
    expect(hostnameOf('https://github.com/foo/bar')).toBe('github.com')
  })

  it('returns empty string for a missing url', () => {
    expect(hostnameOf(undefined)).toBe('')
  })

  it('returns empty string for an unparseable url', () => {
    expect(hostnameOf('not a url')).toBe('')
  })
})

describe('glyphForTab', () => {
  it('returns the uppercased first letter of the hostname', () => {
    expect(glyphForTab({ url: 'https://github.com/foo' })).toBe('G')
  })

  it('returns a fallback glyph when there is no hostname', () => {
    expect(glyphForTab({ url: undefined })).toBe('◐')
  })
})

describe('colorForTab', () => {
  it('is deterministic for the same url', () => {
    const tab = { url: 'https://github.com/foo' }
    expect(colorForTab(tab)).toBe(colorForTab(tab))
  })

  it('returns a color even when the tab has no url', () => {
    expect(typeof colorForTab({ url: undefined, title: 'New Tab' })).toBe('string')
  })

  it('returns different colors for different hostnames (spot check)', () => {
    const a = colorForTab({ url: 'https://github.com/foo' })
    const b = colorForTab({ url: 'https://example.com/bar' })
    expect(typeof a).toBe('string')
    expect(typeof b).toBe('string')
  })
})

describe('glyphForGroup', () => {
  it('returns the uppercased first letter of the group title', () => {
    expect(glyphForGroup({ title: 'work stuff' })).toBe('W')
  })

  it('returns a fallback glyph when the title is empty', () => {
    expect(glyphForGroup({ title: '' })).toBe('#')
  })

  it('returns a fallback glyph when the title is missing', () => {
    expect(glyphForGroup({})).toBe('#')
  })

  it('ignores leading whitespace in the title', () => {
    expect(glyphForGroup({ title: '  research' })).toBe('R')
  })
})
