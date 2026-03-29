import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  FiEye as _FiEye, FiEyeOff as _FiEyeOff, FiSave as _FiSave, FiCheck as _FiCheck,
  FiX as _FiX, FiLoader as _FiLoader, FiZap as _FiZap, FiGlobe as _FiGlobe,
  FiCpu as _FiCpu, FiKey as _FiKey, FiServer as _FiServer,
  FiMessageCircle as _FiMessageCircle, FiTrendingUp as _FiTrendingUp, FiLayers as _FiLayers,
  FiTarget as _FiTarget, FiTrash2 as _FiTrash2
} from 'react-icons/fi'
import React from 'react'
type FiIcon = React.FC<{ size?: number; className?: string }>
const FiEye = _FiEye as unknown as FiIcon
const FiEyeOff = _FiEyeOff as unknown as FiIcon
const FiSave = _FiSave as unknown as FiIcon
const FiCheck = _FiCheck as unknown as FiIcon
const FiX = _FiX as unknown as FiIcon
const FiLoader = _FiLoader as unknown as FiIcon
const FiZap = _FiZap as unknown as FiIcon
const FiGlobe = _FiGlobe as unknown as FiIcon
const FiCpu = _FiCpu as unknown as FiIcon
const FiKey = _FiKey as unknown as FiIcon
const FiServer = _FiServer as unknown as FiIcon
const FiMessageCircle = _FiMessageCircle as unknown as FiIcon
const FiTrendingUp = _FiTrendingUp as unknown as FiIcon
const FiLayers = _FiLayers as unknown as FiIcon
const FiTarget = _FiTarget as unknown as FiIcon
const FiTrash2 = _FiTrash2 as unknown as FiIcon
import { getAIConfig, saveAIConfig, testAIConnection } from '../hooks/useWails'

