import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useShortcutStore } from '../stores/shortcutStore'
import { useAppStore } from '../stores/appStore'
import { comboToDisplay } from '../lib/keybindings'
import { scoreAction, fuzzyScore } from '../lib/fuzzySearch'
import type { ActionCategory } from '../lib/keybindings'

interface ResultItem {
  type: 'action' | 'task'
  id: string
  label: string
  category: string
  shortcut?: string
  score: number
  taskProjectId?: string
}

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  navigation: '导航',
  tasks: '任务',
  ai: 'AI',
  general: '通用',
}

const CATEGORY_ORDER: ActionCategory[] = ['navigation', 'tasks', 'ai', 'general']

export default function CommandPalette() {
  const isPaletteOpen = useShortcutStore(s => s.isPaletteOpen)
  const closePalette = useShortcutStore(s => s.closePalette)
  const actions = useShortcutStore(s => s.actions)
  const shortcuts = useShortcutStore(s => s.shortcuts)
  const recentCommandIds = useShortcutStore(s => s.recentCommandIds)
  const executeAction = useShortcutStore(s => s.executeAction)
  const tasks = useAppStore(s => s.tasks)
  const projects = useAppStore(s => s.projects)
  const setSelectedProjectId = useAppStore(s => s.setSelectedProjectId)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on open/close
  useEffect(() => {
    if (isPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isPaletteOpen])

  // Build results
  const results = useMemo((): ResultItem[] => {
    const items: ResultItem[] = []

    if (!query) {
      // Show recent commands first, then all actions by category
      const seen = new Set<string>()

      // Recent commands
      for (const id of recentCommandIds) {
        const action = actions.get(id)
        if (action) {
          items.push({
            type: 'action',
            id: action.id,
            label: action.label,
            category: 'recent',
            shortcut: shortcuts[action.id] ? comboToDisplay(shortcuts[action.id]) : undefined,
            score: 100,
          })
          seen.add(id)
        }
      }

      // All actions grouped by category
      for (const cat of CATEGORY_ORDER) {
        for (const [, action] of actions) {
          if (action.category === cat && !seen.has(action.id) && action.id !== 'general.escape') {
            items.push({
              type: 'action',
              id: action.id,
              label: action.label,
              category: CATEGORY_LABELS[cat],
              shortcut: shortcuts[action.id] ? comboToDisplay(shortcuts[action.id]) : undefined,
              score: 0,
            })
          }
        }
      }

      return items
    }

    // Fuzzy search actions
    for (const [, action] of actions) {
      if (action.id === 'general.escape') continue
      const score = scoreAction(query, action.label, action.labelEn, action.keywords)
      if (score > 0) {
        items.push({
          type: 'action',
          id: action.id,
          label: action.label,
          category: CATEGORY_LABELS[action.category],
          shortcut: shortcuts[action.id] ? comboToDisplay(shortcuts[action.id]) : undefined,
          score,
        })
      }
    }

    // Fuzzy search tasks
    for (const task of tasks) {
      const score = fuzzyScore(query, task.title)
      if (score > 0) {
        const project = projects.find(p => p.id === task.projectId)
        items.push({
          type: 'task',
          id: task.id,
          label: task.title,
          category: project?.name || '任务',
          score,
          taskProjectId: task.projectId,
        })
      }
    }

    // Sort by score descending, limit to 15
    items.sort((a, b) => b.score - a.score)
    return items.slice(0, 15)
  }, [query, actions, shortcuts, recentCommandIds, tasks, projects])

  // Clamp selected index
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.querySelector(`[data-flat-index="${selectedIndex}"]`) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  function handleSelect(item: ResultItem) {
    closePalette()
    if (item.type === 'action') {
      executeAction(item.id)
    } else if (item.type === 'task' && item.taskProjectId) {
      setSelectedProjectId(item.taskProjectId)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) handleSelect(results[selectedIndex])
        break
      case 'Escape':
        e.preventDefault()
        closePalette()
        break
    }
  }

  // Group results by category for display
  const groupedResults = useMemo(() => {
    const groups: { category: string; items: (ResultItem & { flatIndex: number })[] }[] = []
    let flatIndex = 0
    let currentCat = ''

    for (const item of results) {
      if (item.category !== currentCat) {
        currentCat = item.category
        groups.push({ category: currentCat, items: [] })
      }
      groups[groups.length - 1].items.push({ ...item, flatIndex })
      flatIndex++
    }
    return groups
  }, [results])

  if (!isPaletteOpen) return null

  return (
    <AnimatePresence>
      {isPaletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={closePalette}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-stone-200/60 overflow-hidden"
            onClick={e => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-stone-100">
              <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="输入命令或搜索任务..."
                className="flex-1 bg-transparent text-sm text-stone-800 placeholder-stone-400 outline-none"
              />
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-stone-400 bg-stone-100 rounded">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1.5">
              {results.length === 0 && query && (
                <div className="px-4 py-8 text-center text-sm text-stone-400">
                  没有找到匹配的命令或任务
                </div>
              )}

              {groupedResults.map(group => (
                <div key={group.category}>
                  <div className="px-4 pt-2.5 pb-1 text-[10px] font-semibold text-stone-400 uppercase tracking-widest">
                    {group.category === 'recent' ? '最近' : group.category}
                  </div>
                  {group.items.map(item => (
                    <button
                      key={`${item.type}-${item.id}`}
                      data-flat-index={item.flatIndex}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        item.flatIndex === selectedIndex
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-stone-700 hover:bg-stone-50'
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(item.flatIndex)}
                    >
                      {/* Icon indicator */}
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        item.type === 'task' ? 'bg-amber-400' : 'bg-indigo-400'
                      }`} />

                      {/* Label */}
                      <span className="flex-1 text-sm truncate">{item.label}</span>

                      {/* Task project badge */}
                      {item.type === 'task' && (
                        <span className="text-[10px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                          {item.category}
                        </span>
                      )}

                      {/* Shortcut badge */}
                      {item.shortcut && (
                        <kbd className="text-[11px] font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded min-w-[2rem] text-center">
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-stone-100 flex items-center gap-4 text-[10px] text-stone-400">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-stone-100 rounded">↑↓</kbd> 导航
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-stone-100 rounded">↩</kbd> 执行
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-stone-100 rounded">ESC</kbd> 关闭
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
