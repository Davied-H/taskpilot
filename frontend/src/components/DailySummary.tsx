import React from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { FiBarChart2 as _FiBarChart2 } from 'react-icons/fi'
const FiBarChart2 = _FiBarChart2 as unknown as React.FC<{ size?: number; className?: string }>

interface DailySummaryProps {
  summary: string
  onClose: () => void
}

function renderMarkdown(text: string): JSX.Element[] {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('## ')) {
      return <h3 key={i} className="text-sm font-semibold text-stone-800 mt-3 mb-1">{line.slice(3)}</h3>
    }
    if (line.startsWith('# ')) {
      return <h2 key={i} className="text-base font-bold text-stone-900 mt-2 mb-1">{line.slice(2)}</h2>
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={i} className="flex gap-2 text-sm text-stone-600 pl-2">
          <span className="text-stone-300 flex-shrink-0">•</span>
          <span>{line.slice(2)}</span>
        </div>
      )
    }
    if (line.trim() === '') {
      return <div key={i} className="h-2" />
    }
    return <p key={i} className="text-sm text-stone-600">{line}</p>
  })
}

export default function DailySummary({ summary, onClose }: DailySummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0, y: -10 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-4 bg-white rounded-2xl border border-stone-200/60 overflow-hidden"
      style={{ boxShadow: 'var(--shadow-md)' }}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 bg-gradient-to-r from-indigo-50/80 to-purple-50/60">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <FiBarChart2 size={14} className="text-indigo-500" />
          今日摘要
        </h3>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-600 transition-colors p-0.5 rounded-md hover:bg-stone-100"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-5 py-4 space-y-0.5">
        {renderMarkdown(summary)}
      </div>
    </motion.div>
  )
}
