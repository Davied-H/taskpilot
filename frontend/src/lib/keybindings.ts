// ── Key combo types and utilities ───────────────────────────────

export interface KeyCombo {
  meta: boolean
  ctrl: boolean
  shift: boolean
  alt: boolean
  key: string // lowercase, e.g. "k", "1", "enter", "backspace"
}

export type ActionCategory = 'navigation' | 'tasks' | 'ai' | 'general'

export interface ActionDef {
  id: string
  label: string
  labelEn?: string
  category: ActionCategory
  icon?: string
  handler: () => void | Promise<void>
  keywords?: string[]
  when?: () => boolean
}

export type ShortcutMap = Record<string, string> // actionId -> combo string

// ── Default shortcuts ──────────────────────────────────────────

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  'nav.today':             'meta+1',
  'nav.projects':          'meta+2',
  'nav.settings':          'meta+comma',
  'nav.logs':              'meta+3',
  'nav.nextProject':       'meta+bracketright',
  'nav.prevProject':       'meta+bracketleft',
  'task.quickAdd':         'meta+shift+n',
  'task.newInProject':     'meta+n',
  'task.complete':         'meta+d',
  'task.delete':           'backspace',
  'task.edit':             'enter',
  'ai.togglePanel':        'meta+shift+a',
  'ai.chatWindow':         'meta+shift+o',
  'ai.dailySummary':       'meta+shift+s',
  'general.commandPalette':'meta+k',
  'general.search':        'meta+f',
  'general.escape':        'escape',
}

// ── Reserved combos (system / browser, cannot rebind) ──────────

export const RESERVED_COMBOS = new Set([
  'meta+q', 'meta+c', 'meta+v', 'meta+x', 'meta+a',
  'meta+z', 'meta+shift+z', 'meta+r', 'meta+w',
])

// ── Utility functions ───────────────────────��──────────────────

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  'arrowup': 'up',
  'arrowdown': 'down',
  'arrowleft': 'left',
  'arrowright': 'right',
  '[': 'bracketleft',
  ']': 'bracketright',
  ',': 'comma',
  '.': 'period',
  '/': 'slash',
  '\\': 'backslash',
  '`': 'backquote',
  '-': 'minus',
  '=': 'equal',
  ';': 'semicolon',
  "'": 'quote',
}

export function eventToCombo(e: KeyboardEvent): KeyCombo {
  const rawKey = e.key.toLowerCase()
  const key = KEY_ALIASES[rawKey] || rawKey
  return {
    meta: e.metaKey,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    key,
  }
}

export function comboToString(c: KeyCombo): string {
  const parts: string[] = []
  if (c.meta) parts.push('meta')
  if (c.ctrl) parts.push('ctrl')
  if (c.alt) parts.push('alt')
  if (c.shift) parts.push('shift')
  if (c.key && !['meta', 'control', 'shift', 'alt'].includes(c.key)) {
    parts.push(c.key)
  }
  return parts.join('+')
}

export function stringToCombo(s: string): KeyCombo {
  const parts = s.toLowerCase().split('+')
  return {
    meta: parts.includes('meta'),
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts.filter(p => !['meta', 'ctrl', 'shift', 'alt'].includes(p))[0] || '',
  }
}

const DISPLAY_MAP: Record<string, string> = {
  meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧',
  enter: '↩', escape: 'Esc', backspace: '⌫', delete: '⌦',
  space: '␣', tab: '⇥', up: '↑', down: '↓', left: '←', right: '→',
  comma: ',', period: '.', slash: '/', backslash: '\\',
  bracketleft: '[', bracketright: ']', minus: '-', equal: '=',
  semicolon: ';', quote: "'", backquote: '`',
}

export function comboToDisplay(s: string): string {
  if (!s) return ''
  const parts = s.toLowerCase().split('+')
  return parts
    .map(p => DISPLAY_MAP[p] || p.toUpperCase())
    .join('')
}

export function isModifierOnly(combo: KeyCombo): boolean {
  return ['meta', 'control', 'shift', 'alt'].includes(combo.key) || !combo.key
}
