import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  FiEye as _FiEye, FiEyeOff as _FiEyeOff, FiSave as _FiSave, FiCheck as _FiCheck,
  FiX as _FiX, FiLoader as _FiLoader, FiRefreshCw as _FiRefreshCw, FiLink as _FiLink,
  FiCloud as _FiCloud
} from 'react-icons/fi'
import React from 'react'
type FiIcon = React.FC<{ size?: number; className?: string }>
const FiEye = _FiEye as unknown as FiIcon
const FiEyeOff = _FiEyeOff as unknown as FiIcon
const FiSave = _FiSave as unknown as FiIcon
const FiCheck = _FiCheck as unknown as FiIcon
const FiX = _FiX as unknown as FiIcon
const FiLoader = _FiLoader as unknown as FiIcon
const FiRefreshCw = _FiRefreshCw as unknown as FiIcon
const FiLink = _FiLink as unknown as FiIcon
const FiCloud = _FiCloud as unknown as FiIcon

import {
  getFeishuConfig, saveFeishuConfig, testFeishuConnection,
  startFeishuSync, stopFeishuSync, syncFeishuNow, getFeishuSyncStatus,
  getBotConfig, saveBotConfig,
  type FeishuConfig, type SyncStatus, type BotConfig
} from '../hooks/useWails'

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
}

