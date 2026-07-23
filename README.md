# Chrome Shortcuts

A Manifest V3 Chrome extension exposing keyboard shortcuts for three actions:

1. **Toggle vertical sidebar** — opens/closes a side panel listing your tabs, nested under their tab groups.
2. **Create tab group** — groups the current tab (or all highlighted tabs) into a new, auto-named and auto-colored group.
3. **Move tab to group** — moves the active tab into the most recently used tab group.

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
| Move tab to group | `Ctrl+Shift+M` | `Cmd+Shift+M` | Move the active tab into the most recent group |

- **Create tab group**: if you have multiple tabs highlighted (Ctrl/Cmd-click in the tab strip), all of them are grouped together; otherwise just the active tab is grouped. The new group is named after the active tab's hostname and given the next unused color.
- **Move tab to group**: moves the active tab into the most recently created/updated group in the current window. If no group exists yet, the toolbar badge briefly shows `!` (cleared automatically the next time a move succeeds).
- **Side panel**: click a tab row to switch to it; drag a tab row onto a group's header to move it into that group.

If a shortcut doesn't fire, check `chrome://extensions/shortcuts` for a conflict with another extension or Chrome's own bindings, and rebind it there.

## Updating the extension after code changes

Chrome doesn't hot-reload unpacked extensions. After editing source files:

1. Go to `chrome://extensions`.
2. Click the reload icon (circular arrow) on the "Chrome Shortcuts" card.
3. If you edited `src/sidepanel/panel.js`/`.html`/`.css`, also close and reopen the side panel.

## Development

```bash
npm install
npm test        # runs the Vitest suite (48 tests)
```

Project layout:

- `src/lib/grouping.js` — pure decision functions (tab/color/name/target-group selection), fully unit-tested without any Chrome API.
- `src/background.js` — the service worker; wires the three `chrome.commands` to their handlers.
- `src/sidepanel/` — the side panel UI (`panel.html`/`.css`/`.js`) and `tree.js` (pure tab/group tree builder).
- `scripts/gen-icons.cjs` — regenerates `icons/*.png` if needed (`node scripts/gen-icons.cjs`).

Design and implementation history: `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Known limitation

The manual end-to-end smoke test (loading the unpacked extension in real Chrome and exercising all three shortcuts + drag-and-drop) should be run after any change — automated tests cover the decision logic and DOM rendering, but not real Chrome's user-gesture/timing behavior.