const MODEL_OPTIONS = [
  { value: '', label: '默认 (Claude Sonnet)' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-4-20250514', label: 'Claude Haiku 4' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  { value: 'custom', label: '自定义模型...' },
]

const AI_FEATURES = [
  { Icon: FiMessageCircle, title: 'AI 对话助手', desc: '通过自然语言管理任务', color: 'text-indigo-500', bg: 'bg-indigo-50' },
  { Icon: FiTrendingUp, title: '每日/周报', desc: '自动生成工作摘要与报告', color: 'text-blue-500', bg: 'bg-blue-50' },
  { Icon: FiZap, title: '智能建议', desc: '基于项目上下文推荐新任务', color: 'text-amber-500', bg: 'bg-amber-50' },
  { Icon: FiLayers, title: '任务拆解', desc: '将复杂任务分解为子任务', color: 'text-purple-500', bg: 'bg-purple-50' },
  { Icon: FiTarget, title: '优先级优化', desc: 'AI 分析并建议优先级调整', color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { Icon: FiTrash2, title: '智能删除', desc: '通过对话删除任务', color: 'text-rose-500', bg: 'bg-rose-50' },
]

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
}

export default function SettingsView() {
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testError, setTestError] = useState('')

  useEffect(() => {
    getAIConfig().then((config) => {
      setApiKey(config.apiKey || '')
      setBaseURL(config.baseURL || '')
      const m = config.model || ''
      if (m && !MODEL_OPTIONS.find(o => o.value === m)) {
        setModel('custom')
        setCustomModel(m)
      } else {
        setModel(m)
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const getEffectiveModel = () => model === 'custom' ? customModel : model

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setTestResult(null)
    try {
      await saveAIConfig(apiKey.trim(), baseURL.trim(), getEffectiveModel())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    setTestError('')
    try {
      await saveAIConfig(apiKey.trim(), baseURL.trim(), getEffectiveModel())
      await testAIConnection()
      setTestResult('success')
    } catch (err: any) {
      setTestResult('error')
      setTestError(err?.message || String(err) || '连接失败')
    } finally {
      setTesting(false)
    }
  }

  const isConfigured = apiKey.trim().length > 0

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-2xl font-bold text-stone-900 mb-1 tracking-tight">设置</h1>
          <p className="text-sm text-stone-500 mb-8">配置 TaskPilot 的 AI 服务和各项参数</p>
        </motion.div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* API 连接配置 */}
          <motion.section
            custom={0}
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
            className="bg-white border border-stone-200/60 rounded-2xl p-6"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                <FiServer className="text-indigo-500" size={16} />
              </div>
              <h2 className="text-base font-semibold text-stone-800">API 连接</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-1.5">
                  <FiKey size={13} className="text-stone-400" />
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={loaded ? 'sk-ant-...' : '加载中...'}
                    disabled={!loaded}
                    className="w-full pr-10 px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-stone-50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showKey ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                  </button>
                </div>
                <p className="text-xs text-stone-400 mt-1.5">密钥仅存储在本地，不会上传到任何服务器</p>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-1.5">
                  <FiGlobe size={13} className="text-stone-400" />
                  API 地址 (Base URL)
                </label>
                <input
                  type="text"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  placeholder="留空使用默认地址 (https://api.anthropic.com)"
                  disabled={!loaded}
                  className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-stone-50 transition-all"
                />
                <p className="text-xs text-stone-400 mt-1.5">支持自定义代理地址或兼容 API 服务</p>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-1.5">
                  <FiCpu size={13} className="text-stone-400" />
                  模型
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={!loaded}
                  className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-stone-50 bg-white transition-all"
                >
                  {MODEL_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {model === 'custom' && (
                  <motion.input
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="输入模型名称，如 gpt-4o"
                    className="w-full mt-2 px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-stone-100">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full transition-colors ${isConfigured ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                <span className="text-xs text-stone-500">{isConfigured ? 'API Key 已配置' : '尚未配置'}</span>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !loaded || !isConfigured}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                >
                  {testing ? <FiLoader size={13} className="animate-spin" /> : <FiZap size={13} />}
                  {testing ? '测试中...' : '测试连接'}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={saving || !loaded}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                >
                  <FiSave size={13} />
                  {saving ? '保存中...' : '保存'}
                </motion.button>
              </div>
            </div>

            {saved && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3.5 py-2.5 rounded-xl">
                <FiCheck size={15} />
                配置已保存
              </motion.div>
            )}
            {testResult === 'success' && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3.5 py-2.5 rounded-xl">
                <FiCheck size={15} />
                连接成功！API 配置正常工作
              </motion.div>
            )}
            {testResult === 'error' && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3.5 py-2.5 rounded-xl">
                <FiX size={15} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">连接失败</p>
                  <p className="text-xs text-red-500 mt-0.5">{testError}</p>
                </div>
              </motion.div>
            )}
          </motion.section>

          {/* AI 功能 */}
          <motion.section
            custom={1}
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
            className="bg-white border border-stone-200/60 rounded-2xl p-6"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center">
                <FiZap className="text-purple-500" size={16} />
              </div>
              <h2 className="text-base font-semibold text-stone-800">AI 功能</h2>
            </div>
            <p className="text-sm text-stone-500 mb-4">配置 API 后即可使用以下 AI 功能：</p>
            <div className="grid grid-cols-2 gap-3">
              {AI_FEATURES.map((f, idx) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + idx * 0.05, duration: 0.3 }}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-stone-50/80 hover:bg-stone-100/80 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg ${f.bg} flex items-center justify-center flex-shrink-0`}>
                    <f.Icon size={15} className={f.color} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-800">{f.title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* 关于 */}
          <motion.section
            custom={2}
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
            className="bg-white border border-stone-200/60 rounded-2xl p-6"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <h2 className="text-base font-semibold text-stone-800 mb-2">关于 TaskPilot</h2>
            <p className="text-sm text-stone-500 leading-relaxed">
              TaskPilot 是一款 AI 驱动的智能任务管理工具，帮助你更高效地规划和执行工作。
              使用 Claude AI 提供智能辅助功能。
            </p>
            <div className="mt-3 text-xs text-stone-400">版本 1.0.0</div>
          </motion.section>
        </form>
      </div>
    </div>
  )
}
