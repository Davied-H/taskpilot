import React, { useState } from 'react'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { FiCheckCircle as _FiCheckCircle, FiZap as _FiZap, FiTarget as _FiTarget } from 'react-icons/fi'
type FiIcon = React.FC<{ size?: number; className?: string }>
const FiCheckCircle = _FiCheckCircle as unknown as FiIcon
const FiZap = _FiZap as unknown as FiIcon
const FiTarget = _FiTarget as unknown as FiIcon
import { useAppStore, Task } from '../stores/appStore'
import { smartSuggestTasks, prioritizeTasks } from '../hooks/useWails'
import TaskItem from './TaskItem'
import TaskForm from './TaskForm'

type StatusFilter = 'all' | 'todo' | 'doing' | 'done'
type SortBy = 'priority' | 'dueDate' | 'createdAt'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '待办' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已完成' },
]

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'priority', label: '优先级' },
  { value: 'dueDate', label: '截止日期' },
  { value: 'createdAt', label: '创建时间' },
]

function sortTasks(tasks: Task[], by: SortBy): Task[] {
  return [...tasks].sort((a, b) => {
    if (by === 'priority') return a.priority - b.priority
    if (by === 'dueDate') {
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    }
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export default function TaskList() {
  const { projects, selectedProjectId, tasks } = useAppStore()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('priority')
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined)
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const project = projects.find(p => p.id === selectedProjectId)
  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId)
  const filteredTasks = statusFilter === 'all' ? projectTasks : projectTasks.filter(t => t.status === statusFilter)
  const sortedTasks = sortTasks(filteredTasks, sortBy)

  const handleEdit = (task: Task) => { setEditingTask(task); setShowForm(true) }
  const handleCloseForm = () => { setShowForm(false); setEditingTask(undefined) }

  const handleSmartSuggest = async () => {
    if (!selectedProjectId) return
    setAiLoading(true)
    try { setAiResult(await smartSuggestTasks(selectedProjectId)) }
    catch { setAiResult('智能建议生成失败，请检查 API 配置。') }
    finally { setAiLoading(false) }
  }

  const handlePrioritize = async () => {
    if (!selectedProjectId) return
    setAiLoading(true)
    try { setAiResult(await prioritizeTasks(selectedProjectId)) }
    catch { setAiResult('优先级分析失败，请检查 API 配置。') }
    finally { setAiLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between px-6 py-5"
      >
        <div className="flex items-center gap-3">
          {project && (
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
          )}
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">{project?.name ?? '未选择项目'}</h1>
          <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full font-medium">{projectTasks.length}</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-xl transition-colors"
        >
          <Plus size={15} />
          新建任务
        </motion.button>
      </motion.div>

      {/* 筛选栏 */}
      <div className="flex items-center justify-between px-6 pb-4">
        <div className="flex gap-1 bg-stone-100/60 p-0.5 rounded-lg">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                statusFilter === f.value
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-stone-400">排序:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="text-xs text-stone-600 bg-transparent border-none outline-none cursor-pointer font-medium"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* AI 功能栏 */}
      <div className="flex items-center gap-2 px-6 pb-3">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSmartSuggest}
          disabled={aiLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50/80 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <FiZap size={12} />
          智能建议
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handlePrioritize}
          disabled={aiLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50/80 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <FiTarget size={12} />
          优先级优化
        </motion.button>
        {aiLoading && <span className="text-xs text-stone-400">AI 分析中...</span>}
      </div>

      {/* AI 结果 */}
      {aiResult && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mx-6 mb-3 p-4 bg-gradient-to-r from-purple-50/80 to-blue-50/60 border border-purple-100/60 rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-purple-700">AI 分析结果</span>
            <button onClick={() => setAiResult(null)} className="text-stone-400 hover:text-stone-600 text-xs transition-colors">关闭</button>
          </div>
          <div className="text-sm text-stone-600 whitespace-pre-wrap leading-relaxed">{aiResult}</div>
        </motion.div>
      )}

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
        {sortedTasks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-48 text-center"
          >
            <FiCheckCircle size={36} className="text-stone-300 mb-3" />
            <p className="text-sm font-medium text-stone-500">
              {statusFilter === 'all' ? '还没有任务' : `没有${STATUS_FILTERS.find(f => f.value === statusFilter)?.label}的任务`}
            </p>
            <p className="text-xs text-stone-400 mt-1">点击「新建任务」开始添加</p>
          </motion.div>
        ) : (
          sortedTasks.map((task, idx) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <TaskItem task={task} onEdit={handleEdit} />
            </motion.div>
          ))
        )}
      </div>

      {showForm && <TaskForm task={editingTask} onClose={handleCloseForm} onSave={handleCloseForm} />}
    </div>
  )
}
