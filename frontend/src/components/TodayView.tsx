import React, { useState } from 'react'
import { motion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { FiFileText as _FiFileText } from 'react-icons/fi'
const FiFileText = _FiFileText as unknown as React.FC<{ size?: number; className?: string }>
import { useAppStore, Task } from '../stores/appStore'
import { getDailySummary, generateWeeklyReport } from '../hooks/useWails'
import TaskItem from './TaskItem'
import TaskForm from './TaskForm'
import DailySummary from './DailySummary'

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatTodayTitle(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekDay = weekDays[now.getDay()]
  return `${month}月${day}日 ${weekDay}`
}

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

export default function TodayView() {
  const { tasks } = useAppStore()
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined)
  const [showForm, setShowForm] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [weeklyReport, setWeeklyReport] = useState<string | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)

  const today = getTodayString()
  const doingTasks = tasks.filter(t => t.status === 'doing')
  const todayDueTasks = tasks.filter(t => t.dueDate === today && t.status !== 'done')

  const handleEdit = (task: Task) => { setEditingTask(task); setShowForm(true) }
  const handleCloseForm = () => { setShowForm(false); setEditingTask(undefined) }

  const handleGenerateWeeklyReport = async () => {
    setLoadingReport(true)
    try { setWeeklyReport(await generateWeeklyReport()) }
    catch { setWeeklyReport('生成周报失败，请检查 API 配置。') }
    finally { setLoadingReport(false) }
  }

  const handleGenerateSummary = async () => {
    setLoadingSummary(true)
    try { setSummary(await getDailySummary()) }
    catch {
      const doneTasks = tasks.filter(t => t.status === 'done')
      setSummary(`# 今日工作摘要\n\n## 完成情况\n- 已完成任务：${doneTasks.length} 项\n- 进行中任务：${doingTasks.length} 项\n- 今日到期：${todayDueTasks.length} 项\n\n## 进行中任务\n${doingTasks.map(t => `- ${t.title}`).join('\n') || '- 暂无'}\n\n## 今日到期\n${todayDueTasks.map(t => `- ${t.title}`).join('\n') || '- 暂无'}`)
    }
    finally { setLoadingSummary(false) }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="px-6 py-5 flex items-start justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">今日</h1>
          <p className="text-sm text-stone-400 mt-0.5">{formatTodayTitle()}</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { setEditingTask(undefined); setShowForm(true) }}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
        >
          <span className="text-base leading-none">+</span>
          添加任务
        </motion.button>
      </motion.div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="px-6 pb-6 space-y-6"
      >
        {/* 进行中 */}
        <motion.section variants={fadeUp}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <h2 className="text-sm font-semibold text-stone-700">进行中</h2>
            <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">{doingTasks.length}</span>
          </div>
          {doingTasks.length === 0 ? (
            <p className="text-xs text-stone-400 pl-4">暂无进行中的任务</p>
          ) : (
            <div className="space-y-2">
              {doingTasks.map(task => <TaskItem key={task.id} task={task} onEdit={handleEdit} />)}
            </div>
          )}
        </motion.section>

        {/* 今日到期 */}
        <motion.section variants={fadeUp}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h2 className="text-sm font-semibold text-stone-700">今日到期</h2>
            <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">{todayDueTasks.length}</span>
          </div>
          {todayDueTasks.length === 0 ? (
            <p className="text-xs text-stone-400 pl-4">今天没有到期任务</p>
          ) : (
            <div className="space-y-2">
              {todayDueTasks.map(task => <TaskItem key={task.id} task={task} onEdit={handleEdit} />)}
            </div>
          )}
        </motion.section>

        {/* AI 功能按钮 */}
        <motion.div variants={fadeUp} className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerateSummary}
            disabled={loadingSummary}
            className="flex items-center gap-2 flex-1 py-2.5 px-4 text-sm font-medium text-purple-600 bg-purple-50/80 hover:bg-purple-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={15} />
            {loadingSummary ? '生成中...' : '今日摘要'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerateWeeklyReport}
            disabled={loadingReport}
            className="flex items-center gap-2 flex-1 py-2.5 px-4 text-sm font-medium text-blue-600 bg-blue-50/80 hover:bg-blue-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiFileText size={15} />
            {loadingReport ? '生成中...' : '周报'}
          </motion.button>
        </motion.div>

        {summary && <DailySummary summary={summary} onClose={() => setSummary(null)} />}
        {weeklyReport && <DailySummary summary={weeklyReport} onClose={() => setWeeklyReport(null)} />}
      </motion.div>

      {showForm && <TaskForm task={editingTask} onClose={handleCloseForm} onSave={handleCloseForm} />}
    </div>
  )
}
