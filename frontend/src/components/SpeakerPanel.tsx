import { useState } from 'react'
import { motion } from 'motion/react'
import { Pencil, Check, Merge, Users } from 'lucide-react'
import { renameSpeaker, mergeSpeakers, type MeetingSpeaker, type TranscriptSegment } from '../hooks/useWails'

interface Props {
  meetingId: string
  speakers: MeetingSpeaker[]
  segments: TranscriptSegment[]
  onUpdate: () => void
}

export default function SpeakerPanel({ meetingId, speakers, segments, onUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [mergeFrom, setMergeFrom] = useState<string | null>(null)

  const getSpeakerStats = (speakerId: string) => {
    const segs = segments.filter(s => s.speakerId === speakerId)
    const totalTime = segs.reduce((sum, s) => sum + (s.endTime - s.startTime), 0)
    return { count: segs.length, totalTime: Math.round(totalTime) }
  }

  const handleRename = async (speakerId: string) => {
    const name = editingName.trim()
    if (!name) {
      setEditingId(null)
      return
    }
    await renameSpeaker(speakerId, name)
    setEditingId(null)
    onUpdate()
  }

  const handleMerge = async (toId: string) => {
    if (!mergeFrom || mergeFrom === toId) {
      setMergeFrom(null)
      return
    }
    if (!confirm('确定将此说话人合并到目标说话人？')) {
      setMergeFrom(null)
      return
    }
    await mergeSpeakers(toId, mergeFrom)
    setMergeFrom(null)
    onUpdate()
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Users size={14} className="text-stone-500" />
        <h3 className="text-sm font-semibold text-stone-700">说话人 ({speakers.length})</h3>
      </div>

      {speakers.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-4">暂无说话人数据</p>
      ) : (
        <div className="space-y-2">
          {speakers.map(speaker => {
            const stats = getSpeakerStats(speaker.id)
            const isEditing = editingId === speaker.id
            const displayName = speaker.displayName || speaker.speakerLabel

            return (
              <motion.div
                key={speaker.id}
                className={`p-3 rounded-xl border transition-colors ${
                  mergeFrom === speaker.id
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-stone-200/60 bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: speaker.color }}
                  />
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(speaker.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={() => handleRename(speaker.id)}
                        className="flex-1 text-sm px-1.5 py-0.5 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      <button onClick={() => handleRename(speaker.id)} className="text-emerald-500">
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-stone-800">{displayName}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingId(speaker.id)
                            setEditingName(displayName)
                          }}
                          className="p-1 text-stone-400 hover:text-stone-600 rounded transition-colors"
                          title="重命名"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => {
                            if (mergeFrom) {
                              handleMerge(speaker.id)
                            } else {
                              setMergeFrom(speaker.id)
                            }
                          }}
                          className={`p-1 rounded transition-colors ${
                            mergeFrom === speaker.id
                              ? 'text-amber-600 bg-amber-100'
                              : 'text-stone-400 hover:text-stone-600'
                          }`}
                          title={mergeFrom ? '合并到此说话人' : '选择要合并的说话人'}
                        >
                          <Merge size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-xs text-stone-400 pl-5">
                  发言 {stats.count} 次 · {Math.floor(stats.totalTime / 60)}:{(stats.totalTime % 60).toString().padStart(2, '0')}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {mergeFrom && (
        <div className="mt-3 p-2 bg-amber-50 rounded-lg text-xs text-amber-600 text-center">
          请点击目标说话人完成合并，或点击取消
          <button
            onClick={() => setMergeFrom(null)}
            className="ml-2 underline hover:no-underline"
          >
            取消
          </button>
        </div>
      )}
    </div>
  )
}
