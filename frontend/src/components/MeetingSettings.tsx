import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  FiSave as _FiSave, FiCheck as _FiCheck, FiMic as _FiMic
} from 'react-icons/fi'
import React from 'react'
type FiIcon = React.FC<{ size?: number; className?: string }>
const FiSave = _FiSave as unknown as FiIcon
const FiCheck = _FiCheck as unknown as FiIcon
const FiMic = _FiMic as unknown as FiIcon

import { ConfigService } from '../../bindings/taskpilot/services'

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
}

interface MeetingConfig {
  engine: string
  whisperModel: string
  cloudApiUrl: string
  cloudApiKey: string
  storagePath: string
}

export default function MeetingSettings({ sectionIndex }: { sectionIndex: number }) {
  const [config, setConfig] = useState<MeetingConfig>({
    engine: 'whisper',
    whisperModel: 'base',
    cloudApiUrl: '',
    cloudApiKey: '',
    storagePath: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const engine = await ConfigService.GetConfig('meeting_transcribe_engine') || 'whisper'
      const whisperModel = await ConfigService.GetConfig('meeting_whisper_model') || 'base'
      const cloudApiUrl = await ConfigService.GetConfig('meeting_cloud_api_url') || ''
      const cloudApiKey = await ConfigService.GetConfig('meeting_cloud_api_key') || ''
      const storagePath = await ConfigService.GetConfig('meeting_storage_path') || ''
      setConfig({ engine, whisperModel, cloudApiUrl, cloudApiKey, storagePath })
    }
    load().catch(() => {})
  }, [])

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setSaved(false)
    try {
      await ConfigService.SetConfig('meeting_transcribe_engine', config.engine)
      await ConfigService.SetConfig('meeting_whisper_model', config.whisperModel)
      await ConfigService.SetConfig('meeting_cloud_api_url', config.cloudApiUrl)
      await ConfigService.SetConfig('meeting_cloud_api_key', config.cloudApiKey)
      await ConfigService.SetConfig('meeting_storage_path', config.storagePath)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }, [config])

  return (
    <motion.section
      custom={sectionIndex}
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
      className="bg-white border border-stone-200/60 rounded-2xl p-6"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
          <FiMic className="text-red-500" size={16} />
        </div>
        <h2 className="text-base font-semibold text-stone-800">会议录音</h2>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* 转录引擎 */}
        <div>
          <label className="text-sm font-medium text-stone-700 mb-1.5 block">转录引擎</label>
          <select
            value={config.engine}
            onChange={e => setConfig({ ...config, engine: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
          >
            <option value="whisper">本地 Whisper</option>
            <option value="cloud">云端 API</option>
          </select>
        </div>

        {/* Whisper 模型选择 */}
        {config.engine === 'whisper' && (
          <div>
            <label className="text-sm font-medium text-stone-700 mb-1.5 block">Whisper 模型</label>
            <select
              value={config.whisperModel}
              onChange={e => setConfig({ ...config, whisperModel: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
            >
              <option value="tiny">tiny (最快，准确率最低)</option>
              <option value="base">base (推荐)</option>
              <option value="small">small (平衡)</option>
              <option value="medium">medium (较慢，准确率较高)</option>
              <option value="large">large (最慢，准确率最高)</option>
            </select>
            <p className="text-xs text-stone-400 mt-1">
              需先安装: pip install openai-whisper 或 brew install whisper-cpp
            </p>
          </div>
        )}

        {/* 云端 API 配置 */}
        {config.engine === 'cloud' && (
          <>
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1.5 block">API 地址</label>
              <input
                type="text"
                value={config.cloudApiUrl}
                onChange={e => setConfig({ ...config, cloudApiUrl: e.target.value })}
                placeholder="https://api.openai.com/v1/audio/transcriptions"
                className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1.5 block">API Key</label>
              <input
                type="password"
                value={config.cloudApiKey}
                onChange={e => setConfig({ ...config, cloudApiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
              />
            </div>
          </>
        )}

        {/* 存储路径 */}
        <div>
          <label className="text-sm font-medium text-stone-700 mb-1.5 block">存储路径</label>
          <input
            type="text"
            value={config.storagePath}
            onChange={e => setConfig({ ...config, storagePath: e.target.value })}
            placeholder="留空使用默认路径 (~/.taskpilot/meetings/)"
            className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
          />
        </div>

        {/* 保存按钮 */}
        <div className="flex items-center gap-2 pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-xl transition-colors"
          >
            <FiSave size={13} />
            {saving ? '保存中...' : '保存'}
          </motion.button>
          {saved && (
            <span className="text-sm text-emerald-600 flex items-center gap-1">
              <FiCheck size={13} /> 已保存
            </span>
          )}
        </div>
      </form>
    </motion.section>
  )
}