export default function FeishuSettings({ sectionIndex }: { sectionIndex: number }) {
  const [config, setConfig] = useState<FeishuConfig>({
    appId: '', appSecret: '', bitableApp: '', bitableTable: '',
    syncEnabled: false, syncInterval: 5,
  })
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testError, setTestError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [botConfig, setBotConfig] = useState<BotConfig>({
    botEnabled: false, botChatId: '', notifyOnChange: false,
  })
  const [botSaving, setBotSaving] = useState(false)
  const [botSaved, setBotSaved] = useState(false)

  useEffect(() => {
    getFeishuConfig().then(setConfig).catch(() => {})
    getFeishuSyncStatus().then(setSyncStatus).catch(() => {})
    getBotConfig().then(setBotConfig).catch(() => {})
  }, [])

  // 定期刷新同步状态
  useEffect(() => {
    const timer = setInterval(() => {
      getFeishuSyncStatus().then(setSyncStatus).catch(() => {})
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setSaved(false); setTestResult(null)
    try {
      await saveFeishuConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }, [config])

  const handleTest = useCallback(async () => {
    setTesting(true); setTestResult(null); setTestError('')
    try {
      await saveFeishuConfig(config)
      await testFeishuConnection()
      setTestResult('success')
      setTimeout(() => setTestResult(null), 5000)
    } catch (err: any) {
      setTestResult('error')
      setTestError(err?.message || String(err) || '连接失败')
      setTimeout(() => { setTestResult(null); setTestError('') }, 8000)
    } finally {
      setTesting(false)
    }
  }, [config])

  const handleSyncToggle = useCallback(async () => {
    try {
      if (syncStatus?.running) {
        await stopFeishuSync()
      } else {
        await startFeishuSync()
      }
      const status = await getFeishuSyncStatus()
      setSyncStatus(status)
    } catch (err: any) {
      alert(err?.message || '操作失败')
    }
  }, [syncStatus])

  const handleSyncNow = useCallback(async () => {
    setSyncing(true)
    try {
      await syncFeishuNow()
      const status = await getFeishuSyncStatus()
      setSyncStatus(status)
    } catch (err: any) {
      alert(err?.message || '同步失败')
    } finally {
      setSyncing(false)
    }
  }, [])

  const isConfigured = config.appId.trim().length > 0 && config.appSecret.trim().length > 0

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
        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
          <FiCloud className="text-blue-500" size={16} />
        </div>
        <h2 className="text-base font-semibold text-stone-800">飞书集成</h2>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* App 凭据 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-stone-700 mb-1.5 block">App ID</label>
            <input
              type="text"
              value={config.appId}
              onChange={e => setConfig({ ...config, appId: e.target.value })}
              placeholder="cli_xxxxxxxx"
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700 mb-1.5 block">App Secret</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={config.appSecret}
                onChange={e => setConfig({ ...config, appSecret: e.target.value })}
                placeholder="xxxxxxxx"
                className="w-full pr-10 px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
              <button type="button" onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors" tabIndex={-1}>
                {showSecret ? <FiEyeOff size={15} /> : <FiEye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* 多维表格配置 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-1.5">
              <FiLink size={13} className="text-stone-400" />
              多维表格 App Token
            </label>
            <input
              type="text"
              value={config.bitableApp}
              onChange={e => setConfig({ ...config, bitableApp: e.target.value })}
              placeholder="bascnxxxxxxxx"
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700 mb-1.5 block">Table ID</label>
            <input
              type="text"
              value={config.bitableTable}
              onChange={e => setConfig({ ...config, bitableTable: e.target.value })}
              placeholder="tblxxxxxxxx"
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
        </div>

        <p className="text-xs text-stone-400">凭据仅存储在本地数据库中，不会上传到任何第三方服务器</p>

        {/* 同步设置 */}
        <div className="flex items-center gap-4 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.syncEnabled}
              onChange={e => setConfig({ ...config, syncEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-stone-300 text-blue-500 focus:ring-blue-500/20"
            />
            <span className="text-sm text-stone-700">启用自动同步</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-500">间隔</span>
            <select
              value={config.syncInterval}
              onChange={e => setConfig({ ...config, syncInterval: Number(e.target.value) })}
              className="px-2.5 py-1.5 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value={1}>1 分钟</option>
              <option value={5}>5 分钟</option>
              <option value={10}>10 分钟</option>
              <option value={30}>30 分钟</option>
              <option value={60}>1 小时</option>
            </select>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-between pt-4 border-t border-stone-100">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full transition-colors ${isConfigured ? 'bg-emerald-500' : 'bg-stone-300'}`} />
            <span className="text-xs text-stone-500">{isConfigured ? '已配置' : '尚未配置'}</span>
            {syncStatus?.running && (
              <span className="text-xs text-blue-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                同步运行中
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button"
              onClick={handleTest} disabled={testing || !isConfigured}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors">
              {testing ? <FiLoader size={13} className="animate-spin" /> : <FiLink size={13} />}
              {testing ? '测试中...' : '测试连接'}
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button"
              onClick={handleSyncNow} disabled={syncing || !isConfigured}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors">
              <FiRefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? '同步中...' : '立即同步'}
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors">
              <FiSave size={13} />
              {saving ? '保存中...' : '保存'}
            </motion.button>
          </div>
        </div>

        {/* 状态反馈 */}
        {saved && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3.5 py-2.5 rounded-xl">
            <FiCheck size={15} /> 配置已保存
          </motion.div>
        )}
        {testResult === 'success' && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3.5 py-2.5 rounded-xl">
            <FiCheck size={15} /> 飞书连接成功！
          </motion.div>
        )}
        {testResult === 'error' && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3.5 py-2.5 rounded-xl">
            <FiX size={15} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">连接失败</p>
              <p className="text-xs text-red-500 mt-0.5">{testError}</p>
            </div>
          </motion.div>
        )}

        {/* 同步状态详情 */}
        {syncStatus && syncStatus.lastSyncAt && (
          <div className="text-xs text-stone-400 space-y-1 pt-2">
            <p>上次同步: {new Date(syncStatus.lastSyncAt).toLocaleString()}</p>
            <p>已同步记录: {syncStatus.syncedCount} 条 | 上次推送: {syncStatus.pushedCount} | 拉取: {syncStatus.pulledCount}</p>
            {syncStatus.lastError && (
              <p className="text-red-400">错误: {syncStatus.lastError}</p>
            )}
          </div>
        )}
      </form>

      {/* Bot 配置 */}
      <div className="mt-5 pt-5 border-t border-stone-100">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">飞书 Bot</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={botConfig.botEnabled}
              onChange={e => setBotConfig({ ...botConfig, botEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-stone-300 text-blue-500 focus:ring-blue-500/20" />
            <span className="text-sm text-stone-700">启用 Bot</span>
          </label>

          <div>
            <label className="text-sm font-medium text-stone-700 mb-1.5 block">目标群 Chat ID</label>
            <input type="text" value={botConfig.botChatId}
              onChange={e => setBotConfig({ ...botConfig, botChatId: e.target.value })}
              placeholder="oc_xxxxxxxx"
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={botConfig.notifyOnChange}
              onChange={e => setBotConfig({ ...botConfig, notifyOnChange: e.target.checked })}
              className="w-4 h-4 rounded border-stone-300 text-blue-500 focus:ring-blue-500/20" />
            <span className="text-sm text-stone-700">任务变更时发送通知</span>
          </label>

          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={async () => {
                setBotSaving(true); setBotSaved(false)
                try {
                  await saveBotConfig(botConfig)
                  setBotSaved(true)
                  setTimeout(() => setBotSaved(false), 3000)
                } finally { setBotSaving(false) }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl transition-colors"
              disabled={botSaving}>
              <FiSave size={13} />
              {botSaving ? '保存中...' : '保存 Bot 配置'}
            </motion.button>
            {botSaved && <span className="text-sm text-emerald-600 flex items-center gap-1"><FiCheck size={13} /> 已保存</span>}
          </div>
        </div>
      </div>
    </motion.section>
  )
}
