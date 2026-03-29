package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"taskpilot/internal/logger"
)

const (
	defaultClaudeAPIURL = "https://api.anthropic.com/v1/messages"
	defaultClaudeModel  = "claude-sonnet-4-20250514"
	anthropicVersion    = "2023-06-01"
)

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ToolCall represents a tool invocation requested by the model.
type ToolCall struct {
	Name  string                 `json:"name"`
	Input map[string]interface{} `json:"input"`
}

// ClaudeClient wraps the Claude API.
type ClaudeClient struct {
	apiKey  string
	baseURL string
	model   string
	http    *http.Client
}

// NewClaudeClient creates a new ClaudeClient with the given API key, base URL, and model.
func NewClaudeClient(apiKey, baseURL, model string) *ClaudeClient {
	if baseURL == "" {
		baseURL = defaultClaudeAPIURL
	}
	if model == "" {
		model = defaultClaudeModel
	}
	// Ensure baseURL ends properly for the messages endpoint
	baseURL = strings.TrimRight(baseURL, "/")
	if !strings.HasSuffix(baseURL, "/v1/messages") {
		baseURL = baseURL + "/v1/messages"
	}
	return &ClaudeClient{
		apiKey:  apiKey,
		baseURL: baseURL,
		model:   model,
		http:    &http.Client{},
	}
}

// SetAPIKey updates the API key.
func (c *ClaudeClient) SetAPIKey(apiKey string) {
	c.apiKey = apiKey
}

// ---------- internal API types ----------

type apiContentBlock struct {
	Type  string          `json:"type"`
	Text  string          `json:"text,omitempty"`
	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`
}

type apiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type apiToolInputSchema struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties"`
	Required   []string               `json:"required,omitempty"`
}

type apiTool struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	InputSchema apiToolInputSchema `json:"input_schema"`
}

type apiRequest struct {
	Model     string       `json:"model"`
	MaxTokens int          `json:"max_tokens"`
	System    string       `json:"system,omitempty"`
	Messages  []apiMessage `json:"messages"`
	Tools     []apiTool    `json:"tools,omitempty"`
}

type apiResponse struct {
	Content    []apiContentBlock `json:"content"`
	StopReason string            `json:"stop_reason"`
}

// ---------- tool definitions ----------

func chatTools() []apiTool {
	return []apiTool{
		{
			Name:        "create_task",
			Description: "创建一个新任务",
			InputSchema: apiToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"title": map[string]interface{}{
						"type":        "string",
						"description": "任务标题",
					},
					"projectId": map[string]interface{}{
						"type":        "string",
						"description": "所属项目ID",
					},
					"priority": map[string]interface{}{
						"type":        "integer",
						"description": "优先级，0=P0(紧急), 1=P1, 2=P2, 3=P3",
						"minimum":     0,
						"maximum":     3,
					},
					"dueDate": map[string]interface{}{
						"type":        "string",
						"description": "截止日期，ISO格式（可选）",
					},
				},
				Required: []string{"title", "projectId"},
			},
		},
		{
			Name:        "update_task",
			Description: "更新已有任务",
			InputSchema: apiToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"id": map[string]interface{}{
						"type":        "string",
						"description": "任务ID",
					},
					"title": map[string]interface{}{
						"type":        "string",
						"description": "任务标题",
					},
					"status": map[string]interface{}{
						"type":        "string",
						"description": "任务状态",
						"enum":        []string{"todo", "doing", "done"},
					},
					"priority": map[string]interface{}{
						"type":        "integer",
						"description": "优先级，0-3",
					},
					"dueDate": map[string]interface{}{
						"type":        "string",
						"description": "截止日期，ISO格式",
					},
				},
				Required: []string{"id"},
			},
		},
		{
			Name:        "list_tasks",
			Description: "查询任务列表",
			InputSchema: apiToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"projectId": map[string]interface{}{
						"type":        "string",
						"description": "按项目ID过滤（可选）",
					},
					"status": map[string]interface{}{
						"type":        "string",
						"description": "按状态过滤：todo/doing/done（可选）",
					},
				},
			},
		},
		{
			Name:        "delete_task",
			Description: "删除一个任务",
			InputSchema: apiToolInputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"id": map[string]interface{}{
						"type":        "string",
						"description": "要删除的任务ID",
					},
				},
				Required: []string{"id"},
			},
		},
	}
}

// ---------- HTTP helper ----------

func (c *ClaudeClient) doRequest(req apiRequest) (*apiResponse, error) {
	logger.Log.Info("AI API request", "model", req.Model, "url", c.baseURL, "messages", len(req.Messages))

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodPost, c.baseURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", c.apiKey)
	httpReq.Header.Set("anthropic-version", anthropicVersion)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		logger.Log.Error("AI API http error", "error", err)
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		logger.Log.Error("AI API error", "status", resp.StatusCode, "body", string(respBody))
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	logger.Log.Info("AI API response", "status", resp.StatusCode, "bodyLen", len(respBody))

	var apiResp apiResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	return &apiResp, nil
}

func (c *ClaudeClient) extractText(resp *apiResponse) string {
	var result string
	for _, block := range resp.Content {
		if block.Type == "text" {
			result += block.Text
		}
	}
	return result
}

// ---------- public methods ----------

