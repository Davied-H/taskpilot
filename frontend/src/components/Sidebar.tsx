import { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { Calendar, Plus, Settings, MessageSquare, FolderOpen, FileText, Pencil, Mic } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { Project } from '../stores/appStore'
import { updateProject } from '../hooks/useWails'
import ProjectForm from './ProjectForm'

export default function Sidebar() {
  const {
    projects,
    selectedProjectId,
    currentView,
    showChatPanel,
    setSelectedProjectId,
    setCurrentView,
    toggleChatPanel,
    setProjects,
  } = useAppStore()

  const [showProjectForm, setShowProjectForm] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingProjectId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingProjectId])

  function handleStartEdit(project: Project) {
    setEditingProjectId(project.id)
    setEditingName(project.name)
  }

  async function handleSaveEdit(project: Project) {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === project.name) {
      setEditingProjectId(null)
      return
    }
    try {
      await updateProject(project.id, trimmed, project.description, project.color)
      setProjects(projects.map((p) => (p.id === project.id ? { ...p, name: trimmed } : p)))
    } finally {
      setEditingProjectId(null)
    }
  }

  function handleProjectSaved(project: Project) {
    const exists = projects.find((p) => p.id === project.id)
    if (exists) {
      setProjects(projects.map((p) => (p.id === project.id ? project : p)))
    } else {
      setProjects([...projects, project])
    }
    setShowProjectForm(false)
    setEditingProject(null)
    setSelectedProjectId(project.id)
  }

  return (
    <>
      <aside className="w-64 h-full sidebar-gradient flex flex-col select-none shrink-0 border-r border-white/[0.04]">
        {/* Logo */}
        <div className="px-5 pt-10 pb-5 border-b border-white/[0.06]">
          <h1 className="text-white font-bold text-lg tracking-tight">
            Task<span className="text-indigo-400">Pilot</span>
          </h1>
        </div>

        {/* 今日 */}
        <nav className="px-3 pt-3">
          <motion.button
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setCurrentView('today')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative cursor-pointer ${
              currentView === 'today'
                ? 'text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {currentView === 'today' && (
              <motion.div
                layoutId="nav-active"
                className="absolute inset-0 bg-white/[0.1] rounded-lg"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
              />
            )}
            <Calendar size={16} className="relative z-10" />
            <span className="relative z-10">今日</span>
          </motion.button>
        </nav>

        {/* 会议 */}
        <nav className="px-3 pt-1">
          <motion.button
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setCurrentView('meetings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative cursor-pointer ${
              currentView === 'meetings' || currentView === 'meeting-detail'
                ? 'text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {(currentView === 'meetings' || currentView === 'meeting-detail') && (
              <motion.div
                layoutId="nav-active"
                className="absolute inset-0 bg-white/[0.1] rounded-lg"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
              />
            )}
            <Mic size={16} className="relative z-10" />
            <span className="relative z-10">会议</span>
          </motion.button>
        </nav>

        {/* 项目列表 */}
        <div className="flex-1 overflow-y-auto px-3 pt-4">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">项目</span>
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => { setEditingProject(null); setShowProjectForm(true) }}
              className="text-gray-500 hover:text-white transition-colors p-0.5 rounded cursor-pointer"
              title="新建项目"
            >
              <Plus size={14} />
            </motion.button>
          </div>

          {projects.length > 0 ? (
            <ul className="space-y-0.5">
              {projects.map((project) => (
                <li key={project.id}>
                  <motion.button
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (editingProjectId !== project.id) setSelectedProjectId(project.id)
                    }}
                    onDoubleClick={() => handleStartEdit(project)}
                    title="双击重命名"
                    className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative cursor-pointer ${
                      selectedProjectId === project.id && currentView === 'project'
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    {selectedProjectId === project.id && currentView === 'project' && (
                      <motion.div
                        layoutId="nav-active"
                        className="absolute inset-0 bg-white/[0.1] rounded-lg"
                        transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                      />
                    )}
                    <span
                      className="w-2 h-2 rounded-full shrink-0 relative z-10"
                      style={{ backgroundColor: project.color }}
                    />
                    {editingProjectId === project.id ? (
                      <input
                        ref={editInputRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveEdit(project)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(project)
                          if (e.key === 'Escape') setEditingProjectId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="relative z-10 bg-white/10 text-white text-sm rounded px-1 py-0 outline-none border border-white/20 w-full min-w-0 cursor-text"
                      />
                    ) : (
                      <>
                        <span className="truncate relative z-10 flex-1 text-left">{project.name}</span>
                        <Pencil
                          size={11}
                          className="relative z-10 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity"
                        />
                      </>
                    )}
                  </motion.button>
                </li>
              ))}
            </ul>
          ) : (
            <button
              onClick={() => { setEditingProject(null); setShowProjectForm(true) }}
              className="w-full flex flex-col items-center gap-1.5 px-3 py-4 mt-1 text-xs text-gray-600 hover:text-gray-400 transition-colors cursor-pointer rounded-lg hover:bg-white/[0.04] group"
            >
              <FolderOpen size={20} className="opacity-40 group-hover:opacity-60 transition-opacity" />
              <span className="text-center leading-relaxed">还没有项目<br />点击 + 新建一个</span>
            </button>
          )}
        </div>

        {/* 底部操作 */}
        <div className="px-3 pb-4 border-t border-white/[0.06] pt-3 space-y-0.5">
          <motion.button
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setCurrentView('logs')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative cursor-pointer ${
              currentView === 'logs'
                ? 'text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {currentView === 'logs' && (
              <motion.div
                layoutId="nav-active-bottom"
                className="absolute inset-0 bg-white/[0.1] rounded-lg"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
              />
            )}
            <FileText size={16} className="relative z-10" />
            <span className="relative z-10">运行日志</span>
          </motion.button>

          <motion.button
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative cursor-pointer ${
              currentView === 'settings'
                ? 'text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {currentView === 'settings' && (
              <motion.div
                layoutId="nav-active-bottom"
                className="absolute inset-0 bg-white/[0.1] rounded-lg"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
              />
            )}
            <Settings size={16} className="relative z-10" />
            <span className="relative z-10">设置</span>
          </motion.button>

          <motion.button
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={toggleChatPanel}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
              showChatPanel
                ? 'bg-indigo-600/90 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <MessageSquare size={16} />
            <span>AI 助手</span>
            {showChatPanel && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />
            )}
          </motion.button>
        </div>
      </aside>

      {showProjectForm && (
        <ProjectForm
          project={editingProject}
          onSave={handleProjectSaved}
          onClose={() => { setShowProjectForm(false); setEditingProject(null) }}
        />
      )}
    </>
  )
}
