import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { useShortcutStore } from '../stores/shortcutStore'
import {
  comboToDisplay,
  comboToString,
  eventToCombo,
  isModifierOnly,
  RESERVED_COMBOS,
  type ActionCategory,
} from '../lib/keybindings'
import {
  FiCommand as _FiCommand,
  FiRotateCcw as _FiRotateCcw,
  FiCheck as _FiCheck,
  FiAlertTriangle as _FiAlertTriangle,
} from 'react-icons/fi'
import React from 'react'
type FiIcon = React.FC<{ size?: number; className?: string }>
const FiCommand = _FiCommand as unknown as FiIcon
const FiRotateCcw = _FiRotateCcw as unknown as FiIcon
const FiCheck = _FiCheck as unknown as FiIcon
const FiAlertTriangle = _FiAlertTriangle as unknown as FiIcon

const CATEGORY_ORDER: ActionCategory[] = ['navigation', 'tasks', 'ai', 'general']
const CATEGORY_LABELS: Record<ActionCategory, string> = {
  navigation: '导航',
  tasks: '任务',
  ai: 'AI',
  general: '通用',
}

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
}

interface Props {
  sectionIndex: number
}

export default function ShortcutSettings({ sectionIndex }: Props) {
  const actions = useShortcutStore(s => s.actions)
  const shortcuts = useShortcutStore(s => s.shortcuts)
  const rebindShortcut = useShortcutStore(s => s.rebindShortcut)
  const resetToDefaults = useShortcutStore(s => s.resetToDefaults)
  const getConflict = useShortcutStore(s => s.getConflict)

  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [pendingCombo, setPendingCombo] = useState<string | null>(null)
  const [conflictId, setConflictId] = useState<string | null>(null)
  const [resetDone, setResetDone] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  // Recording mode keydown listener
  const handleRecordKey = useCallback((e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const combo = eventToCombo(e)
    if (isModifierOnly(combo)) return

    const comboStr = comboToString(combo)

    if (RESERVED_COMBOS.has(comboStr)) {
      // Flash warning - reserved combo
      setPendingCombo(null)
      setConflictId('__reserved__')
      setTimeout(() => {
        setConflictId(null)
        setRecordingId(null)
      }, 2000)
      return
    }

    // Check conflict
    const conflict = getConflict(recordingId!, comboStr)
    if (conflict) {
      setPendingCombo(comboStr)
      setConflictId(conflict)
      return
    }

    // No conflict — save immediately
    rebindShortcut(recordingId!, comboStr)
    setRecordingId(null)
    setPendingCombo(null)
    setConflictId(null)
  }, [recordingId, getConflict, rebindShortcut])

  useEffect(() => {
    if (!recordingId) return
    window.addEventListener('keydown', handleRecordKey, { capture: true })
    return () => window.removeEventListener('keydown', handleRecordKey, { capture: true })
  }, [recordingId, handleRecordKey])

  function startRecording(actionId: string) {
    setRecordingId(actionId)
    setPendingCombo(null)
    setConflictId(null)
  }

  function cancelRecording() {
    setRecordingId(null)
    setPendingCombo(null)
    setConflictId(null)
  }

  function confirmOverride() {
    if (pendingCombo && recordingId) {
      rebindShortcut(recordingId, pendingCombo)
    }
    setRecordingId(null)
    setPendingCombo(null)
    setConflictId(null)
  }

  async function handleReset() {
    await resetToDefaults()
    setConfirmingReset(false)
    setResetDone(true)
    setTimeout(() => setResetDone(false), 2000)
  }

  function handleResetClick() {
    if (confirmingReset) {
      handleReset()
    } else {
      setConfirmingReset(true)
      setTimeout(() => setConfirmingReset(false), 3000)
    }
  }

  // Group actions by category
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: Array.from(actions.values()).filter(a => a.category === cat && a.id !== 'general.escape'),
  })).filter(g => g.items.length > 0)

  return (
    <motion.section
      custom={sectionIndex}
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
      className="bg-white border border-stone-200/60 rounded-2xl p-6"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center">
            <FiCommand className="text-stone-600" size={16} />
          </div>
          <h2 className="text-base font-semibold text-stone-800">键盘快捷键</h2>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleResetClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            confirmingReset
              ? 'text-red-500 bg-red-50 hover:bg-red-100'
              : 'text-stone-500 hover:text-stone-700 bg-stone-50 hover:bg-stone-100'
          }`}
        >
          {resetDone ? <FiCheck size={12} /> : <FiRotateCcw size={12} />}
          {resetDone ? '已恢复' : confirmingReset ? '确认重置？' : '恢复默认'}
        </motion.button>
      </div>

      <div className="space-y-4">
        {grouped.map(group => (
          <div key={group.category}>
            <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">
              {group.label}
            </div>
            <div className="rounded-xl border border-stone-100 overflow-hidden divide-y divide-stone-50">
              {group.items.map(action => {
                const isRecording = recordingId === action.id
                const comboStr = shortcuts[action.id] || ''
                const display = comboToDisplay(comboStr)

                return (
                  <div
                    key={action.id}
                    className="flex items-center justify-between px-3.5 py-2.5 hover:bg-stone-50/50 transition-colors"
                  >
                    <span className="text-sm text-stone-700">{action.label}</span>

                    {isRecording ? (
                      <div className="flex items-center gap-2">
                        {conflictId === '__reserved__' ? (
                          <span className="text-xs text-red-500 flex items-center gap-1">
                            <FiAlertTriangle size={11} />
                            系统占用
                          </span>
                        ) : conflictId && pendingCombo ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-amber-600">
                              已绑定到「{actions.get(conflictId)?.label}」
                            </span>
                            <button
                              onClick={confirmOverride}
                              className="text-[10px] px-1.5 py-0.5 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
                            >
                              替换
                            </button>
                            <button
                              onClick={cancelRecording}
                              className="text-[10px] px-1.5 py-0.5 bg-stone-200 text-stone-600 rounded hover:bg-stone-300 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-indigo-500 animate-pulse">
                              按下新快捷键...
                            </span>
                            <button
                              onClick={cancelRecording}
                              className="text-[10px] px-1.5 py-0.5 text-stone-400 hover:text-stone-600 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => startRecording(action.id)}
                        className={`px-2 py-1 rounded-lg text-xs font-mono transition-all ${
                          display
                            ? 'text-stone-500 bg-stone-100 hover:bg-indigo-50 hover:text-indigo-600 hover:ring-1 hover:ring-indigo-200'
                            : 'text-stone-300 bg-stone-50 hover:bg-stone-100 hover:text-stone-500'
                        }`}
                      >
                        {display || '未设置'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[10px] text-stone-400">
        点击快捷键可重新绑定。按 <kbd className="px-1 py-0.5 bg-stone-100 rounded text-stone-500">Esc</kbd> 取消录入。
      </p>
    </motion.section>
  )
}