// Chat sends a conversation to Claude and returns the text reply and any tool calls.
func (c *ClaudeClient) Chat(messages []ChatMessage, taskContext string) (string, []ToolCall, error) {
	systemPrompt := "你是 TaskPilot AI 助手，帮助用户管理项目和任务。用户的任务数据会作为上下文提供。你可以使用工具来创建、更新、查询、删除任务。请用中文回复。"
	if taskContext != "" {
		systemPrompt += "\n\n当前任务数据（JSON格式）：\n" + taskContext
	}

	apiMsgs := make([]apiMessage, len(messages))
	for i, m := range messages {
		apiMsgs[i] = apiMessage{Role: m.Role, Content: m.Content}
	}

	req := apiRequest{
		Model:     c.model,
		MaxTokens: 4096,
		System:    systemPrompt,
		Messages:  apiMsgs,
		Tools:     chatTools(),
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", nil, err
	}

	var textContent string
	var toolCalls []ToolCall

	for _, block := range resp.Content {
		switch block.Type {
		case "text":
			textContent += block.Text
		case "tool_use":
			var input map[string]interface{}
			if len(block.Input) > 0 {
				if err := json.Unmarshal(block.Input, &input); err != nil {
					return "", nil, fmt.Errorf("unmarshal tool input: %w", err)
				}
			}
			toolCalls = append(toolCalls, ToolCall{
				Name:  block.Name,
				Input: input,
			})
		}
	}

	return textContent, toolCalls, nil
}

// GenerateDailySummary generates a Markdown daily summary from a list of tasks.
func (c *ClaudeClient) GenerateDailySummary(tasks []map[string]interface{}) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	userContent := "请根据以下任务数据生成一份简洁的每日工作摘要。包括：已完成的工作、进行中的工作、待处理的紧急事项。用中文回复，格式清晰。\n\n任务数据：\n" + string(taskJSON)

	req := apiRequest{
		Model:     c.model,
		MaxTokens: 2048,
		Messages: []apiMessage{
			{Role: "user", Content: userContent},
		},
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}

	return c.extractText(resp), nil
}

// SmartSuggest analyzes existing tasks and suggests new tasks.
func (c *ClaudeClient) SmartSuggest(tasks []map[string]interface{}, projectName string) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	prompt := fmt.Sprintf(`基于以下项目「%s」的现有任务，分析项目进展并智能推荐 3-5 个可能需要添加的新任务。

对每个建议的任务，请提供：
- **标题**：简洁明确的任务标题
- **优先级**：P0-P3
- **理由**：为什么建议这个任务

请用中文回复，格式清晰。

现有任务数据：
%s`, projectName, string(taskJSON))

	req := apiRequest{
		Model:     c.model,
		MaxTokens: 2048,
		Messages:  []apiMessage{{Role: "user", Content: prompt}},
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}
	return c.extractText(resp), nil
}

// DecomposeTask breaks down a complex task into subtasks.
func (c *ClaudeClient) DecomposeTask(taskTitle, taskDescription string, contextTasks []map[string]interface{}) (string, error) {
	contextJSON, _ := json.MarshalIndent(contextTasks, "", "  ")

	prompt := fmt.Sprintf(`请将以下任务分解为可执行的子任务（3-7 个）。

**任务标题**：%s
**任务描述**：%s

每个子任务需要：
- **标题**：明确可执行的描述
- **优先级**：P0-P3
- **预估时间**：大致时间估算
- **依赖关系**：是否依赖其他子任务

请用中文回复。

项目现有任务上下文：
%s`, taskTitle, taskDescription, string(contextJSON))

	req := apiRequest{
		Model:     c.model,
		MaxTokens: 2048,
		Messages:  []apiMessage{{Role: "user", Content: prompt}},
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}
	return c.extractText(resp), nil
}

// PrioritizeTasks analyzes and suggests priority adjustments.
func (c *ClaudeClient) PrioritizeTasks(tasks []map[string]interface{}) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	prompt := fmt.Sprintf(`请分析以下任务列表，并给出优先级调整建议。

考虑因素：
1. 截止日期紧迫程度
2. 任务之间的依赖关系
3. 当前进行中任务的数量（建议同时进行不超过 3 个）
4. 优先处理阻塞其他任务的工作

对于每个需要调整的任务，说明：
- 当前优先级 → 建议优先级
- 调整理由

最后给出一个建议的任务执行顺序。请用中文回复。

任务数据：
%s`, string(taskJSON))

	req := apiRequest{
		Model:     c.model,
		MaxTokens: 2048,
		Messages:  []apiMessage{{Role: "user", Content: prompt}},
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}
	return c.extractText(resp), nil
}

// GenerateWeeklyReport generates a weekly progress report.
func (c *ClaudeClient) GenerateWeeklyReport(tasks []map[string]interface{}) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	prompt := fmt.Sprintf(`请根据以下任务数据生成一份周报。包括：

## 本周完成
列出已完成的任务及成果

## 进行中的工作
列出进行中的任务及当前状态

## 下周计划
根据待办任务和优先级，建议下周的工作重点

## 风险与阻塞
识别可能的风险和阻塞项

## 数据统计
- 完成率
- 各优先级任务分布
- 逾期任务数量

请用中文回复，格式专业简洁。

任务数据：
%s`, string(taskJSON))

	req := apiRequest{
		Model:     c.model,
		MaxTokens: 3000,
		Messages:  []apiMessage{{Role: "user", Content: prompt}},
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}
	return c.extractText(resp), nil
}

// TestConnection tests if the API configuration is working.
func (c *ClaudeClient) TestConnection() error {
	req := apiRequest{
		Model:     c.model,
		MaxTokens: 16,
		Messages: []apiMessage{
			{Role: "user", Content: "Hi"},
		},
	}
	_, err := c.doRequest(req)
	return err
}
