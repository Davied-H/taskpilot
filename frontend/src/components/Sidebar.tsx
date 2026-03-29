import { useState } from 'react'
import { motion } from 'motion/react'
import { Calendar, Plus, Settings, MessageSquare, FolderOpen } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { Project } from '../stores/appStore'
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
        <div className="px-5 py-5 border-b border-white/[0.06]">
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
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative ${
              currentView === 'today'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
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

        {/* 项目列表 */}
        <div className="flex-1 overflow-y-auto px-3 pt-4">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">项目</span>
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => { setEditingProject(null); setShowProjectForm(true) }}
              className="text-gray-500 hover:text-white transition-colors p-0.5 rounded"
              title="新建项目"
            >
              <Plus size={14} />
            </motion.button>
          </div>

          {projects.length === 0 ? (
            <p className="text-xs text-gray-600 px-3 py-2">暂无项目</p>
          ) : (
            <ul className="space-y-0.5">
              {projects.map((project) => (
                <li key={project.id}>
                  <motion.button
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative ${
                      selectedProjectId === project.id && currentView === 'project'
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white'
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
                    <span className="truncate relative z-10">{project.name}</span>
                  </motion.button>
                </li>
              ))}
            </ul>
          )}

          {projects.length === 0 && (
            <button
              onClick={() => { setEditingProject(null); setShowProjectForm(true) }}
              className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              <FolderOpen size={14} />
              <span>新建第一个项目</span>
            </button>
          )}
        </div>

        {/* 底部操作 */}
        <div className="px-3 pb-4 border-t border-white/[0.06] pt-3 space-y-0.5">
          <motion.button
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative ${
              currentView === 'settings'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {currentView === 'settings' && (
              <motion.div
                layoutId="nav-active"
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
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              showChatPanel
                ? 'bg-indigo-600/90 text-white'
                : 'text-gray-400 hover:text-white'
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
