import { useEffect } from 'react'
import { useShortcutStore } from '../stores/shortcutStore'

/**
 * Single global keydown listener for all keyboard shortcuts.
 * Replaces per-feature ad-hoc handlers.
 */
export function useShortcuts() {
  const loaded = useShortcutStore(s => s.loaded)

  useEffect(() => {
    if (!loaded) return

    const handler = (e: KeyboardEvent) => {
      const store = useShortcutStore.getState()

      // Skip if user is typing in an input/textarea, except Escape and Cmd+K
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      const actionId = store.findActionForEvent(e)
      if (!actionId) return

      // In input fields, only allow escape and command palette
      if (isInput && actionId !== 'general.escape' && actionId !== 'general.commandPalette') {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      store.executeAction(actionId)
    }

    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [loaded])
}
