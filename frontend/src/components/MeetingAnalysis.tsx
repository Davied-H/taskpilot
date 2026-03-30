import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, Brain, ListTodo, Loader } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import TaskPreviewList from './TaskPreviewList'

// 这些类型匹配后端 ai.MeetingAnalysis 和 ai.SuggestedTask
interface MeetingAnalysisData {
  summary: string
  keyPoints: string[]
  pendingItems: string[]
  actionItems: string[]
  tasks: SuggestedTask[]
}

export interface SuggestedTask {
  title: string
  description: string
  priority: number
  assignee: string
  dueDate: string
  tags: string[]
  selected?: boolean
}

// 动态导入 MeetingService 绑定
async function analyzeMeeting(meetingId: string): Promise<MeetingAnalysisData> {
  const { MeetingService } = await import('../../bindings/taskpilot/services')
  return await MeetingService.AnalyzeMeeting(meetingId) as any
}

async function decomposeTasks(meetingId: string): Promise<SuggestedTask[]> {
  const { MeetingService } = await import('../../bindings/taskpilot/services')
  return await MeetingService.DecomposeMeetingTasks(meetingId) as any || []
}

async function createTasksFromMeeting(meetingId: string, tasks: SuggestedTask[]): Promise<void> {
  const { MeetingService } = await import('../../bindings/taskpilot/services')
  await MeetingService.CreateTasksFromMeeting(meetingId, tasks as any)
}

async function getExistingAnalysis(meetingId: string): Promise<MeetingAnalysisData | null> {
  try {
    const { MeetingService } = await import('../../bindings/taskpilot/services')
    return await MeetingService.GetMeetingAnalysis(meetingId) as any
  } catch {
    return null
  }
}

export default function MeetingAnalysisView({ meetingId }: { meetingId: string }) {
  const { setCurrentView } = useAppStore()
  const [analysis, setAnalysis] = useState<MeetingAnalysisData | null>(null)
  const [tasks, setTasks] = useState<SuggestedTask[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [decomposing, setDecomposing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // 尝试加载已有分析结果
    getExistingAnalysis(meetingId).then(data => {
      if (data) setAnalysis(data)
    })
  }, [meetingId])

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setError('')
    try {
      const result = await analyzeMeeting(meetingId)
      setAnalysis(result)
    } catch (err: any) {
      setError(err?.message || 'AI 分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleDecompose = async () => {
    setDecomposing(true)
    setError('')
    try {
      const result = await decomposeTasks(meetingId)
      setTasks(result.map(t => ({ ...t, selected: true })))
    } catch (err: any) {
      setError(err?.message || '任务分解失败')
    } finally {
      setDecomposing(false)
    }
  }

  const handleCreateTasks = async () => {
    const selected = tasks.filter(t => t.selected)
    if (selected.length === 0) return
    try {
      await createTasksFromMeeting(meetingId, selected)
      alert(`成功创建 ${selected.length} 个任务`)
    } catch (err: any) {
      alert(err?.message || '创建失败')
    }
  }

  return (
    <div className="flex-1 overflow-hidden flex" style={{ background: 'var(--bg-primary)' }}>
      {/* 左侧：分析结果 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex items-center gap-3 mb-6">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCurrentView('meeting-detail')}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <h2 className="text-lg font-semibold text-stone-800">AI 分析</h2>
        </div>

        {!analysis ? (
          <div className="text-center py-16">
            <Brain size={40} className="mx-auto text-stone-300 mb-4" />
            <p className="text-stone-500 mb-4">点击下方按钮开始 AI 分析</p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAnalyze}
              disabled={analyzing}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-50 rounded-xl transition-colors"
            >
              {analyzing ? <Loader size={14} className="animate-spin" /> : <Brain size={14} />}
              {analyzing ? '分析中...' : '开始 AI 分析'}
            </motion.button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 总结 */}
            <section>
              <h3 className="text-sm font-semibold text-stone-700 mb-2">会议总结</h3>
              <p className="text-sm text-stone-600 leading-relaxed bg-white border border-stone-200/60 rounded-xl p-4">
                {analysis.summary}
              </p>
            </section>

            {/* 关键结论 */}
            {analysis.keyPoints?.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-stone-700 mb-2">关键结论</h3>
                <ul className="space-y-1.5">
                  {analysis.keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                      <span className="text-emerald-500 mt-0.5">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 待决事项 */}
            {analysis.pendingItems?.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-stone-700 mb-2">待决事项</h3>
                <ul className="space-y-1.5">
                  {analysis.pendingItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                      <span className="text-amber-500 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 行动要点 */}
            {analysis.actionItems?.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-stone-700 mb-2">行动要点</h3>
                <ul className="space-y-1.5">
                  {analysis.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 分解任务按钮 */}
            {tasks.length === 0 && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDecompose}
                disabled={decomposing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 rounded-xl transition-colors"
              >
                {decomposing ? <Loader size={14} className="animate-spin" /> : <ListTodo size={14} />}
                {decomposing ? '分解中...' : '分解为任务'}
              </motion.button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</div>
        )}
      </div>

      {/* 右侧：任务预览 */}
      {tasks.length > 0 && (
        <div className="w-96 border-l border-stone-200/60 overflow-y-auto">
          <TaskPreviewList
            tasks={tasks}
            onChange={setTasks}
            onCreateSelected={handleCreateTasks}
          />
        </div>
      )}
    </div>
  )
}
