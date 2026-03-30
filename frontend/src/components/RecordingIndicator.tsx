import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { Square } from 'lucide-react'
import { stopRecording, getRecordingState } from '../hooks/useWails'

export default function RecordingIndicator() {
  const [duration, setDuration] = useState(0)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setDuration(d => d + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleStop = async () => {
    setStopping(true)
    try {
      await stopRecording()
    } catch (err) {
      console.error('stop recording failed:', err)
    } finally {
      setStopping(false)
    }
  }

  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 flex items-center gap-4 bg-red-50 border border-red-200/60 rounded-xl px-4 py-3"
    >
      <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
      <div className="flex-1">
        <p className="text-sm font-medium text-red-700">正在录制</p>
        <p className="text-xs text-red-500 font-mono">
          {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
        </p>
      </div>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleStop}
        disabled={stopping}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-100 disabled:opacity-50 rounded-lg transition-colors"
      >
        <Square size={12} />
        {stopping ? '停止中...' : '停止录制'}
      </motion.button>
    </motion.div>
  )
}
