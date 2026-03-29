import React from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { FiBarChart2 as _FiBarChart2 } from 'react-icons/fi'
const FiBarChart2 = _FiBarChart2 as unknown as React.FC<{ size?: number; className?: string }>

import MarkdownRenderer from './MarkdownRenderer'

interface DailySummaryProps {
  summary: string
  onClose: () => void
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
      <div className="px-5 py-4">
        <MarkdownRenderer content={summary} />
      </div>
    </motion.div>
  )
}
