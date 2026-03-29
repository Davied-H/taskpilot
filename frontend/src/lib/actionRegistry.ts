import { Events } from '@wailsio/runtime'
import { useAppStore } from '../stores/appStore'
import { useShortcutStore } from '../stores/shortcutStore'
import type { ActionDef } from './keybindings'

export function registerAllActions() {
  const register = useShortcutStore.getState().registerAction

  const defs: ActionDef[] = [
    // ── Navigation ──
    {
      id: 'nav.today',
      label: '今日视图',
      labelEn: 'Today View',
      category: 'navigation',
      icon: 'Calendar',
      keywords: ['today', '今日', '日历'],
      handler: () => useAppStore.getState().setCurrentView('today'),
    },
    {
      id: 'nav.projects',
      label: '项目列表',
      labelEn: 'Projects',
      category: 'navigation',
      icon: 'FolderOpen',
      keywords: ['project', '项目'],
      handler: () => {
        const { projects, setSelectedProjectId } = useAppStore.getState()
        if (projects.length > 0) setSelectedProjectId(projects[0].id)
      },
    },
    {
      id: 'nav.settings',
      label: '打开设置',
      labelEn: 'Settings',
      category: 'navigation',
      icon: 'Settings',
      keywords: ['settings', '设置', '配置', 'preferences'],
      handler: () => useAppStore.getState().setCurrentView('settings'),
    },
    {
      id: 'nav.logs',
      label: '运行日志',
      labelEn: 'Logs',
      category: 'navigation',
      icon: 'FileText',
      keywords: ['logs', '日志'],
      handler: () => useAppStore.getState().setCurrentView('logs'),
    },
    {
      id: 'nav.nextProject',
      label: '下一个项目',
      labelEn: 'Next Project',
      category: 'navigation',
      keywords: ['next', '下一个'],
      handler: () => {
        const { projects, selectedProjectId, setSelectedProjectId } = useAppStore.getState()
        if (projects.length === 0) return
        const idx = projects.findIndex(p => p.id === selectedProjectId)
        const next = projects[(idx + 1) % projects.length]
        setSelectedProjectId(next.id)
      },
    },
    {
      id: 'nav.prevProject',
      label: '上一个项目',
      labelEn: 'Previous Project',
      category: 'navigation',
      keywords: ['previous', '上一个'],
      handler: () => {
        const { projects, selectedProjectId, setSelectedProjectId } = useAppStore.getState()
        if (projects.length === 0) return
        const idx = projects.findIndex(p => p.id === selectedProjectId)
        const prev = projects[(idx - 1 + projects.length) % projects.length]
        setSelectedProjectId(prev.id)
      },
    },

    // ── Tasks ──
    {
      id: 'task.quickAdd',
      label: '快速添加任务',
      labelEn: 'Quick Add Task',
      category: 'tasks',
      icon: 'PlusCircle',
      keywords: ['add', 'new', 'create', '添加', '新建', '创建', 'quick'],
      handler: () => Events.Emit('shortcut:action', 'task.quickAdd'),
    },
    {
      id: 'task.newInProject',
      label: '在项目中新建任务',
      labelEn: 'New Task in Project',
      category: 'tasks',
      icon: 'Plus',
      keywords: ['new task', '新任务'],
      handler: () => {
        // Emit an event that TaskList/TodayView can listen to
        window.dispatchEvent(new CustomEvent('taskpilot:new-task'))
      },
    },
    {
      id: 'task.complete',
      label: '标记任务完成',
      labelEn: 'Toggle Task Complete',
      category: 'tasks',
      icon: 'CheckCircle',
      keywords: ['complete', 'done', '完成'],
      handler: () => {
        window.dispatchEvent(new CustomEvent('taskpilot:complete-task'))
      },
    },
    {
      id: 'task.delete',
      label: '删除任务',
      labelEn: 'Delete Task',
      category: 'tasks',
      icon: 'Trash2',
      keywords: ['delete', 'remove', '删除'],
      handler: () => {
        window.dispatchEvent(new CustomEvent('taskpilot:delete-task'))
      },
    },
    {
      id: 'task.edit',
      label: '编辑任务',
      labelEn: 'Edit Task',
      category: 'tasks',
      icon: 'Edit',
      keywords: ['edit', '编辑', 'modify'],
      handler: () => {
        window.dispatchEvent(new CustomEvent('taskpilot:edit-task'))
      },
    },

    // ── AI ──
    {
      id: 'ai.togglePanel',
      label: 'AI 助手面板',
      labelEn: 'Toggle AI Panel',
      category: 'ai',
      icon: 'MessageSquare',
      keywords: ['ai', 'chat', 'assistant', '助手', '聊天', '面板'],
      handler: () => useAppStore.getState().toggleChatPanel(),
    },
    {
      id: 'ai.chatWindow',
      label: '打开 AI 窗口',
      labelEn: 'Open AI Chat Window',
      category: 'ai',
      icon: 'ExternalLink',
      keywords: ['chat window', 'AI 窗口', 'standalone'],
      handler: () => Events.Emit('shortcut:action', 'ai.chatWindow'),
    },
    {
      id: 'ai.dailySummary',
      label: '生成今日摘要',
      labelEn: 'Daily Summary',
      category: 'ai',
      icon: 'Sparkles',
      keywords: ['summary', '摘要', 'daily', '每日'],
      handler: () => {
        window.dispatchEvent(new CustomEvent('taskpilot:daily-summary'))
      },
    },

    // ── General ──
    {
      id: 'general.commandPalette',
      label: '命令面板',
      labelEn: 'Command Palette',
      category: 'general',
      icon: 'Search',
      keywords: ['command', 'palette', '命令', 'search', '搜索'],
      handler: () => useShortcutStore.getState().togglePalette(),
    },
    {
      id: 'general.search',
      label: '搜索任务',
      labelEn: 'Search Tasks',
      category: 'general',
      icon: 'Search',
      keywords: ['search', 'filter', '搜索', '过滤', 'find'],
      handler: () => {
        // Open command palette in search mode
        useShortcutStore.getState().openPalette()
      },
    },
    {
      id: 'general.escape',
      label: '关闭 / 取消',
      labelEn: 'Close / Cancel',
      category: 'general',
      handler: () => {
        const scStore = useShortcutStore.getState()
        if (scStore.isPaletteOpen) {
          scStore.closePalette()
        }
      },
    },
  ]

  for (const def of defs) {
    register(def)
  }
}
