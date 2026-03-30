import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Mic, Square, Trash2, Clock, Users, ChevronRight } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { Meeting } from '../stores/appStore'
import { getMeetings, deleteMeeting, getRecordingState } from '../hooks/useWails'
import RecordingStartDialog from './RecordingStartDialog'
import RecordingIndicator from './RecordingIndicator'

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  recording:    { label: '录制中',   color: 'text-red-600',    bg: 'bg-red-50' },
  transcribing: { label: '转录中',   color: 'text-amber-600',  bg: 'bg-amber-50' },
  diarizing:    { label: '分辨中',   color: 'text-blue-600',   bg: 'bg-blue-50' },
  analyzing:    { label: '分析中',   color: 'text-purple-600', bg: 'bg-purple-50' },
  done:         { label: '已完成',   color: 'text-emerald-600',bg: 'bg-emerald-50' },
  error:        { label: '错误',     color: 'text-red-600',    bg: 'bg-red-50' },
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MeetingList() {
  const { meetings, setMeetings, setSelectedMeetingId, projects } = useAppStore()
  const [showStartDialog, setShowStartDialog] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    getMeetings().then(m => setMeetings(m || []))
    getRecordingState().then(s => setIsRecording(s.status === 'recording'))
  }, [setMeetings])

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此会议记录？')) return
    await deleteMeeting(id)
    const updated = await getMeetings()
    setMeetings(updated || [])
  }

  const getProjectName = (projectId: string) => {
    const p = projects.find(p => p.id === projectId)
    return p ? p.name : ''
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">会议</h1>
            <p className="text-sm text-stone-500 mt-1">录制、转录和分析会议内容</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowStartDialog(true)}
            disabled={isRecording}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            <Mic size={16} />
            {isRecording ? '录制中...' : '开始录制'}
          </motion.button>
        </div>

        {isRecording && <RecordingIndicator />}

        {meetings.length === 0 ? (
          <div className="text-center py-16">
            <Mic size={40} className="mx-auto text-stone-300 mb-4" />
            <p className="text-stone-500">暂无会议记录</p>
            <p className="text-sm text-stone-400 mt-1">点击「开始录制」开始你的第一次会议</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {meetings.map((meeting, idx) => {
                const status = STATUS_LABELS[meeting.status] || STATUS_LABELS.error
                return (
                  <motion.div
                    key={meeting.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedMeetingId(meeting.id)}
                    className="group bg-white border border-stone-200/60 rounded-xl p-4 cursor-pointer hover:border-stone-300 transition-colors"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-stone-800 truncate">{meeting.title}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${status.color} ${status.bg}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-stone-400">
                          {meeting.projectId && (
                            <span>{getProjectName(meeting.projectId)}</span>
                          )}
                          {meeting.duration > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} /> {formatDuration(meeting.duration)}
                            </span>
                          )}
                          <span>{new Date(meeting.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => { e.stopPropagation(); handleDelete(meeting.id) }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-stone-400 hover:text-red-500 transition-all rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </motion.button>
                        <ChevronRight size={16} className="text-stone-300 group-hover:text-stone-500 transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {showStartDialog && (
        <RecordingStartDialog
          onClose={() => setShowStartDialog(false)}
          onStarted={() => { setShowStartDialog(false); setIsRecording(true) }}
        />
      )}
    </div>
  )
}
