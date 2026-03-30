import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, Brain, Clock } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { Meeting } from '../stores/appStore'
import { getMeeting, getSegments, getSpeakers, type TranscriptSegment, type MeetingSpeaker } from '../hooks/useWails'
import SpeakerPanel from './SpeakerPanel'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function MeetingDetail({ meetingId }: { meetingId: string }) {
  const { setCurrentView } = useAppStore()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [speakers, setSpeakers] = useState<MeetingSpeaker[]>([])

  useEffect(() => {
    getMeeting(meetingId).then(setMeeting)
    getSegments(meetingId).then(s => setSegments(s || []))
    getSpeakers(meetingId).then(s => setSpeakers(s || []))
  }, [meetingId])

  const speakerMap = new Map(speakers.map(s => [s.id, s]))

  const getSpeakerName = (speakerId: string) => {
    const sp = speakerMap.get(speakerId)
    return sp?.displayName || sp?.speakerLabel || 'Unknown'
  }

  const getSpeakerColor = (speakerId: string) => {
    const sp = speakerMap.get(speakerId)
    return sp?.color || '#94a3b8'
  }

  const handleSpeakerUpdate = async () => {
    const updated = await getSpeakers(meetingId)
    setSpeakers(updated || [])
  }

  if (!meeting) {
    return <div className="flex-1 flex items-center justify-center text-stone-400">加载中...</div>
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* 顶部 */}
      <div className="px-8 py-4 border-b border-stone-200/60 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setCurrentView('meetings')}
          className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
        >
          <ArrowLeft size={18} />
        </motion.button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-stone-800">{meeting.title}</h1>
          <p className="text-xs text-stone-400">
            {new Date(meeting.createdAt).toLocaleString()}
            {meeting.duration > 0 && (
              <span className="ml-3 inline-flex items-center gap-1">
                <Clock size={11} /> {formatTime(meeting.duration)}
              </span>
            )}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors"
        >
          <Brain size={14} />
          AI 分析
        </motion.button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 左侧：转录文本 */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {segments.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              {meeting.status === 'done' ? '暂无转录内容' : '转录处理中...'}
            </div>
          ) : (
            <div className="space-y-3">
              {segments.map((seg) => (
                <div key={seg.id} className="flex gap-3">
                  <div className="flex-shrink-0 pt-1">
                    <span className="text-[10px] font-mono text-stone-400">{formatTime(seg.startTime)}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getSpeakerColor(seg.speakerId) }}
                      />
                      <span className="text-xs font-medium" style={{ color: getSpeakerColor(seg.speakerId) }}>
                        {getSpeakerName(seg.speakerId)}
                      </span>
                    </div>
                    <p className="text-sm text-stone-700 leading-relaxed">{seg.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：说话人面板 */}
        <div className="w-72 border-l border-stone-200/60 overflow-y-auto">
          <SpeakerPanel
            meetingId={meetingId}
            speakers={speakers}
            segments={segments}
            onUpdate={handleSpeakerUpdate}
          />
        </div>
      </div>
    </div>
  )
}
