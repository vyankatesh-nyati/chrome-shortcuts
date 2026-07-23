import { nextGroupColor } from '../lib/grouping.js'
import { GROUP_PICKER_REQUEST_KEY } from '../lib/messages.js'
import { glyphForGroup } from './icon.js'

export async function moveTabToGroup(chrome, tabId, groupId) {
  await chrome.tabs.group({ tabIds: [tabId], groupId })
}

export function reorderGroupsWithDefaultFirst(groups, defaultGroupId) {
  if (defaultGroupId == null) return groups
  const index = groups.findIndex(group => group.id === defaultGroupId)
  if (index <= 0) return groups
  const reordered = groups.slice()
  const [defaultGroup] = reordered.splice(index, 1)
  reordered.unshift(defaultGroup)
  return reordered
}

export function filterGroups(groups, query) {
  const q = query.trim().toLowerCase()
  if (!q) return groups
  return groups.filter(group => group.title.toLowerCase().includes(q))
}

export function shouldShowCreateRow(groups, query) {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return !groups.some(group => group.title.toLowerCase() === q)
}

export function moveHighlight(current, delta, total) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(total - 1, current + delta))
}

export async function createGroupAndMoveTab(chrome, windowId, tabId, title, existingGroups) {
  const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } })
  const trimmed = title.trim()
  await chrome.tabGroups.update(groupId, {
    title: trimmed || 'New group',
    color: nextGroupColor(existingGroups),
  })
  return groupId
}

export async function openGroupPicker(chrome, panelContainer, tabId, defaultGroupId, windowId) {
  const groups = await chrome.tabGroups.query({ windowId })
  const ordered = reorderGroupsWithDefaultFirst(groups, defaultGroupId)

  const state = { query: '', highlighted: 0 }

  const overlay = document.createElement('div')
  overlay.className = 'group-picker-overlay'

  const box = document.createElement('div')
  box.className = 'group-picker-box'
  box.addEventListener('click', event => event.stopPropagation())
  overlay.appendChild(box)

  const input = document.createElement('input')
  input.className = 'group-picker-input'
  input.placeholder = 'Search or create tab group…'
  box.appendChild(input)

  const list = document.createElement('div')
  list.className = 'group-picker-list'
  box.appendChild(list)

  function close() {
    overlay.remove()
  }

  function currentFiltered() {
    return filterGroups(ordered, state.query)
  }

  function currentShowCreate() {
    return shouldShowCreateRow(ordered, state.query)
  }

  async function choose(groupId) {
    await moveTabToGroup(chrome, tabId, groupId)
    close()
  }

  async function create() {
    const freshGroups = await chrome.tabGroups.query({ windowId })
    await createGroupAndMoveTab(chrome, windowId, tabId, state.query, freshGroups)
    close()
  }

  function renderList() {
    list.innerHTML = ''
    const filtered = currentFiltered()
    const showCreate = currentShowCreate()

    filtered.forEach((group, index) => {
      const row = document.createElement('div')
      row.className = 'group-picker-row' + (index === state.highlighted ? ' highlighted' : '')
      row.dataset.groupId = String(group.id)

      const icon = document.createElement('div')
      icon.className = 'group-picker-icon'
      icon.dataset.color = group.color
      icon.textContent = glyphForGroup(group)
      row.appendChild(icon)

      const label = document.createElement('div')
      label.className = 'group-picker-label'
      label.textContent = group.title
      row.appendChild(label)

      row.addEventListener('click', () => choose(group.id))
      list.appendChild(row)
    })

    if (showCreate) {
      const createIndex = filtered.length
      const row = document.createElement('div')
      row.className = 'group-picker-row group-picker-create' + (createIndex === state.highlighted ? ' highlighted' : '')

      const icon = document.createElement('div')
      icon.className = 'group-picker-icon group-picker-create-icon'
      icon.textContent = '+'
      row.appendChild(icon)

      const label = document.createElement('div')
      label.className = 'group-picker-label'
      label.textContent = `Create tab group "${state.query.trim()}"`
      row.appendChild(label)

      row.addEventListener('click', () => create())
      list.appendChild(row)
    }
  }

  input.addEventListener('input', () => {
    state.query = input.value
    state.highlighted = 0
    renderList()
  })

  input.addEventListener('keydown', event => {
    const filtered = currentFiltered()
    const showCreate = currentShowCreate()
    const total = filtered.length + (showCreate ? 1 : 0)

    if (event.key === 'Escape') {
      close()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      state.highlighted = moveHighlight(state.highlighted, 1, total)
      renderList()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      state.highlighted = moveHighlight(state.highlighted, -1, total)
      renderList()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (state.highlighted < filtered.length) {
        choose(filtered[state.highlighted].id)
      } else if (showCreate) {
        create()
      }
    }
  })

  overlay.addEventListener('click', () => close())

  panelContainer.appendChild(overlay)
  renderList()

  // Chrome only grants the side panel frame keyboard focus if it was the
  // last frame the user actually interacted with; when the tab currently
  // holds that priority, no client-side focus() call can override it (this
  // is a deliberate anti-focus-stealing policy, not a bug here). Retrying
  // window.focus()/input.focus() does not change that outcome and instead
  // triggers Chrome's window-attention flash repeatedly, so a single
  // focus() call -- correct when the panel already has priority -- is all
  // that belongs here.
  input.focus()
}

async function readGroupPickerRequest(chrome) {
  const stored = await chrome.storage.session.get(GROUP_PICKER_REQUEST_KEY)
  return stored[GROUP_PICKER_REQUEST_KEY] || null
}

async function clearGroupPickerRequest(chrome) {
  await chrome.storage.session.set({ [GROUP_PICKER_REQUEST_KEY]: null })
}

export async function maybeOpenGroupPickerForThisWindow(chrome, panelContainer) {
  const request = await readGroupPickerRequest(chrome)
  if (!request) return

  const ownWindow = await chrome.windows.getCurrent()
  if (request.windowId !== ownWindow.id) return

  // Best-effort: claim window focus as early as possible once we know the
  // picker is about to open here, before the async group query and DOM
  // build in openGroupPicker. This does not override Chrome's focus-priority
  // policy (see openGroupPicker) but gives a script-based claim the earliest
  // possible chance, rather than one made only after further async delay.
  window.focus()

  await clearGroupPickerRequest(chrome)
  await openGroupPicker(chrome, panelContainer, request.tabId, request.defaultGroupId, request.windowId)
}
