# Chrome Shortcuts

A Manifest V3 Chrome extension exposing keyboard shortcuts for three actions:

1. **Toggle vertical sidebar** — opens/closes a side panel listing your tabs, nested under their tab groups.
2. **Create tab group** — groups the current tab (or all highlighted tabs) into a new, auto-named and auto-colored group.
3. **Move tab to group** — opens a searchable popup listing your tab groups (most recently used one pre-selected) to move the active tab into, or to create a new group on the fly.

> Chrome's own experimental native vertical-tabs strip has no extension API, so shortcut 1 is this extension's own side panel (`chrome.sidePanel`), not a toggle for Chrome's native feature. See `docs/superpowers/specs/2026-07-23-chrome-shortcuts-design.md` for why.

## Requirements

- Google Chrome 142 or later.
- Node.js + npm (only needed for running tests, not for using the extension).

## Installation (load unpacked)

Chrome extensions built like this one (not published to the Web Store) are installed via "Load unpacked":

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select this project's root folder (the one containing `manifest.json`).
5. The extension appears in your extensions list and toolbar.

## Usage

Open `chrome://extensions/shortcuts` to see and customize the three keyboard shortcuts. Defaults:

| Shortcut | Windows/Linux | macOS | Action |
|---|---|---|---|
| Toggle sidebar | `Ctrl+Shift+E` | `Cmd+Shift+E` | Open/close the side panel |
| Create tab group | `Ctrl+Shift+G` | `Cmd+Shift+G` | Group the current tab(s) |
| Move tab to group | `Ctrl+Shift+M` | `Cmd+Shift+M` | Open the group picker for the active tab |

- **Create tab group**: if you have multiple tabs highlighted (Ctrl/Cmd-click in the tab strip), all of them are grouped together; otherwise just the active tab is grouped. The new group is named after the active tab's hostname and given the next unused color.
- **Move tab to group**: opens the side panel (if closed) and a search popup over it. Type to filter groups by name, or type a name that doesn't match anything to reveal a "Create tab group …" option. The most-recently-used group is pre-highlighted, so pressing Enter immediately (without typing) reproduces the old auto-pick behavior. Arrow keys move the highlight, Escape cancels, clicking outside the popup also cancels.
- **Side panel**: click a tab row to switch to it; drag a tab row onto a group's header to move it into that group; hover a tab row to reveal a close (✕) button. The panel's colors follow your OS's light/dark setting (`prefers-color-scheme`) — this is the only theme signal Chrome exposes to extension pages, so it tracks your system setting rather than Chrome's own in-app appearance override when the two differ.

If a shortcut doesn't fire, check `chrome://extensions/shortcuts` for a conflict with another extension or Chrome's own bindings, and rebind it there.

## Updating the extension after code changes

Chrome doesn't hot-reload unpacked extensions. After editing source files:

1. Go to `chrome://extensions`.
2. Click the reload icon (circular arrow) on the "Chrome Shortcuts" card.
3. If you edited `src/sidepanel/panel.js`/`.html`/`.css`, also close and reopen the side panel.

## Development

```bash
npm install
npm test        # runs the Vitest suite (102 tests)
```

Project layout:

- `src/lib/grouping.js` — pure decision functions (tab/color/name/target-group selection), fully unit-tested without any Chrome API.
- `src/lib/messages.js` — the `chrome.storage.session` key shared between the background service worker and the side panel (background writes a group-picker request, the panel reads/clears it).
- `src/background.js` — the service worker; wires the three `chrome.commands` to their handlers.
- `src/sidepanel/` — the side panel UI: `panel.html`/`.css`/`.js` (tab list), `tree.js` (pure tab/group tree builder), `icon.js` (favicon/glyph/color helpers), `group-picker.js` (the move-to-group search popup: filtering, keyboard nav, and the group create/select actions).
- `scripts/gen-icons.cjs` — regenerates `icons/*.png` if needed (`node scripts/gen-icons.cjs`).

Design and implementation history: `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Known limitations

- The manual end-to-end smoke test (loading the unpacked extension in real Chrome and exercising all three shortcuts + drag-and-drop) should be run after any change — automated tests cover the decision logic and DOM rendering, but not real Chrome's user-gesture/timing behavior.
- Chrome doesn't always reliably hand keyboard focus to a side panel opened via a shortcut (as opposed to a direct click). The group picker retries focusing its search box across a short window after opening, but this is a best-effort mitigation for a known Chrome platform limitation, not a guaranteed fix.
