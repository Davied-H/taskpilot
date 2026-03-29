import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  FiDownload as _FiDownload, FiFolder as _FiFolder, FiTrash2 as _FiTrash2,
  FiFile as _FiFile, FiRefreshCw as _FiRefreshCw, FiLoader as _FiLoader,
  FiCheck as _FiCheck, FiX as _FiX, FiEye as _FiEye,
} from 'react-icons/fi'
import React from 'react'
type FiIcon = React.FC<{ size?: number; className?: string }>
const FiDownload = _FiDownload as unknown as FiIcon
const FiFolder = _FiFolder as unknown as FiIcon
const FiTrash2 = _FiTrash2 as unknown as FiIcon
const FiFile = _FiFile as unknown as FiIcon
const FiRefreshCw = _FiRefreshCw as unknown as FiIcon
const FiLoader = _FiLoader as unknown as FiIcon
const FiCheck = _FiCheck as unknown as FiIcon
const FiX = _FiX as unknown as FiIcon
const FiEye = _FiEye as unknown as FiIcon
import { getLogFiles, exportLogs, openLogDir, clearOldLogs, getLogContent } from '../hooks/useWails'
import type { LogFileInfo } from '../hooks/useWails'

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function LogsView() {
  const [files, setFiles] = useState<LogFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [clearResult, setClearResult] = useState<{ count: number } | null>(null)
  const [exportingFile, setExportingFile] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  async function loadFiles() {
    setLoading(true)
    try {
      const result = await getLogFiles()
      setFiles(result || [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [])

  async function handleExport(filename: string) {
    setExportingFile(filename)
    try {
      await exportLogs(filename)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExportingFile(null)
    }
  }

  async function handleClearOld() {
    setClearing(true)
    setClearResult(null)
    try {
      const count = await clearOldLogs(30)
      setClearResult({ count })
      loadFiles()
      setTimeout(() => setClearResult(null), 3000)
    } catch (err) {
      console.error('Clear failed:', err)
    } finally {
      setClearing(false)
    }
  }

  async function handlePreview(filename: string) {
    if (previewFile === filename) {
      setPreviewFile(null)
      setPreviewContent('')
      return
    }
    setPreviewFile(filename)
    setPreviewLoading(true)
    try {
      const content = await getLogContent(filename, 100)
      setPreviewContent(content)
    } catch {
      setPreviewContent('Failed to load log content.')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto px-8 py-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-2xl font-bold text-stone-900 mb-1 tracking-tight">运行日志</h1>
          <p className="text-sm text-stone-500 mb-8">查看和导出系统运行日志，用于问题排查和调试</p>
        </motion.div>

        {/* 操作栏 */}
        <motion.section
          custom={0}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="bg-white border border-stone-200/60 rounded-2xl p-6"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <FiFile className="text-blue-500" size={16} />
              </div>
              <h2 className="text-base font-semibold text-stone-800">日志文件</h2>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={loadFiles}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 rounded-lg transition-colors"
              >
                <FiRefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                刷新
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={openLogDir}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
              >
                <FiFolder size={12} />
                打开目录
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleClearOld}
                disabled={clearing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg transition-colors"
              >
                <FiTrash2 size={12} />
                {clearing ? '清理中...' : '清理 30 天前'}
              </motion.button>
            </div>
          </div>

          {clearResult && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3.5 py-2.5 rounded-xl"
            >
              <FiCheck size={15} />
              已清理 {clearResult.count} 个旧日志文件
            </motion.div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-stone-400">
              <FiLoader size={20} className="animate-spin" />
              <span className="ml-2 text-sm">加载中...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12">
              <FiFile size={32} className="mx-auto text-stone-300 mb-3" />
              <p className="text-sm text-stone-400">暂无日志文件</p>
              <p className="text-xs text-stone-300 mt-1">运行应用后会自动生成日志</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file, idx) => (
                <motion.div
                  key={file.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.2 }}
                >
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-stone-50/80 hover:bg-stone-100/80 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <FiFile size={14} className="text-stone-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-700 truncate">{file.name}</p>
                        <p className="text-xs text-stone-400">{formatSize(file.size)} &middot; {file.modTime}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handlePreview(file.name)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          previewFile === file.name
                            ? 'text-blue-600 bg-blue-100'
                            : 'text-stone-500 bg-stone-200/60 hover:bg-stone-200'
                        }`}
                      >
                        <FiEye size={11} />
                        预览
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleExport(file.name)}
                        disabled={exportingFile === file.name}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 rounded-lg transition-colors"
                      >
                        {exportingFile === file.name ? (
                          <FiLoader size={11} className="animate-spin" />
                        ) : (
                          <FiDownload size={11} />
                        )}
                        导出
                      </motion.button>
                    </div>
                  </div>

                  {previewFile === file.name && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-1 mx-1"
                    >
                      <div className="bg-stone-900 rounded-xl p-4 max-h-80 overflow-auto">
                        {previewLoading ? (
                          <div className="flex items-center text-stone-400 text-sm">
                            <FiLoader size={14} className="animate-spin mr-2" />
                            加载中...
                          </div>
                        ) : (
                          <pre className="text-xs text-stone-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                            {previewContent || '(空文件)'}
                          </pre>
                        )}
                      </div>
                      <div className="flex justify-end mt-1.5">
                        <button
                          onClick={() => { setPreviewFile(null); setPreviewContent('') }}
                          className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
                        >
                          <FiX size={11} />
                          关闭预览
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-stone-100">
            <p className="text-xs text-stone-400">
              日志存储在 ~/.taskpilot/logs/ 目录下，按日期自动生成，记录应用运行状态和错误信息。
            </p>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
