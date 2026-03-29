import { CreateProject, UpdateProject, DeleteProject, GetProjects } from '../../wailsjs/go/main/App'
import { CreateTask, UpdateTask, DeleteTask, GetTasksByProject, GetTodayTasks, GetAllTasks } from '../../wailsjs/go/main/App'
import { ChatWithAI, GetDailySummary, ClearChatHistory } from '../../wailsjs/go/main/App'
import { GetAPIKey, SaveAPIKey } from '../../wailsjs/go/main/App'
import { GetAIConfig, SaveAIConfig, TestAIConnection } from '../../wailsjs/go/main/App'
import { SmartSuggestTasks, DecomposeTask, PrioritizeTasks, GenerateWeeklyReport } from '../../wailsjs/go/main/App'

import type { Project, Task } from '../stores/appStore'

// ---- 项目相关 ----

export async function getProjects(): Promise<Project[]> {
  return await GetProjects()
}

export async function createProject(name: string, description: string, color: string): Promise<Project> {
  return await CreateProject(name, description, color)
}

export async function updateProject(id: string, name: string, description: string, color: string): Promise<Project> {
  await UpdateProject(id, name, description, color)
  return { id, name, description, color, createdAt: '', updatedAt: new Date().toISOString() }
}

export async function deleteProject(id: string): Promise<void> {
  await DeleteProject(id)
}

// ---- 任务相关 ----

export async function getAllTasks(): Promise<Task[]> {
  return await GetAllTasks()
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  return await GetTasksByProject(projectId)
}

export async function getTodayTasks(): Promise<Task[]> {
  return await GetTodayTasks()
}

export async function createTask(
  title: string,
  projectId: string,
  description: string,
  priority: number,
  dueDate: string
): Promise<Task> {
  return await CreateTask(title, projectId, description, priority, dueDate)
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
  await UpdateTask(id, title, projectId, description, status, priority, dueDate)
}

export async function deleteTask(id: string): Promise<void> {
  await DeleteTask(id)
}

// ---- AI 相关 ----

export interface ChatResponse {
  text: string
  toolCalls: { action: string; success: boolean; message: string }[]
}

export async function chatWithAI(message: string): Promise<ChatResponse> {
  return await ChatWithAI(message)
}

export async function getDailySummary(): Promise<string> {
  return await GetDailySummary()
}

export async function clearChatHistory(): Promise<void> {
  await ClearChatHistory()
}

// ---- AI 高级功能 ----

export async function smartSuggestTasks(projectId: string): Promise<string> {
  return await SmartSuggestTasks(projectId)
}

export async function decomposeTask(taskId: string): Promise<string> {
  return await DecomposeTask(taskId)
}

export async function prioritizeTasks(projectId: string): Promise<string> {
  return await PrioritizeTasks(projectId)
}

export async function generateWeeklyReport(): Promise<string> {
  return await GenerateWeeklyReport()
}

// ---- 设置相关 ----

export interface AIConfigData {
  apiKey: string
  baseURL: string
  model: string
}

export async function getAPIKey(): Promise<string> {
  return await GetAPIKey()
}

export async function saveAPIKey(key: string): Promise<void> {
  await SaveAPIKey(key)
}

export async function getAIConfig(): Promise<AIConfigData> {
  return await GetAIConfig()
}

export async function saveAIConfig(apiKey: string, baseURL: string, model: string): Promise<void> {
  await SaveAIConfig(apiKey, baseURL, model)
}

export async function testAIConnection(): Promise<void> {
  await TestAIConnection()
}
