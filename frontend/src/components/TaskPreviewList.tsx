import { motion } from 'motion/react'
import { CheckSquare, Square, Calendar, User, Tag } from 'lucide-react'
import type { SuggestedTask } from './MeetingAnalysis'

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'P0 紧急', color: 'text-red-600' },
  1: { label: 'P1 高', color: 'text-orange-600' },
  2: { label: 'P2 中', color: 'text-blue-600' },
  3: { label: 'P3 低', color: 'text-stone-500' },
}

interface Props {
  tasks: SuggestedTask[]
  onChange: (tasks: SuggestedTask[]) => void
  onCreateSelected: () => void
}

export default function TaskPreviewList({ tasks, onChange, onCreateSelected }: Props) {
  const toggleTask = (index: number) => {
    const updated = [...tasks]
    updated[index] = { ...updated[index], selected: !updated[index].selected }
    onChange(updated)
  }

  const selectedCount = tasks.filter(t => t.selected).length

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-stone-700">建议任务 ({tasks.length})</h3>
        <span className="text-xs text-stone-400">已选 {selectedCount}</span>
      </div>

      <div className="space-y-2 mb-4">
        {tasks.map((task, idx) => {
          const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[2]
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => toggleTask(idx)}
              className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                task.selected
                  ? 'border-indigo-300 bg-indigo-50/50'
                  : 'border-stone-200/60 bg-white hover:border-stone-300'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {task.selected ? (
                    <CheckSquare size={16} className="text-indigo-500" />
                  ) : (
                    <Square size={16} className="text-stone-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 leading-tight">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-stone-500 mt-1 line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`text-[10px] font-medium ${priority.color}`}>
                      {priority.label}
                    </span>
                    {task.assignee && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-400">
                        <User size={10} /> {task.assignee}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-400">
                        <Calendar size={10} /> {task.dueDate}
                      </span>
                    )}
                    {task.tags?.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-400">
                        <Tag size={10} /> {task.tags.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onCreateSelected}
        disabled={selectedCount === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
      >
        创建已勾选任务 ({selectedCount})
      </motion.button>
    </div>
  )
}
