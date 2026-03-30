import { useState } from 'react'
import { motion } from 'motion/react'
import { X, Mic } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { startRecording } from '../hooks/useWails'

interface Props {
  onClose: () => void
  onStarted: () => void
}

export default function RecordingStartDialog({ onClose, onStarted }: Props) {
  const { projects } = useAppStore()
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    const meetingTitle = title.trim() || `会议 ${new Date().toLocaleString()}`
    setStarting(true)
    setError('')
    try {
      await startRecording(meetingTitle, projectId)
      onStarted()
    } catch (err: any) {
      setError(err?.message || '启动录制失败')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl border border-stone-200/60 w-[420px] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-semibold text-stone-800">开始录制</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-stone-700 mb-1.5 block">会议标题</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`会议 ${new Date().toLocaleDateString()}`}
              autoFocus
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-stone-700 mb-1.5 block">关联项目（可选）</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
            >
              <option value="">不关联项目</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-stone-50 rounded-xl p-3">
            <p className="text-xs text-stone-500">
              录制将捕获系统音频。请确保已安装 ffmpeg 或 sox，
              并已配置虚拟音频设备（如 BlackHole）。
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3.5 py-2.5 rounded-xl">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-stone-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-colors"
          >
            取消
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStart}
            disabled={starting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-xl transition-colors"
          >
            <Mic size={14} />
            {starting ? '启动中...' : '开始录制'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
