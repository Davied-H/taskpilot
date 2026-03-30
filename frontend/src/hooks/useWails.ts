import { ProjectService } from '../../bindings/taskpilot/services'
import { TaskService } from '../../bindings/taskpilot/services'
import { AIService } from '../../bindings/taskpilot/services'
import { ConfigService } from '../../bindings/taskpilot/services'

import type { Project, Task } from '../stores/appStore'

// ---- 项目相关 ----

export async function getProjects(): Promise<Project[]> {
  return await ProjectService.GetProjects()
}

export async function createProject(name: string, description: string, color: string): Promise<Project> {
  const result = await ProjectService.CreateProject(name, description, color)
  return result!
}

export async function updateProject(id: string, name: string, description: string, color: string): Promise<Project> {
  await ProjectService.UpdateProject(id, name, description, color)
  return { id, name, description, color, createdAt: '', updatedAt: new Date().toISOString() }
}

export async function deleteProject(id: string): Promise<void> {
  await ProjectService.DeleteProject(id)
}

// ---- 任务相关 ----

export async function getAllTasks(): Promise<Task[]> {
  return await TaskService.GetAllTasks()
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  return await TaskService.GetTasksByProject(projectId)
}

export async function getTodayTasks(): Promise<Task[]> {
  return await TaskService.GetTodayTasks()
}

export async function createTask(
  title: string,
  projectId: string,
  description: string,
  priority: number,
  dueDate: string
): Promise<Task> {
  const result = await TaskService.CreateTask(title, projectId, description, priority, dueDate)
  return result!
}

export async function updateTask(
  id: string,
  title: string,
  projectId: string,
  description: string,
  status: string,
  priority: number,
  dueDate: string
): Promise<void> {
  await TaskService.UpdateTask(id, title, projectId, description, status, priority, dueDate)
}

export async function deleteTask(id: string): Promise<void> {
  await TaskService.DeleteTask(id)
}

// ---- AI 相关 ----

export interface ChatResponse {
  text: string
  toolCalls: { action: string; success: boolean; message: string }[]
}

export async function chatWithAI(message: string): Promise<ChatResponse> {
  const result = await AIService.ChatWithAI(message)
  return result!
}

export async function getDailySummary(): Promise<string> {
  return await AIService.GetDailySummary()
}

export async function clearChatHistory(): Promise<void> {
  await AIService.ClearChatHistory()
}

// ---- AI 流式 & 持久化 ----

export interface ChatHistoryItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolResults?: { action: string; success: boolean; message: string }[]
  createdAt: string
}

export async function streamChatWithAI(message: string, projectId: string): Promise<void> {
  await AIService.StreamChatWithAI(message, projectId)
}

export async function getChatHistory(projectId: string, limit: number, offset: number): Promise<ChatHistoryItem[]> {
  const result = await AIService.GetChatHistory(projectId, limit, offset)
  return (result || []) as unknown as ChatHistoryItem[]
}

export async function clearProjectChatHistory(projectId: string): Promise<void> {
  await AIService.ClearProjectChatHistory(projectId)
}

export async function getProactiveSuggestions(projectId: string): Promise<string> {
  return await AIService.GetProactiveSuggestions(projectId)
}

// ---- AI 高级功能 ----

export async function smartSuggestTasks(projectId: string): Promise<string> {
  return await AIService.SmartSuggestTasks(projectId)
}

export async function decomposeTask(taskId: string): Promise<string> {
  return await AIService.DecomposeTask(taskId)
}

export async function prioritizeTasks(projectId: string): Promise<string> {
  return await AIService.PrioritizeTasks(projectId)
}

export async function generateWeeklyReport(): Promise<string> {
  return await AIService.GenerateWeeklyReport()
}

// ---- 日志相关 ----

import { LogService } from '../../bindings/taskpilot/services'
import type { LogFileInfo } from '../../bindings/taskpilot/services/models'
export type { LogFileInfo }

export async function getLogFiles(): Promise<LogFileInfo[]> {
  return await LogService.GetLogFiles()
}

export async function exportLogs(filename: string): Promise<void> {
  await LogService.ExportLogs(filename)
}

export async function openLogDir(): Promise<void> {
  await LogService.OpenLogDir()
}

export async function getLogContent(filename: string, tailLines: number): Promise<string> {
  return await LogService.GetLogContent(filename, tailLines)
}

export async function clearOldLogs(days: number): Promise<number> {
  return await LogService.ClearOldLogs(days)
}

// ---- 设置相关 ----

export interface AIConfigData {
  apiKey: string
  baseURL: string
  model: string
}

