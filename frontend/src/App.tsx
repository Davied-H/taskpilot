import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import './style.css'
import { useAppStore } from './stores/appStore'
import { getProjects, getAllTasks } from './hooks/useWails'
import Sidebar from './components/Sidebar'
import TaskList from './components/TaskList'
import TodayView from './components/TodayView'
import SettingsView from './components/SettingsView'
import ChatPanel from './components/ChatPanel'

function App() {
  const { currentView, showChatPanel, setProjects, setTasks } = useAppStore()

  useEffect(() => {
    getProjects().then((projects) => setProjects(projects || []))
    getAllTasks().then((tasks) => setTasks(tasks || []))
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden noise-bg" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {currentView === 'today' && (
            <motion.div
              key="today"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 overflow-hidden flex flex-col"
            >
              <TodayView />
            </motion.div>
          )}
          {currentView === 'project' && (
            <motion.div
              key="project"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 overflow-hidden flex flex-col"
            >
              <TaskList />
            </motion.div>
          )}
          {currentView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 overflow-hidden flex flex-col"
            >
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showChatPanel && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 384, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden flex-shrink-0"
          >
            <ChatPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
