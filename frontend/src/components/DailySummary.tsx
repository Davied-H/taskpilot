import React from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { FiBarChart2 as _FiBarChart2 } from 'react-icons/fi'
const FiBarChart2 = _FiBarChart2 as unknown as React.FC<{ size?: number; className?: string }>

interface DailySummaryProps {
  summary: string
  onClose: () => void
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[0].startsWith('**')) {
      parts.push(<strong key={match.index} className="font-semibold text-stone-800">{match[2]}</strong>)
    } else {
      parts.push(
        <code key={match.index} className="bg-stone-100 rounded px-1 py-0.5 text-xs font-mono text-indigo-600">
          {match[3]}
        </code>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? <>{parts}</> : text
}

function renderMarkdown(text: string): JSX.Element[] {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={i} className="bg-stone-100 rounded-lg p-3 my-2 text-xs overflow-x-auto whitespace-pre-wrap font-mono border border-stone-200/60 text-stone-700">
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      i++
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-stone-800 mt-3 mb-1">{renderInline(line.slice(3))}</h3>)
      i++
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="text-base font-bold text-stone-900 mt-2 mb-1">{renderInline(line.slice(2))}</h2>)
      i++
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-2 text-sm text-stone-600 pl-2 py-0.5">
          <span className="text-indigo-400 flex-shrink-0 mt-0.5">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      )
      i++
      continue
    }
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
      i++
      continue
    }
    elements.push(<p key={i} className="text-sm text-stone-600 leading-relaxed">{renderInline(line)}</p>)
    i++
  }
  return elements
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
      <div className="px-5 py-4 space-y-1">
        {renderMarkdown(summary)}
      </div>
    </motion.div>
  )
}
