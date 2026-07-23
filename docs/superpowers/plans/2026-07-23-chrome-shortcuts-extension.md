# Chrome Shortcuts Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 Chrome extension with three keyboard shortcuts — toggle a vertical sidebar (our own side panel), create a tab group, and move a tab under a tab group.

**Architecture:** Plain JS (ES modules, no bundler/TypeScript). Decision logic lives in pure, dependency-free functions (`src/lib/grouping.js`, `src/sidepanel/tree.js`); `src/background.js` and `src/sidepanel/panel.js` are thin adapters calling `chrome.*` APIs.

**Tech Stack:** Manifest V3, `chrome.commands`/`chrome.tabs`/`chrome.tabGroups`/`chrome.sidePanel`/`chrome.storage.session`, Vitest (+ jsdom for the one DOM-rendering test file).

## Global Constraints

- `minimum_chrome_version`: `"142"` (needed for `sidePanel.close()` / `onOpened` / `onClosed`).
- Permissions: exactly `tabs`, `tabGroups`, `sidePanel`, `storage`. No host permissions, no content scripts, no `chrome.notifications`.
- No build step, no TypeScript, no bundler.
- Every task's code must have tests before being considered done (per project convention: no production code without tests).

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `manifest.json`
- Create: `scripts/gen-icons.cjs`
- Create (generated): `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

**Interfaces:**
- Produces: a loadable (unpacked) Chrome extension skeleton with no commands yet; `npm test` runs Vitest successfully with zero test files (not an error in Vitest).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "chrome-shortcuts",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.9",
    "jsdom": "^25.0.1"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 4: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Chrome Shortcuts",
  "version": "1.0.0",
  "description": "Keyboard shortcuts for a vertical tab sidebar, tab group creation, and moving tabs into groups.",
  "minimum_chrome_version": "142",
  "permissions": ["tabs", "tabGroups", "sidePanel", "storage"],
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "src/sidepanel/panel.html"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {}
}
```

- [ ] **Step 5: Create the icon generator script**

```js
// scripts/gen-icons.cjs
const zlib = require('zlib')
const fs = require('fs')

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      }
      t[n] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function makeIcon(size, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rowSize = size * 3
  const raw = Buffer.alloc((rowSize + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowSize + 1)
    raw[rowStart] = 0
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3
      raw[px] = r
      raw[px + 1] = g
      raw[px + 2] = b
    }
  }
  const idatData = zlib.deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))])
}

fs.mkdirSync('icons', { recursive: true })
for (const size of [16, 48, 128]) {
  fs.writeFileSync(`icons/icon${size}.png`, makeIcon(size, [66, 133, 244]))
}
console.log('icons generated')
```

- [ ] **Step 6: Generate the icons**

Run: `node scripts/gen-icons.cjs`
Expected output: `icons generated`. Verify: `file icons/icon16.png icons/icon48.png icons/icon128.png` reports `PNG image data` for all three.

- [ ] **Step 7: Verify Vitest runs**