export async function getAPIKey(): Promise<string> {
  return await ConfigService.GetAPIKey()
}

export async function saveAPIKey(key: string): Promise<void> {
  await ConfigService.SaveAPIKey(key)
}

export async function getAIConfig(): Promise<AIConfigData> {
  const result = await ConfigService.GetAIConfig()
  return result!
}

export async function saveAIConfig(apiKey: string, baseURL: string, model: string): Promise<void> {
  await ConfigService.SaveAIConfig(apiKey, baseURL, model)
}

export async function testAIConnection(): Promise<void> {
  await AIService.TestAIConnection()
}

// ---- 快捷键配置 ----

export async function getShortcutConfig(): Promise<string> {
  return await ConfigService.GetConfig('keyboard_shortcuts')
}

export async function saveShortcutConfig(json: string): Promise<void> {
  await ConfigService.SetConfig('keyboard_shortcuts', json)
}

// ---- 会议相关 ----

import { MeetingService } from '../../bindings/taskpilot/services'
import type { Meeting } from '../stores/appStore'

export interface MeetingSpeaker {
  id: string
  meetingId: string
  speakerLabel: string
  displayName: string
  color: string
}

export interface TranscriptSegment {
  id: string
  meetingId: string
  speakerId: string
  startTime: number
  endTime: number
  text: string
}

export interface RecordingState {
  meetingId: string
  status: string
  duration: number
}

export async function getMeetings(): Promise<Meeting[]> {
  return await MeetingService.GetMeetings() || []
}

export async function getMeeting(id: string): Promise<Meeting> {
  const result = await MeetingService.GetMeeting(id)
  return result!
}

export async function createMeeting(title: string, projectId: string): Promise<Meeting> {
  const result = await MeetingService.CreateMeeting(title, projectId)
  return result!
}

export async function deleteMeeting(id: string): Promise<void> {
  await MeetingService.DeleteMeeting(id)
}

export async function startRecording(title: string, projectId: string): Promise<Meeting> {
  const result = await MeetingService.StartRecording(title, projectId)
  return result!
}

export async function stopRecording(): Promise<Meeting> {
  const result = await MeetingService.StopRecording()
  return result!
}

export async function getRecordingState(): Promise<RecordingState> {
  return await MeetingService.GetRecordingState()
}

export async function getSpeakers(meetingId: string): Promise<MeetingSpeaker[]> {
  return await MeetingService.GetSpeakers(meetingId) || []
}

export async function renameSpeaker(speakerId: string, displayName: string): Promise<void> {
  await MeetingService.RenameSpeaker(speakerId, displayName)
}

export async function mergeSpeakers(toId: string, fromId: string): Promise<void> {
  await MeetingService.MergeSpeakers(toId, fromId)
}

export async function getSegments(meetingId: string): Promise<TranscriptSegment[]> {
  return await MeetingService.GetSegments(meetingId) || []
}

// ---- 飞书相关 ----

import { FeishuService } from '../../bindings/taskpilot/services'

export interface FeishuConfig {
  appId: string
  appSecret: string
  bitableApp: string
  bitableTable: string
  syncEnabled: boolean
  syncInterval: number
}

export interface SyncStatus {
  running: boolean
  lastSyncAt: string
  lastError: string
  syncedCount: number
  pushedCount: number
  pulledCount: number
}

export async function getFeishuConfig(): Promise<FeishuConfig> {
  const result = await FeishuService.GetFeishuConfig()
  return result!
}

export async function saveFeishuConfig(cfg: FeishuConfig): Promise<void> {
  await FeishuService.SaveFeishuConfig(cfg)
}

export async function testFeishuConnection(): Promise<void> {
  await FeishuService.TestConnection()
}

export async function startFeishuSync(): Promise<void> {
  await FeishuService.StartSync()
}

export async function stopFeishuSync(): Promise<void> {
  await FeishuService.StopSync()
}

export async function syncFeishuNow(): Promise<void> {
  await FeishuService.SyncNow()
}

export async function getFeishuSyncStatus(): Promise<SyncStatus> {
  return await FeishuService.GetSyncStatus()
}

// ---- 飞书 Bot ----

export interface BotConfig {
  botEnabled: boolean
  botChatId: string
  notifyOnChange: boolean
}

export async function getBotConfig(): Promise<BotConfig> {
  const result = await FeishuService.GetBotConfig()
  return result!
}

export async function saveBotConfig(cfg: BotConfig): Promise<void> {
  await FeishuService.SaveBotConfig(cfg)
}

export async function sendBotMessage(text: string): Promise<void> {
  await FeishuService.SendBotMessage(text)
}
