import { create } from 'zustand'

export interface Project {
  id: string
  name: string
  description: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  description: string
  status: string  // todo, doing, done
  priority: number // 0-3
  dueDate: string
  tags: string       // 逗号分隔标签
  createdAt: string
  updatedAt: string
}

export interface Meeting {
  id: string
  projectId: string
  title: string
  status: string // recording, transcribing, diarizing, analyzing, done, error
  audioPath: string
  transcriptPath: string
  summary: string
  duration: number
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolResults?: { action: string; success: boolean; message: string }[]
  timestamp: number
  isError?: boolean
}

interface AppState {
  // 项目
  projects: Project[]
  selectedProjectId: string | null
  // 任务
  tasks: Task[]
  // 会议
  meetings: Meeting[]
  selectedMeetingId: string | null
  // 视图
  currentView: 'project' | 'today' | 'settings' | 'logs' | 'meetings' | 'meeting-detail'
  // AI 面板
  showChatPanel: boolean
  chatMessages: ChatMessage[]
  // 操作
  setProjects: (projects: Project[]) => void
  setSelectedProjectId: (id: string | null) => void
  setTasks: (tasks: Task[]) => void
  setMeetings: (meetings: Meeting[]) => void
  setSelectedMeetingId: (id: string | null) => void
  setCurrentView: (view: 'project' | 'today' | 'settings' | 'logs' | 'meetings' | 'meeting-detail') => void
  toggleChatPanel: () => void
  addChatMessage: (msg: ChatMessage) => void
  clearChatMessages: () => void
  loadChatHistory: (projectId: string) => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  selectedProjectId: null,
  tasks: [],
  meetings: [],
  selectedMeetingId: null,
  currentView: 'today',
  showChatPanel: false,
  chatMessages: [],

  setProjects: (projects) => set({ projects }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id, currentView: 'project' }),
  setTasks: (tasks) => set({ tasks }),
  setMeetings: (meetings) => set({ meetings }),
  setSelectedMeetingId: (id) => set({ selectedMeetingId: id, currentView: 'meeting-detail' }),
  setCurrentView: (view) => set({ currentView: view }),
  toggleChatPanel: () => set((state) => ({ showChatPanel: !state.showChatPanel })),
  addChatMessage: (msg) => set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  clearChatMessages: () => set({ chatMessages: [] }),
  loadChatHistory: async (projectId: string) => {
    try {
      const { getChatHistory } = await import('../hooks/useWails')
      const history = await getChatHistory(projectId, 50, 0)
      const messages: ChatMessage[] = (history || []).map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
        toolResults: h.toolResults,
        timestamp: new Date(h.createdAt).getTime(),
      }))
      set({ chatMessages: messages })
    } catch {
      // Silently fail — fresh chat is fine
    }
  },
}))
