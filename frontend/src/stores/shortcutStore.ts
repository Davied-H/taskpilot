import { create } from 'zustand'
import {
  DEFAULT_SHORTCUTS,
  type ShortcutMap,
  type ActionDef,
  eventToCombo,
  comboToString,
  isModifierOnly,
} from '../lib/keybindings'
import { ConfigService } from '../../bindings/taskpilot/services'

const CONFIG_KEY = 'keyboard_shortcuts'

interface ShortcutState {
  shortcuts: ShortcutMap
  actions: Map<string, ActionDef>
  recentCommandIds: string[]
  isPaletteOpen: boolean
  loaded: boolean

  loadShortcuts: () => Promise<void>
  saveShortcuts: (map: ShortcutMap) => Promise<void>
  rebindShortcut: (actionId: string, newCombo: string) => Promise<void>
  resetToDefaults: () => Promise<void>
  registerAction: (def: ActionDef) => void
  findActionForEvent: (e: KeyboardEvent) => string | null
  executeAction: (actionId: string) => void
  addRecentCommand: (actionId: string) => void
  getConflict: (actionId: string, combo: string) => string | null
  openPalette: () => void
  closePalette: () => void
  togglePalette: () => void
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
  actions: new Map(),
  recentCommandIds: [],
  isPaletteOpen: false,
  loaded: false,

  loadShortcuts: async () => {
    try {
      const raw = await ConfigService.GetConfig(CONFIG_KEY)
      if (raw) {
        const custom: ShortcutMap = JSON.parse(raw)
        // Merge: custom overrides defaults, new defaults are added
        const merged = { ...DEFAULT_SHORTCUTS, ...custom }
        set({ shortcuts: merged, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }

    // Load recent commands
    try {
      const raw = await ConfigService.GetConfig('recent_commands')
      if (raw) {
        set({ recentCommandIds: JSON.parse(raw) })
      }
    } catch { /* ignore */ }
  },

  saveShortcuts: async (map: ShortcutMap) => {
    set({ shortcuts: map })
    await ConfigService.SetConfig(CONFIG_KEY, JSON.stringify(map))
  },

  rebindShortcut: async (actionId: string, newCombo: string) => {
    const { shortcuts, saveShortcuts } = get()
    // Remove the combo from any other action
    const updated = { ...shortcuts }
    for (const [id, combo] of Object.entries(updated)) {
      if (combo === newCombo && id !== actionId) {
        updated[id] = ''
      }
    }
    updated[actionId] = newCombo
    await saveShortcuts(updated)
  },

  resetToDefaults: async () => {
    const defaults = { ...DEFAULT_SHORTCUTS }
    set({ shortcuts: defaults })
    await ConfigService.SetConfig(CONFIG_KEY, JSON.stringify(defaults))
  },

  registerAction: (def: ActionDef) => {
    const actions = new Map(get().actions)
    actions.set(def.id, def)
    set({ actions })
  },

  findActionForEvent: (e: KeyboardEvent) => {
    const combo = eventToCombo(e)
    if (isModifierOnly(combo)) return null
    const comboStr = comboToString(combo)
    if (!comboStr) return null

    const { shortcuts, actions } = get()
    for (const [actionId, boundCombo] of Object.entries(shortcuts)) {
      if (boundCombo === comboStr && actions.has(actionId)) {
        const action = actions.get(actionId)!
        if (action.when && !action.when()) continue
        return actionId
      }
    }
    return null
  },

  executeAction: (actionId: string) => {
    const { actions, addRecentCommand } = get()
    const action = actions.get(actionId)
    if (action) {
      action.handler()
      addRecentCommand(actionId)
    }
  },

  addRecentCommand: (actionId: string) => {
    if (actionId === 'general.escape' || actionId === 'general.commandPalette') return
    const { recentCommandIds } = get()
    const updated = [actionId, ...recentCommandIds.filter(id => id !== actionId)].slice(0, 5)
    set({ recentCommandIds: updated })
    ConfigService.SetConfig('recent_commands', JSON.stringify(updated)).catch(() => {})
  },

  getConflict: (actionId: string, combo: string) => {
    const { shortcuts } = get()
    for (const [id, boundCombo] of Object.entries(shortcuts)) {
      if (boundCombo === combo && id !== actionId) {
        return id
      }
    }
    return null
  },

  openPalette: () => set({ isPaletteOpen: true }),
  closePalette: () => set({ isPaletteOpen: false }),
  togglePalette: () => set(s => ({ isPaletteOpen: !s.isPaletteOpen })),
}))
