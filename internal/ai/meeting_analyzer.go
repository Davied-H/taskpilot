package ai

import (
	"encoding/json"
	"fmt"
)

// MeetingAnalysis 会议分析结果
type MeetingAnalysis struct {
	Summary      string          `json:"summary"`
	KeyPoints    []string        `json:"keyPoints"`
	PendingItems []string        `json:"pendingItems"`
	ActionItems  []string        `json:"actionItems"`
	Tasks        []SuggestedTask `json:"tasks"`
}

// SuggestedTask AI 建议的任务
type SuggestedTask struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Priority    int      `json:"priority"`
	Assignee    string   `json:"assignee"`
	DueDate     string   `json:"dueDate"`
	Tags        []string `json:"tags"`
}

const meetingSummaryPrompt = `你是一个专业的会议纪要助手。请分析以下会议转录文本，生成结构化总结。

## 输入
会议转录文本（含说话人标识和时间戳）：
%s

参会人列表：%s

## 要求
请返回 JSON 格式的分析结果：
{
  "summary": "会议总结（200字以内）",
  "keyPoints": ["关键结论1", "关键结论2", ...],
  "pendingItems": ["待决事项1", "待决事项2", ...],
  "actionItems": ["行动要点1（含责任人和时间）", ...]
}

只返回 JSON，不要其他内容。`

const taskDecomposePrompt = `基于以下会议总结和转录内容，分解出具体可执行的任务。

## 会议总结
%s

## 转录内容
%s

## 参会人
%s

## 要求
请返回 JSON 数组格式的任务列表：
[{
  "title": "任务标题（简短明确）",
  "description": "任务描述（包含上下文信息）",
  "priority": 0-3 的整数（0=紧急 1=高 2=中 3=低）,
  "assignee": "责任人（从参会人中匹配）",
  "dueDate": "截止日期（YYYY-MM-DD 格式，从上下文推断，不确定则留空）",
  "tags": ["标签1", "标签2"]
}]

只返回 JSON 数组，不要其他内容。`

// AnalyzeMeeting 分析会议内容，生成总结
func (c *ClaudeClient) AnalyzeMeeting(transcript string, speakers []string) (*MeetingAnalysis, error) {
	speakersStr := "无参会人信息"
	if len(speakers) > 0 {
		b, _ := json.Marshal(speakers)
		speakersStr = string(b)
	}

	prompt := fmt.Sprintf(meetingSummaryPrompt, transcript, speakersStr)
	result, err := c.simpleRequest("你是一个会议分析助手，善于从对话中提取关键信息。", prompt, 4096)
	if err != nil {
		return nil, fmt.Errorf("meeting analysis failed: %w", err)
	}

	var analysis MeetingAnalysis
	if err := json.Unmarshal([]byte(result), &analysis); err != nil {
		// 尝试从 markdown 代码块中提取 JSON
		cleaned := extractJSON(result)
		if err2 := json.Unmarshal([]byte(cleaned), &analysis); err2 != nil {
			return nil, fmt.Errorf("parse analysis result: %w (raw: %s)", err, result)
		}
	}

	return &analysis, nil
}

// DecomposeMeetingTasks 从会议内容分解任务
func (c *ClaudeClient) DecomposeMeetingTasks(summary, transcript string, speakers []string) ([]SuggestedTask, error) {
	speakersStr := "无参会人信息"
	if len(speakers) > 0 {
		b, _ := json.Marshal(speakers)
		speakersStr = string(b)
	}

	prompt := fmt.Sprintf(taskDecomposePrompt, summary, truncate(transcript, 3000), speakersStr)
	result, err := c.simpleRequest("你是一个任务管理专家，善于从会议内容中提取可执行的任务。", prompt, 4096)
	if err != nil {
		return nil, fmt.Errorf("task decompose failed: %w", err)
	}

	var tasks []SuggestedTask
	if err := json.Unmarshal([]byte(result), &tasks); err != nil {
		cleaned := extractJSON(result)
		if err2 := json.Unmarshal([]byte(cleaned), &tasks); err2 != nil {
			return nil, fmt.Errorf("parse tasks result: %w (raw: %s)", err, result)
		}
	}

	return tasks, nil
}

func extractJSON(s string) string {
	// 尝试提取 ```json ... ``` 中的内容
	start := -1
	for i := 0; i < len(s)-2; i++ {
		if s[i] == '{' || s[i] == '[' {
			start = i
			break
		}
	}
	if start < 0 {
		return s
	}
	end := -1
	for i := len(s) - 1; i > start; i-- {
		if s[i] == '}' || s[i] == ']' {
			end = i + 1
			break
		}
	}
	if end < 0 {
		return s
	}
	return s[start:end]
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