Run: `npx vitest run`
Expected: `No test files found` (exit code non-zero is fine here — no tests exist yet; this just confirms Vitest itself runs without a config error). If Vitest errors about missing config rather than "no tests found," fix by re-checking `package.json` `"type": "module"` is present.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore manifest.json scripts/gen-icons.cjs icons/
git commit -m "Scaffold Chrome extension project (manifest, icons, Vitest)"
```

---

### Task 2: `grouping.js` — `pickTabsToGroup`

**Files:**
- Create: `src/lib/grouping.js`
- Test: `tests/grouping.test.js`

**Interfaces:**
- Produces: `pickTabsToGroup(highlightedTabs: {id: number}[]) => number[]`

- [ ] **Step 1: Write the failing test**

```js
// tests/grouping.test.js
import { describe, it, expect } from 'vitest'
import { pickTabsToGroup } from '../src/lib/grouping.js'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grouping.test.js`
Expected: FAIL — `Cannot find module '../src/lib/grouping.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/grouping.js
export function pickTabsToGroup(highlightedTabs) {
  if (!Array.isArray(highlightedTabs)) return []
  return highlightedTabs.map(tab => tab.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grouping.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.js tests/grouping.test.js
git commit -m "Add pickTabsToGroup"
```

---

### Task 3: `grouping.js` — `nextGroupColor`

**Files:**
- Modify: `src/lib/grouping.js` (append)
- Modify: `tests/grouping.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `GROUP_COLORS: string[]` (9 Chrome tab-group colors), `nextGroupColor(existingGroups: {color: string}[]) => string`

- [ ] **Step 1: Write the failing test**

```js
// append to tests/grouping.test.js
import { nextGroupColor, GROUP_COLORS } from '../src/lib/grouping.js'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grouping.test.js`
Expected: FAIL — `nextGroupColor is not a function` (or not exported)

- [ ] **Step 3: Write minimal implementation**

```js
// append to src/lib/grouping.js
export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']

export function nextGroupColor(existingGroups) {
  const groups = existingGroups || []
  const used = new Set(groups.map(g => g.color))
  const unused = GROUP_COLORS.find(color => !used.has(color))
  if (unused) return unused
  return GROUP_COLORS[groups.length % GROUP_COLORS.length]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grouping.test.js`
Expected: PASS (8 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.js tests/grouping.test.js
git commit -m "Add nextGroupColor"
```

---

### Task 4: `grouping.js` — `nameForGroup`

**Files:**
- Modify: `src/lib/grouping.js` (append)
- Modify: `tests/grouping.test.js` (append)

**Interfaces:**
- Produces: `nameForGroup(activeTab: {url?: string} | null) => string`

- [ ] **Step 1: Write the failing test**

```js
// append to tests/grouping.test.js
import { nameForGroup } from '../src/lib/grouping.js'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grouping.test.js`
Expected: FAIL — `nameForGroup is not a function` (or not exported)

- [ ] **Step 3: Write minimal implementation**

```js
// append to src/lib/grouping.js
const MAX_GROUP_NAME_LENGTH = 30

export function nameForGroup(activeTab) {
  if (!activeTab || !activeTab.url) return 'New group'
  let hostname
  try {
    hostname = new URL(activeTab.url).hostname
  } catch {
    return 'New group'
  }
  if (!hostname) return 'New group'
  return hostname.length > MAX_GROUP_NAME_LENGTH
    ? `${hostname.slice(0, MAX_GROUP_NAME_LENGTH - 1)}…`
    : hostname
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grouping.test.js`
Expected: PASS (14 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.js tests/grouping.test.js
git commit -m "Add nameForGroup"
```

---

### Task 5: `grouping.js` — `pickTargetGroupForMove`

**Files:**
- Modify: `src/lib/grouping.js` (append)
- Modify: `tests/grouping.test.js` (append)

**Interfaces:**
- Produces: `pickTargetGroupForMove(groups: {id: number}[], recencyById: Record<number, number>) => {id: number} | null`

- [ ] **Step 1: Write the failing test**

```js
// append to tests/grouping.test.js
import { pickTargetGroupForMove } from '../src/lib/grouping.js'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grouping.test.js`
Expected: FAIL — `pickTargetGroupForMove is not a function` (or not exported)

- [ ] **Step 3: Write minimal implementation**

```js
// append to src/lib/grouping.js
export function pickTargetGroupForMove(groups, recencyById) {
  if (!Array.isArray(groups) || groups.length === 0) return null
  const recency = recencyById || {}
  let best = null
  let bestTime = -Infinity
  for (const group of groups) {
    const t = recency[group.id]
    if (typeof t === 'number' && t > bestTime) {
      best = group
      bestTime = t
    }
  }
  return best || groups[groups.length - 1]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grouping.test.js`
Expected: PASS (18 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/grouping.js tests/grouping.test.js
git commit -m "Add pickTargetGroupForMove"
```

---

### Task 6: `background.js` — toggle-sidebar

**Files:**
- Create: `src/background.js`
- Test: `tests/background.test.js`
- Modify: `manifest.json` (`commands.toggle-sidebar`)

**Interfaces:**
- Consumes: nothing from `grouping.js` yet.
- Produces: `createPanelState() => Map`, `isPanelOpen(panelState, windowId) => boolean`, `setPanelOpen(panelState, windowId, isOpen) => void`, `handleToggleSidebar(chrome, panelState, windowId) => Promise<void>`, `registerListeners(chrome) => void`.
- **Why `panelState` is a plain in-memory `Map`, not `chrome.storage.session`:** Chrome requires `sidePanel.open()` to be called synchronously, with no `await` in between, from the gesture-carrying event (`commands.onCommand`). A `chrome.storage.session.get()` read is asynchronous — awaiting it before deciding open-vs-close would lose the user-gesture context and the call would silently fail in real Chrome (verified against Chromium issue trackers: https://issues.chromium.org/issues/355266358). Reading a `Map` is synchronous, so the decision can be made with zero `await` before the gesture-sensitive call.
- A fake `chrome` object used in tests must implement: `sidePanel.open({windowId}) => Promise<void>`, `sidePanel.close({windowId}) => Promise<void>`, `sidePanel.onOpened.addListener(fn)`, `sidePanel.onClosed.addListener(fn)`, `commands.onCommand.addListener(fn)`, `tabGroups.onCreated.addListener(fn)`, `tabGroups.onUpdated.addListener(fn)`. (`storage.session` isn't needed until Task 7.)

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/background.test.js`
Expected: FAIL — `Cannot find module '../src/background.js'`

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/background.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Add the command to the manifest**

Modify `manifest.json`'s `"commands"` key:

```json
  "commands": {
    "toggle-sidebar": {
      "suggested_key": { "default": "Ctrl+Shift+E", "mac": "Command+Shift+E" },
      "description": "Open or close the vertical sidebar"
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add src/background.js tests/background.test.js manifest.json
git commit -m "Add toggle-sidebar command handler"
```

---

### Task 7: `background.js` — create-tab-group

**Files:**
- Modify: `src/background.js`
- Modify: `tests/background.test.js` (append)
- Modify: `manifest.json` (`commands.create-tab-group`)

**Interfaces:**
- Consumes: `pickTabsToGroup`, `nextGroupColor`, `nameForGroup` from `src/lib/grouping.js`.
- Produces: `getGroupRecency(chrome) => Promise<Record<number, number>>`, `recordGroupRecency(chrome, groupId) => Promise<void>`, `handleCreateTabGroup(chrome, windowId) => Promise<void>`.
- Fake `chrome` additions needed in tests: `tabs.query(queryInfo) => Promise<tab[]>`, `tabs.group(options) => Promise<number>`, `tabGroups.query(queryInfo) => Promise<group[]>`, `tabGroups.update(groupId, props) => Promise<void>`.

- [ ] **Step 1: Write the failing test**

```js
// append to tests/background.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/background.test.js`
Expected: FAIL — `getGroupRecency is not a function` (or not exported)

- [ ] **Step 3: Write minimal implementation**

```js
// add near the top of src/background.js
import { pickTabsToGroup, nextGroupColor, nameForGroup } from './lib/grouping.js'

const GROUP_RECENCY_KEY = 'groupRecency'

export async function getGroupRecency(chrome) {
  const stored = await chrome.storage.session.get(GROUP_RECENCY_KEY)
  return stored[GROUP_RECENCY_KEY] || {}
}

export async function recordGroupRecency(chrome, groupId) {
  const recency = await getGroupRecency(chrome)
  recency[groupId] = Date.now()
  await chrome.storage.session.set({ [GROUP_RECENCY_KEY]: recency })
}

export async function handleCreateTabGroup(chrome, windowId) {
  const highlightedTabs = await chrome.tabs.query({ highlighted: true, windowId })
  const tabIds = pickTabsToGroup(highlightedTabs)
  if (tabIds.length === 0) return

  const existingGroups = await chrome.tabGroups.query({ windowId })
  const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } })
  const activeTab = highlightedTabs.find(tab => tab.active) || highlightedTabs[0]

  await chrome.tabGroups.update(groupId, {
    title: nameForGroup(activeTab),
    color: nextGroupColor(existingGroups),
  })
  await recordGroupRecency(chrome, groupId)
}
```

Also update `registerListeners` in `src/background.js`:

```js
export function registerListeners(chrome) {
  const panelState = createPanelState()
  chrome.commands.onCommand.addListener(async (command, tab) => {
    const windowId = tab.windowId
    if (command === 'toggle-sidebar') return handleToggleSidebar(chrome, panelState, windowId)
    if (command === 'create-tab-group') return handleCreateTabGroup(chrome, windowId)
  })
  chrome.sidePanel.onOpened.addListener(({ windowId }) => setPanelOpen(panelState, windowId, true))
  chrome.sidePanel.onClosed.addListener(({ windowId }) => setPanelOpen(panelState, windowId, false))
  chrome.tabGroups.onCreated.addListener(group => recordGroupRecency(chrome, group.id))
  chrome.tabGroups.onUpdated.addListener(group => recordGroupRecency(chrome, group.id))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/background.test.js`
Expected: PASS (14 tests total)

- [ ] **Step 5: Add the command to the manifest**

Modify `manifest.json`'s `"commands"` key (add alongside `toggle-sidebar`):

```json
    "create-tab-group": {
      "suggested_key": { "default": "Ctrl+Shift+G", "mac": "Command+Shift+G" },
      "description": "Create a tab group from the current tab(s)"
    }
```

- [ ] **Step 6: Commit**

```bash
git add src/background.js tests/background.test.js manifest.json
git commit -m "Add create-tab-group command handler"
```

---

### Task 8: `background.js` — move-tab-to-group

**Files:**
- Modify: `src/background.js`
- Modify: `tests/background.test.js` (append)
- Modify: `manifest.json` (`commands.move-tab-to-group`)

**Interfaces:**
- Consumes: `pickTargetGroupForMove` from `src/lib/grouping.js`; `getGroupRecency`/`recordGroupRecency` from Task 7.
- Produces: `handleMoveTabToGroup(chrome, windowId) => Promise<void>`.
- Fake `chrome` additions needed in tests: `action.setBadgeText({text}) => Promise<void>`.

- [ ] **Step 1: Write the failing test**

```js
// append to tests/background.test.js
import { handleMoveTabToGroup } from '../src/background.js'

function makeFakeChromeForMove(sessionData, { activeTab, groups }) {
  const chrome = makeFakeChromeWithTabs(sessionData, { tabs: [activeTab], groups })
  chrome.tabs.query = vi.fn(async () => [activeTab])
  chrome.action = { setBadgeText: vi.fn(async () => {}) }
  return chrome
}

describe('handleMoveTabToGroup', () => {
  it('moves the active tab into the most recently recorded group', async () => {
    const activeTab = { id: 3, active: true }
    const groups = [{ id: 10 }, { id: 20 }]
    const chrome = makeFakeChromeForMove({ groupRecency: { 10: 100, 20: 200 } }, { activeTab, groups })

    await handleMoveTabToGroup(chrome, 9)

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, windowId: 9 })
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [3], groupId: 20 })
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled()
  })

  it('sets badge feedback and does not call tabs.group when there are no groups', async () => {
    const activeTab = { id: 3, active: true }
    const chrome = makeFakeChromeForMove({}, { activeTab, groups: [] })

    await handleMoveTabToGroup(chrome, 9)

    expect(chrome.tabs.group).not.toHaveBeenCalled()
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '!' })
  })

  it('records the target group as the most recent one after moving', async () => {
    const activeTab = { id: 3, active: true }
    const groups = [{ id: 10 }]
    const chrome = makeFakeChromeForMove({}, { activeTab, groups })

    await handleMoveTabToGroup(chrome, 9)

    const recency = await getGroupRecency(chrome)
    expect(typeof recency[10]).toBe('number')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/background.test.js`
Expected: FAIL — `handleMoveTabToGroup is not a function` (or not exported)

- [ ] **Step 3: Write minimal implementation**

```js
// add to src/background.js
import { pickTabsToGroup, nextGroupColor, nameForGroup, pickTargetGroupForMove } from './lib/grouping.js'

export async function handleMoveTabToGroup(chrome, windowId) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId })
  const groups = await chrome.tabGroups.query({ windowId })
  const recency = await getGroupRecency(chrome)
  const target = pickTargetGroupForMove(groups, recency)

  if (!target) {
    await chrome.action.setBadgeText({ text: '!' })
    return
  }

  await chrome.tabs.group({ tabIds: [activeTab.id], groupId: target.id })
  await recordGroupRecency(chrome, target.id)
}
```

(Note: this replaces the earlier `import { pickTabsToGroup, nextGroupColor, nameForGroup } from './lib/grouping.js'` line from Task 7 with the full set of four imports — one import line, not two.)

Also update `registerListeners`:

```js
export function registerListeners(chrome) {
  const panelState = createPanelState()
  chrome.commands.onCommand.addListener(async (command, tab) => {
    const windowId = tab.windowId
    if (command === 'toggle-sidebar') return handleToggleSidebar(chrome, panelState, windowId)
    if (command === 'create-tab-group') return handleCreateTabGroup(chrome, windowId)
    if (command === 'move-tab-to-group') return handleMoveTabToGroup(chrome, windowId)
  })
  chrome.sidePanel.onOpened.addListener(({ windowId }) => setPanelOpen(panelState, windowId, true))
  chrome.sidePanel.onClosed.addListener(({ windowId }) => setPanelOpen(panelState, windowId, false))
  chrome.tabGroups.onCreated.addListener(group => recordGroupRecency(chrome, group.id))
  chrome.tabGroups.onUpdated.addListener(group => recordGroupRecency(chrome, group.id))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/background.test.js`
Expected: PASS (17 tests total)

- [ ] **Step 5: Add the command to the manifest**

Modify `manifest.json`'s `"commands"` key (add alongside the other two):

```json
    "move-tab-to-group": {
      "suggested_key": { "default": "Ctrl+Shift+M", "mac": "Command+Shift+M" },
      "description": "Move the active tab under a tab group"
    }
```

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (35 tests total: 18 grouping + 17 background)

- [ ] **Step 7: Commit**

```bash
git add src/background.js tests/background.test.js manifest.json
git commit -m "Add move-tab-to-group command handler"
```

---

### Task 9: `sidepanel/tree.js` — `buildTree`

**Files:**
- Create: `src/sidepanel/tree.js`
- Test: `tests/tree.test.js`

**Interfaces:**
- Produces: `buildTree(tabs: {id, title, url, active, groupId}[], groups: {id, title, color}[]) => { ungrouped: TabEntry[], groups: {id, title, color, tabs: TabEntry[]}[] }` where `TabEntry = {id, title, url, active}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/tree.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tree.test.js`
Expected: FAIL — `Cannot find module '../src/sidepanel/tree.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/sidepanel/tree.js
const NO_GROUP = -1

export function buildTree(tabs, groups) {
  const groupsById = new Map(groups.map(g => [g.id, { id: g.id, title: g.title, color: g.color, tabs: [] }]))
  const ungrouped = []

  for (const tab of tabs) {
    const entry = { id: tab.id, title: tab.title, url: tab.url, active: Boolean(tab.active) }
    if (tab.groupId !== NO_GROUP && groupsById.has(tab.groupId)) {
      groupsById.get(tab.groupId).tabs.push(entry)
    } else {
      ungrouped.push(entry)
    }
  }

  return { ungrouped, groups: Array.from(groupsById.values()) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tree.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/tree.js tests/tree.test.js
git commit -m "Add buildTree for the side panel's tab/group view"
```

---

### Task 10: Side panel UI (`panel.html`, `panel.css`, `panel.js`)

**Files:**
- Create: `src/sidepanel/panel.html`
- Create: `src/sidepanel/panel.css`
- Create: `src/sidepanel/panel.js`
- Test: `tests/panel.test.js` (uses jsdom)

**Interfaces:**
- Consumes: `buildTree` from `src/sidepanel/tree.js`.
- Produces: `render(container, tree, chrome) => void`, `activateTab(chrome, tabId) => Promise<void>`, `moveTabToGroup(chrome, tabId, groupId) => Promise<void>`, `loadAndRender(chrome, container) => Promise<void>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/panel.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/panel.test.js`
Expected: FAIL — `Cannot find module '../src/sidepanel/panel.js'`

- [ ] **Step 3: Write minimal implementation**

```html
<!-- src/sidepanel/panel.html -->
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="panel.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="panel.js"></script>
  </body>
</html>
```

```css
/* src/sidepanel/panel.css */
body {
  margin: 0;
  font: 13px system-ui, sans-serif;
}
.group-title {
  font-weight: 600;
  padding: 4px 8px;
}
.tab {
  padding: 4px 8px 4px 16px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab.active {
  background: #e8f0fe;
}
.ungrouped .tab {
  padding-left: 8px;
}
```

```js
// src/sidepanel/panel.js
import { buildTree } from './tree.js'

let draggedTabId = null

export async function activateTab(chrome, tabId) {
  await chrome.tabs.update(tabId, { active: true })
}

export async function moveTabToGroup(chrome, tabId, groupId) {
  await chrome.tabs.group({ tabIds: [tabId], groupId })
}

function makeTabRow(chrome, tab) {
  const row = document.createElement('div')
  row.className = 'tab' + (tab.active ? ' active' : '')
  row.textContent = tab.title
  row.dataset.tabId = String(tab.id)
  row.draggable = true
  row.addEventListener('click', () => activateTab(chrome, tab.id))
  row.addEventListener('dragstart', () => {
    draggedTabId = tab.id
  })
  return row
}

function makeGroupSection(chrome, group) {
  const section = document.createElement('div')
  section.className = 'group'
  section.dataset.groupId = String(group.id)

  const title = document.createElement('div')
  title.className = 'group-title'
  title.textContent = group.title
  section.appendChild(title)

  for (const tab of group.tabs) {
    section.appendChild(makeTabRow(chrome, tab))
  }

  section.addEventListener('dragover', event => event.preventDefault())
  section.addEventListener('drop', () => {
    if (draggedTabId != null) {
      moveTabToGroup(chrome, draggedTabId, group.id)
      draggedTabId = null
    }
  })

  return section
}

export function render(container, tree, chrome) {
  container.innerHTML = ''

  for (const group of tree.groups) {
    container.appendChild(makeGroupSection(chrome, group))
  }

  const ungroupedSection = document.createElement('div')
  ungroupedSection.className = 'ungrouped'
  for (const tab of tree.ungrouped) {
    ungroupedSection.appendChild(makeTabRow(chrome, tab))
  }
  container.appendChild(ungroupedSection)
}

export async function loadAndRender(chrome, container) {
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
  ])
  render(container, buildTree(tabs, groups), chrome)
}

if (typeof chrome !== 'undefined' && typeof document !== 'undefined') {
  const container = document.getElementById('root')
  const refresh = () => loadAndRender(chrome, container)
  refresh()
  chrome.tabs.onUpdated.addListener(refresh)
  chrome.tabs.onMoved.addListener(refresh)
  chrome.tabs.onRemoved.addListener(refresh)
  chrome.tabs.onActivated.addListener(refresh)
  chrome.tabGroups.onUpdated.addListener(refresh)
  chrome.tabGroups.onRemoved.addListener(refresh)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/panel.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (45 tests total: 18 grouping + 17 background + 4 tree + 6 panel)

- [ ] **Step 6: Manual smoke test**

This step has no automated test — it verifies real Chrome wiring that fakes can't cover.

1. Open `chrome://extensions`, enable Developer mode, click "Load unpacked," select this project's root directory.
2. Open `chrome://extensions/shortcuts` and confirm all three commands are listed with their suggested keys.
3. Press the toggle-sidebar shortcut on a normal web page tab: the side panel should open showing the current window's tabs; press it again: the panel should close.
4. Open a few tabs, highlight two of them (Cmd/Ctrl-click in the tab strip), press the create-tab-group shortcut: a new named/colored group should appear in Chrome's tab strip containing both tabs.
5. Click a different (ungrouped) tab to make it active, press the move-tab-to-group shortcut: it should join the group created in step 4.
6. In the side panel, drag a tab row onto a different group's header: it should move into that group in the real tab strip.

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/panel.html src/sidepanel/panel.css src/sidepanel/panel.js tests/panel.test.js
git commit -m "Add side panel UI: render, click-to-activate, drag-to-move"
```
