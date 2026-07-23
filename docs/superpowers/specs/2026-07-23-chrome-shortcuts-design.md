# Chrome Shortcuts Extension — Design

## Goal

A Manifest V3 Chrome extension exposing keyboard shortcuts for three actions:
1. Open/close a vertical sidebar listing tabs and tab groups.
2. Create a tab group from the current tab(s).
3. Move the active tab under a tab group.

## Context / key constraint

Chrome 146 shipped a native vertical-tabs strip (right-click tab bar → "Show
tabs vertically"), but it exposes **no extension API and no built-in keyboard
shortcut**. The only way to touch it programmatically is OS-level native
messaging (e.g. AppleScript), which is macOS-only, fragile, and requires a
separate native host binary — rejected as disproportionate for this feature.

Decision: build our own `chrome.sidePanel`-based vertical tab/group list as
a lookalike "sidebar," fully scriptable via `chrome.commands`. This does not
hook into or replace Chrome's native strip; if a user separately enables the
native feature, they may see both surfaces. Accepted trade-off.

`chrome.sidePanel.close()` (Chrome 141+) and the `onOpened`/`onClosed` events
(Chrome 142+) make a real open/close toggle possible — verified against
current Chrome for Developers docs. Minimum Chrome version: 142.

## Non-goals

- Controlling Chrome's native vertical-tabs strip.
- Any UI beyond the side panel (no options page, no popup).
- Cross-browser support (Chrome only).

## Architecture

Plain JavaScript (ES modules), no bundler, no TypeScript — zero build step.

```
manifest.json
src/
  background.js        service worker: chrome.commands.onCommand -> handlers
  lib/
    grouping.js         pure decision functions, no chrome.* calls
  sidepanel/
    panel.html
    panel.js            renders tab/group list, click-to-switch, drag-to-move
    panel.css
icons/
tests/
  grouping.test.js
  background.test.js
```

`lib/grouping.js` holds every decision that would otherwise need a live
Chrome environment to test:

- `pickTabsToGroup(highlightedTabs)` — all highlighted tabs, or just the
  active tab if only one is highlighted.
- `nextGroupColor(existingGroups)` — cycles Chrome's 9 group colors, skipping
  colors already used in the window; wraps around once all are used.
- `nameForGroup(activeTab)` — hostname of the active tab's URL, truncated.
- `pickTargetGroupForMove(groups)` — the most-recently-created-or-updated
  group, or `null` if none exist.

`background.js` is a thin adapter: it calls these pure functions and passes
the result to `chrome.tabs` / `chrome.tabGroups` / `chrome.sidePanel`. Recency
tracking for "most-recently-created-or-updated group" and per-window panel
open/closed state both live in `chrome.storage.session` (cleared automatically
when the browsing session ends; survives service-worker restarts within it).

`sidepanel/panel.js` queries `chrome.tabs` and `chrome.tabGroups` on load and
on their update/move/remove events, renders a vertical list nested by group,
supports click-to-activate a tab, and HTML5 drag-and-drop of a tab row onto a
group header (calls `chrome.tabs.group({ tabIds, groupId })`).

## Shortcuts (`chrome.commands`)

| Command | Default behavior |
|---|---|
| `toggle-sidebar` | Reads tracked open/closed state for the window; calls `sidePanel.open()` or `sidePanel.close()` accordingly. |
| `create-tab-group` | `pickTabsToGroup` on highlighted tabs in the current window; `chrome.tabs.group()`; names/colors the new group via `nameForGroup`/`nextGroupColor`; records it as the "most recent" group. |
| `move-tab-to-group` | `pickTargetGroupForMove` on groups in the current window; if one exists, `chrome.tabs.group({ tabIds: [activeTab.id], groupId })`; if none, briefly sets badge text (e.g. "!") cleared on the next relevant action — no error thrown, no `chrome.notifications` permission needed. |

All three are user-remappable via `chrome://extensions/shortcuts`.

## Permissions

`tabs`, `tabGroups`, `sidePanel`, `storage`. No host permissions, no content
scripts — the extension never reads page content.

## Error handling / edge cases

- No highlighted tabs when creating a group (shouldn't happen — there's
  always an active tab, which counts as highlighted): falls back to the
  active tab alone.
- All 9 group colors already used in the window: wraps around and reuses the
  first color.
- Moving a tab that's already in the target group: `chrome.tabs.group` is a
  no-op in that case; no special handling needed.
- No groups exist yet when moving: badge feedback, not an error.
- Side panel open/closed tracking gets out of sync (e.g. user closes the
  panel via Chrome's own UI, not our shortcut): corrected by the
  `onOpened`/`onClosed` listeners updating `chrome.storage.session` whenever
  the real state changes, regardless of source.

## Testing strategy

Vitest.

- `grouping.js`: full unit coverage against plain-object fixtures — no
  Chrome mocking required. Cases: single highlighted tab, multiple highlighted
  tabs, zero/some/all colors used, no existing groups, one existing group,
  several groups with different update timestamps.
- `background.js`: a small hand-rolled `chrome.*` fake (no new dependency)
  verifying each command dispatches to the right lib function and the right
  `chrome.tabs`/`chrome.tabGroups`/`chrome.sidePanel` call.
- `panel.js`: rendering logic (given tabs+groups data, produce the expected
  DOM structure) separated from event-wiring so it can be tested against
  fixtures without a live browser.

## Assumptions (conservative defaults, easy to amend)

- Group naming: active tab's hostname.
- Move-to-group default target: most-recently-created-or-updated group.
- No-op feedback: badge text, not `chrome.notifications` (avoids an extra
  permission).
- No build step / no TypeScript, given the project's small size.
