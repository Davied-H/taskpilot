import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { getProactiveSuggestions } from '../hooks/useWails'
import MarkdownRenderer from './MarkdownRenderer'

interface Props {
  onSend: (message: string) => void
}

const suggestionsCache: Record<string, { text: string; timestamp: number }> = {}
const CACHE_TTL = 30 * 60 * 1000

export default function ProactiveSuggestions({ onSend }: Props) {
  const { selectedProjectId } = useAppStore()
  const [suggestions, setSuggestions] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const fetchedRef = useRef<string | null>(null)

  useEffect(() => {
    const projectId = selectedProjectId || ''
    if (fetchedRef.current === projectId) return

    const cached = suggestionsCache[projectId]
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setSuggestions(cached.text)
      fetchedRef.current = projectId
      return
    }

    fetchedRef.current = projectId
    setLoading(true)
    setSuggestions(null)

    getProactiveSuggestions(projectId)
      .then((text) => {
        setSuggestions(text)
        suggestionsCache[projectId] = { text, timestamp: Date.now() }
      })
      .catch(() => {
        // Silently fail — suggestions are optional
      })
      .finally(() => setLoading(false))
  }, [selectedProjectId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-400">
        <Lightbulb size={12} className="animate-pulse" />
        <span>正在分析任务状态...</span>
      </div>
    )
  }

  if (!suggestions) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-gradient-to-r from-amber-50/80 to-orange-50/60 border border-amber-200/50 rounded-xl overflow-hidden"
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100/30 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Lightbulb size={12} />
            <span>AI 建议</span>
          </div>
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="px-3 pb-2.5 text-[12px] text-stone-600 leading-relaxed cursor-pointer"
            onClick={() => onSend('请详细分析一下当前的任务状态并给出建议')}
            title="点击与 AI 深入讨论"
          >
            <MarkdownRenderer content={suggestions} />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
