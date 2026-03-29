package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"taskpilot/internal/ai"
	"taskpilot/internal/model"
	"taskpilot/internal/store"
)

// ChatResponse is returned from ChatWithAI to the frontend.
type ChatResponse struct {
	Text      string           `json:"text"`
	ToolCalls []ToolCallResult `json:"toolCalls"`
}

// ToolCallResult represents the outcome of a single AI tool call.
type ToolCallResult struct {
	Action  string `json:"action"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// AIConfig holds the AI configuration.
type AIConfig struct {
	APIKey  string `json:"apiKey"`
	BaseURL string `json:"baseURL"`
	Model   string `json:"model"`
}

// App holds application-wide state.
type App struct {
	ctx          context.Context
	db           *store.DB
	projectStore *store.ProjectStore
	taskStore    *store.TaskStore
	configStore  *store.ConfigStore
	aiClient     *ai.ClaudeClient
	chatHistory  []ai.ChatMessage
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{}
}

// startup is called by Wails when the application starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Ensure ~/.taskpilot exists.
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Println("startup: could not determine home dir:", err)
		return
	}
	dataDir := filepath.Join(home, ".taskpilot")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		fmt.Println("startup: could not create data dir:", err)
		return
	}

	db, err := store.NewDB(filepath.Join(dataDir, "data.db"))
	if err != nil {
		fmt.Println("startup: could not open database:", err)
		return
	}
	a.db = db
	a.projectStore = store.NewProjectStore(db)
	a.taskStore = store.NewTaskStore(db)
	a.configStore = store.NewConfigStore(db)

	// Initialise AI client if an API key is already stored.
	a.initAIClient()
}

func (a *App) initAIClient() {
	apiKey, _ := a.configStore.Get("api_key")
	baseURL, _ := a.configStore.Get("api_base_url")
	modelName, _ := a.configStore.Get("api_model")
	if apiKey != "" {
		a.aiClient = ai.NewClaudeClient(apiKey, baseURL, modelName)
	}
}

// ---------------------------------------------------------------------------
// Project management
// ---------------------------------------------------------------------------

// CreateProject creates a new project and returns it.
func (a *App) CreateProject(name, description, color string) (*model.Project, error) {
	p := model.Project{
		Name:        name,
		Description: description,
		Color:       color,
	}
	if err := a.projectStore.Create(p); err != nil {
		return nil, err
	}
	projects, err := a.projectStore.List()
	if err != nil {
		return nil, err
	}
	for i := len(projects) - 1; i >= 0; i-- {
		if projects[i].Name == name && projects[i].Color == color {
			result := projects[i]
			return &result, nil
		}
	}
	return nil, fmt.Errorf("project created but could not be retrieved")
}

// UpdateProject updates an existing project.
func (a *App) UpdateProject(id, name, description, color string) error {
	return a.projectStore.Update(model.Project{
		ID:          id,
		Name:        name,
		Description: description,
		Color:       color,
	})
}

// DeleteProject removes a project by ID.
func (a *App) DeleteProject(id string) error {
	return a.projectStore.Delete(id)
}

// GetProjects returns all projects.
func (a *App) GetProjects() ([]model.Project, error) {
	return a.projectStore.List()
}

// ---------------------------------------------------------------------------
// Task management
// ---------------------------------------------------------------------------

// CreateTask creates a new task and returns it.
func (a *App) CreateTask(title, projectId, description string, priority int, dueDate string) (*model.Task, error) {
	t := model.Task{
		Title:       title,
		ProjectID:   projectId,
		Description: description,
		Priority:    priority,
		DueDate:     dueDate,
		Status:      "todo",
	}
	if err := a.taskStore.Create(t); err != nil {
		return nil, err
	}
	tasks, err := a.taskStore.ListAll()
	if err != nil {
		return nil, err
	}
	for i := len(tasks) - 1; i >= 0; i-- {
		if tasks[i].Title == title && tasks[i].ProjectID == projectId {
			result := tasks[i]
			return &result, nil
		}
	}
	return nil, fmt.Errorf("task created but could not be retrieved")
}

// UpdateTask updates an existing task.
func (a *App) UpdateTask(id, title, projectId, description, status string, priority int, dueDate string) error {
	return a.taskStore.Update(model.Task{
		ID:          id,
		Title:       title,
		ProjectID:   projectId,
		Description: description,
		Status:      status,
		Priority:    priority,
		DueDate:     dueDate,
	})
}

// DeleteTask removes a task by ID.
func (a *App) DeleteTask(id string) error {
	return a.taskStore.Delete(id)
}

// GetTasksByProject returns all tasks belonging to a project.
func (a *App) GetTasksByProject(projectId string) ([]model.Task, error) {
	return a.taskStore.ListByProject(projectId)
}

// GetTodayTasks returns tasks due today or currently in progress.
func (a *App) GetTodayTasks() ([]model.Task, error) {
	return a.taskStore.ListTodayTasks()
}

// GetAllTasks returns every task.
func (a *App) GetAllTasks() ([]model.Task, error) {
	return a.taskStore.ListAll()
}

// ---------------------------------------------------------------------------
// AI features
// ---------------------------------------------------------------------------

// ChatWithAI sends a message to Claude, executes any tool calls it returns,
// and returns the AI text response together with tool execution results.
func (a *App) ChatWithAI(message string) (*ChatResponse, error) {
	if a.aiClient == nil {
		return nil, fmt.Errorf("AI 未配置 – 请先在设置中配置 API Key")
	}

	tasks, err := a.taskStore.ListAll()
	if err != nil {
		tasks = []model.Task{}
	}
	taskJSON, _ := json.Marshal(tasks)

	a.chatHistory = append(a.chatHistory, ai.ChatMessage{
		Role:    "user",
		Content: message,
	})

	text, toolCalls, err := a.aiClient.Chat(a.chatHistory, string(taskJSON))
	if err != nil {
		return nil, fmt.Errorf("AI 对话失败: %w", err)
	}

	a.chatHistory = append(a.chatHistory, ai.ChatMessage{
		Role:    "assistant",
		Content: text,
	})

	var toolResults []ToolCallResult
	for _, tc := range toolCalls {
		toolResults = append(toolResults, a.executeToolCall(tc))
	}

	return &ChatResponse{
		Text:      text,
		ToolCalls: toolResults,
	}, nil
}

// executeToolCall dispatches a single AI tool call to the appropriate store method.
func (a *App) executeToolCall(tc ai.ToolCall) ToolCallResult {
	getStr := func(key string) string {
		if v, ok := tc.Input[key]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
		return ""
	}
	getInt := func(key string) int {
		if v, ok := tc.Input[key]; ok {
			if f, ok := v.(float64); ok {
				return int(f)
			}
		}
		return 0
	}

	switch tc.Name {
	case "create_task":
		title := getStr("title")
		err := a.taskStore.Create(model.Task{
			Title:     title,
			ProjectID: getStr("projectId"),
			Priority:  getInt("priority"),
			DueDate:   getStr("dueDate"),
			Status:    "todo",
		})
		if err != nil {
			return ToolCallResult{Action: tc.Name, Success: false, Message: err.Error()}
		}
		return ToolCallResult{Action: tc.Name, Success: true, Message: fmt.Sprintf("任务 '%s' 已创建", title)}

	case "update_task":
		id := getStr("id")
		existing, err := a.taskStore.GetByID(id)
		if err != nil {
			return ToolCallResult{Action: tc.Name, Success: false, Message: err.Error()}
		}
		if s := getStr("title"); s != "" {
			existing.Title = s
		}
		if s := getStr("status"); s != "" {
			existing.Status = s
		}
		if _, ok := tc.Input["priority"]; ok {
			existing.Priority = getInt("priority")
		}
		if s := getStr("dueDate"); s != "" {
			existing.DueDate = s
		}
		if err := a.taskStore.Update(*existing); err != nil {
			return ToolCallResult{Action: tc.Name, Success: false, Message: err.Error()}
		}
		return ToolCallResult{Action: tc.Name, Success: true, Message: fmt.Sprintf("任务 '%s' 已更新", id)}

	case "delete_task":
		id := getStr("id")
		if err := a.taskStore.Delete(id); err != nil {
			return ToolCallResult{Action: tc.Name, Success: false, Message: err.Error()}
		}
		return ToolCallResult{Action: tc.Name, Success: true, Message: fmt.Sprintf("任务 '%s' 已删除", id)}

	case "list_tasks":
		var tasks []model.Task
		var err error
		if pid := getStr("projectId"); pid != "" {
			tasks, err = a.taskStore.ListByProject(pid)
		} else if status := getStr("status"); status != "" {
			tasks, err = a.taskStore.ListByStatus(status)
		} else {
			tasks, err = a.taskStore.ListAll()
		}
		if err != nil {
			return ToolCallResult{Action: tc.Name, Success: false, Message: err.Error()}
		}
		return ToolCallResult{Action: tc.Name, Success: true, Message: fmt.Sprintf("找到 %d 个任务", len(tasks))}

	default:
		return ToolCallResult{Action: tc.Name, Success: false, Message: fmt.Sprintf("unknown action: %s", tc.Name)}
	}
}

// GetDailySummary fetches today's tasks and asks the AI to summarise them.
func (a *App) GetDailySummary() (string, error) {
	if a.aiClient == nil {
		return "", fmt.Errorf("AI 未配置 – 请先在设置中配置 API Key")
	}

	tasks, err := a.taskStore.ListTodayTasks()
	if err != nil {
		return "", fmt.Errorf("could not fetch today's tasks: %w", err)
	}

	var taskMaps []map[string]interface{}
	for _, t := range tasks {
		taskMaps = append(taskMaps, map[string]interface{}{
			"id": t.ID, "title": t.Title, "status": t.Status,
			"priority": t.Priority, "dueDate": t.DueDate,
			"projectId": t.ProjectID, "description": t.Description,
		})
	}

	summary, err := a.aiClient.GenerateDailySummary(taskMaps)
	if err != nil {
		return "", fmt.Errorf("AI summary failed: %w", err)
	}
	return summary, nil
}

// SmartSuggestTasks suggests new tasks based on existing project tasks.
func (a *App) SmartSuggestTasks(projectId string) (string, error) {
	if a.aiClient == nil {
		return "", fmt.Errorf("AI 未配置 – 请先在设置中配置 API Key")
	}

	tasks, err := a.taskStore.ListByProject(projectId)
	if err != nil {
		return "", err
	}

	projects, err := a.projectStore.List()
	if err != nil {
		return "", err
	}
	projectName := "未知项目"
	for _, p := range projects {
		if p.ID == projectId {
			projectName = p.Name
			break
		}
	}

	var taskMaps []map[string]interface{}
	for _, t := range tasks {
		taskMaps = append(taskMaps, map[string]interface{}{
			"id": t.ID, "title": t.Title, "status": t.Status,
			"priority": t.Priority, "dueDate": t.DueDate, "description": t.Description,
		})
	}

	return a.aiClient.SmartSuggest(taskMaps, projectName)
}

// DecomposeTask breaks down a task into subtasks using AI.
func (a *App) DecomposeTask(taskId string) (string, error) {
	if a.aiClient == nil {
		return "", fmt.Errorf("AI 未配置 – 请先在设置中配置 API Key")
	}

	task, err := a.taskStore.GetByID(taskId)
	if err != nil {
		return "", err
	}

	allTasks, _ := a.taskStore.ListByProject(task.ProjectID)
	var taskMaps []map[string]interface{}
	for _, t := range allTasks {
		taskMaps = append(taskMaps, map[string]interface{}{
			"id": t.ID, "title": t.Title, "status": t.Status,
			"priority": t.Priority,
		})
	}

	return a.aiClient.DecomposeTask(task.Title, task.Description, taskMaps)
}

// PrioritizeTasks analyzes tasks and suggests priority adjustments.
func (a *App) PrioritizeTasks(projectId string) (string, error) {
	if a.aiClient == nil {
		return "", fmt.Errorf("AI 未配置 – 请先在设置中配置 API Key")
	}

	var tasks []model.Task
	var err error
	if projectId != "" {
		tasks, err = a.taskStore.ListByProject(projectId)
	} else {
		tasks, err = a.taskStore.ListAll()
	}
	if err != nil {
		return "", err
	}

	var taskMaps []map[string]interface{}
	for _, t := range tasks {
		taskMaps = append(taskMaps, map[string]interface{}{
			"id": t.ID, "title": t.Title, "status": t.Status,
			"priority": t.Priority, "dueDate": t.DueDate, "description": t.Description,
		})
	}

	return a.aiClient.PrioritizeTasks(taskMaps)
}

// GenerateWeeklyReport generates a weekly progress report.
func (a *App) GenerateWeeklyReport() (string, error) {
	if a.aiClient == nil {
		return "", fmt.Errorf("AI 未配置 – 请先在设置中配置 API Key")
	}

	tasks, err := a.taskStore.ListAll()
	if err != nil {
		return "", err
	}

	var taskMaps []map[string]interface{}
	for _, t := range tasks {
		taskMaps = append(taskMaps, map[string]interface{}{
			"id": t.ID, "title": t.Title, "status": t.Status,
			"priority": t.Priority, "dueDate": t.DueDate,
			"projectId": t.ProjectID, "description": t.Description,
		})
	}

	return a.aiClient.GenerateWeeklyReport(taskMaps)
}

// TestAIConnection tests if the current AI configuration is working.
func (a *App) TestAIConnection() error {
	if a.aiClient == nil {
		return fmt.Errorf("AI 未配置")
	}
	return a.aiClient.TestConnection()
}

// ClearChatHistory resets the in-memory conversation history.
func (a *App) ClearChatHistory() {
	a.chatHistory = nil
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// GetAPIKey retrieves the stored API key (backward compat).
func (a *App) GetAPIKey() (string, error) {
	return a.configStore.Get("api_key")
}

// SaveAPIKey persists the API key and (re-)initialises the AI client (backward compat).
func (a *App) SaveAPIKey(key string) error {
	if err := a.configStore.Set("api_key", key); err != nil {
		return err
	}
	a.initAIClient()
	return nil
}

// GetAIConfig retrieves the full AI configuration.
func (a *App) GetAIConfig() (*AIConfig, error) {
	apiKey, _ := a.configStore.Get("api_key")
	baseURL, _ := a.configStore.Get("api_base_url")
	modelName, _ := a.configStore.Get("api_model")
	return &AIConfig{
		APIKey:  apiKey,
		BaseURL: baseURL,
		Model:   modelName,
	}, nil
}

// SaveAIConfig persists the full AI configuration and re-initialises the client.
func (a *App) SaveAIConfig(apiKey, baseURL, modelName string) error {
	if err := a.configStore.Set("api_key", apiKey); err != nil {
		return err
	}
	if err := a.configStore.Set("api_base_url", baseURL); err != nil {
		return err
	}
	if err := a.configStore.Set("api_model", modelName); err != nil {
		return err
	}
	a.initAIClient()
	return nil
}
