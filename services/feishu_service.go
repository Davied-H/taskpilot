package services

import (
	"fmt"
	"sync"
	"time"

	"taskpilot/internal/core"
	"taskpilot/internal/feishu"
	"taskpilot/internal/logger"
	"taskpilot/internal/model"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// FeishuConfig 飞书配置
type FeishuConfig struct {
	AppID         string `json:"appId"`
	AppSecret     string `json:"appSecret"`
	BitableApp    string `json:"bitableApp"`
	BitableTable  string `json:"bitableTable"`
	SyncEnabled   bool   `json:"syncEnabled"`
	SyncInterval  int    `json:"syncInterval"` // 分钟
}

// SyncStatus 同步状态
type SyncStatus struct {
	Running       bool   `json:"running"`
	LastSyncAt    string `json:"lastSyncAt"`
	LastError     string `json:"lastError"`
	SyncedCount   int    `json:"syncedCount"`
	PushedCount   int    `json:"pushedCount"`
	PulledCount   int    `json:"pulledCount"`
}

// BotConfig 飞书 Bot 配置
type BotConfig struct {
	BotEnabled bool   `json:"botEnabled"`
	BotChatID  string `json:"botChatId"`
	NotifyOnChange bool `json:"notifyOnChange"`
}

// FeishuService 飞书集成服务
type FeishuService struct {
	Core      *core.AppCore
	AIService *AIService

	mu       sync.Mutex
	client   *feishu.Client
	syncStop chan struct{}
	status   SyncStatus
}

// GetFeishuConfig 获取飞书配置
func (s *FeishuService) GetFeishuConfig() (*FeishuConfig, error) {
	cfg := &FeishuConfig{SyncInterval: 5}
	var err error

	if cfg.AppID, err = s.Core.ConfigStore.Get("feishu_app_id"); err != nil {
		return nil, err
	}
	if cfg.AppSecret, err = s.Core.ConfigStore.Get("feishu_app_secret"); err != nil {
		return nil, err
	}
	if cfg.BitableApp, err = s.Core.ConfigStore.Get("feishu_bitable_app_token"); err != nil {
		return nil, err
	}
	if cfg.BitableTable, err = s.Core.ConfigStore.Get("feishu_bitable_table_id"); err != nil {
		return nil, err
	}
	enabledStr, _ := s.Core.ConfigStore.Get("feishu_sync_enabled")
	cfg.SyncEnabled = enabledStr == "true"
	intervalStr, _ := s.Core.ConfigStore.Get("feishu_sync_interval")
	if intervalStr != "" {
		fmt.Sscanf(intervalStr, "%d", &cfg.SyncInterval)
	}
	if cfg.SyncInterval <= 0 {
		cfg.SyncInterval = 5
	}

	return cfg, nil
}

// SaveFeishuConfig 保存飞书配置并重新初始化客户端
func (s *FeishuService) SaveFeishuConfig(cfg FeishuConfig) error {
	pairs := map[string]string{
		"feishu_app_id":            cfg.AppID,
		"feishu_app_secret":        cfg.AppSecret,
		"feishu_bitable_app_token": cfg.BitableApp,
		"feishu_bitable_table_id":  cfg.BitableTable,
		"feishu_sync_enabled":      fmt.Sprintf("%v", cfg.SyncEnabled),
		"feishu_sync_interval":     fmt.Sprintf("%d", cfg.SyncInterval),
	}
	for k, v := range pairs {
		if err := s.Core.ConfigStore.Set(k, v); err != nil {
			return fmt.Errorf("save config %s: %w", k, err)
		}
	}

	// 重新初始化客户端
	if cfg.AppID != "" && cfg.AppSecret != "" {
		s.mu.Lock()
		s.client = feishu.NewClient(cfg.AppID, cfg.AppSecret)
		s.mu.Unlock()
	}

	logger.Log.Info("feishu config saved")
	return nil
}

// TestConnection 测试飞书连接
func (s *FeishuService) TestConnection() error {
	cfg, err := s.GetFeishuConfig()
	if err != nil {
		return err
	}
	if cfg.AppID == "" || cfg.AppSecret == "" {
		return fmt.Errorf("请先配置 App ID 和 App Secret")
	}

	client := feishu.NewClient(cfg.AppID, cfg.AppSecret)
	if err := client.TestConnection(); err != nil {
		return fmt.Errorf("连接失败: %w", err)
	}

	s.mu.Lock()
	s.client = client
	s.mu.Unlock()

	return nil
}

// GetSyncStatus 获取同步状态
func (s *FeishuService) GetSyncStatus() SyncStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.status
}

// StartSync 启动后台定时同步
func (s *FeishuService) StartSync() error {
	s.mu.Lock()
	if s.syncStop != nil {
		s.mu.Unlock()
		return fmt.Errorf("同步已在运行")
	}

	cfg, err := s.GetFeishuConfig()
	if err != nil {
		s.mu.Unlock()
		return err
	}
	if cfg.AppID == "" || cfg.AppSecret == "" {
		s.mu.Unlock()
		return fmt.Errorf("请先配置飞书凭据")
	}

	if s.client == nil {
		s.client = feishu.NewClient(cfg.AppID, cfg.AppSecret)
	}

	s.syncStop = make(chan struct{})
	s.status.Running = true
	s.mu.Unlock()

	interval := time.Duration(cfg.SyncInterval) * time.Minute
	if interval < time.Minute {
		interval = 5 * time.Minute
	}

	go func() {
		// 立即执行一次
		s.doSync()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				s.doSync()
			case <-s.syncStop:
				logger.Log.Info("feishu sync stopped")
				return
			}
		}
	}()

	logger.Log.Info("feishu sync started", "interval", interval)
	return nil
}

// StopSync 停止同步
func (s *FeishuService) StopSync() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.syncStop != nil {
		close(s.syncStop)
		s.syncStop = nil
		s.status.Running = false
	}
}

// SyncNow 立即执行一次同步
func (s *FeishuService) SyncNow() error {
	s.mu.Lock()
	if s.client == nil {
		cfg, err := s.GetFeishuConfig()
		if err != nil {
			s.mu.Unlock()
			return err
		}
		if cfg.AppID == "" || cfg.AppSecret == "" {
			s.mu.Unlock()
			return fmt.Errorf("请先配置飞书凭据")
		}
		s.client = feishu.NewClient(cfg.AppID, cfg.AppSecret)
	}
	s.mu.Unlock()

	return s.doSync()
}

// AutoStart 根据配置自动启动同步
func (s *FeishuService) AutoStart() {
	cfg, err := s.GetFeishuConfig()
	if err != nil {
		return
	}
	if cfg.SyncEnabled && cfg.AppID != "" && cfg.AppSecret != "" {
		if err := s.StartSync(); err != nil {
			logger.Log.Error("feishu auto start failed", "error", err)
		}
	}
}

// doSync 执行一次完整的双向同步
func (s *FeishuService) doSync() error {
	s.mu.Lock()
	client := s.client
	s.mu.Unlock()

	if client == nil {
		return fmt.Errorf("client not initialized")
	}

	cfg, err := s.GetFeishuConfig()
	if err != nil {
		s.setError(err)
		return err
	}
	if cfg.BitableApp == "" || cfg.BitableTable == "" {
		err := fmt.Errorf("未配置多维表格信息")
		s.setError(err)
		return err
	}

	logger.Log.Info("feishu sync cycle start")

	// 1. 拉取本地数据
	localTasks, err := s.Core.TaskStore.ListAll()
	if err != nil {
		s.setError(err)
		return err
	}
	allMappings, err := s.Core.SyncStore.ListAll()
	if err != nil {
		s.setError(err)
		return err
	}

	// 2. 拉取远程记录
	remoteRecords, err := client.ListAllRecords(cfg.BitableApp, cfg.BitableTable)
	if err != nil {
		s.setError(err)
		return err
	}

	// 建立索引
	localTaskMap := make(map[string]model.Task)
	for _, t := range localTasks {
		localTaskMap[t.ID] = t
	}

	mappingByLocal := make(map[string]model.SyncMapping)
	mappingByRecord := make(map[string]model.SyncMapping)
	for _, m := range allMappings {
		mappingByLocal[m.LocalTaskID] = m
		mappingByRecord[m.BitableRecordID] = m
	}

	remoteByID := make(map[string]feishu.BitableRecord)
	for _, r := range remoteRecords {
		remoteByID[r.RecordID] = r
	}

	// 获取项目名称映射
	projects, _ := s.Core.ProjectStore.List()
	projectNameMap := make(map[string]string)
	for _, p := range projects {
		projectNameMap[p.ID] = p.Name
	}

	var pushed, pulled int

	// 3. 遍历本地任务
	for _, task := range localTasks {
		mapping, hasMapped := mappingByLocal[task.ID]
		if hasMapped {
			// 已有映射 — 比较变更
			remote, remoteExists := remoteByID[mapping.BitableRecordID]
			if !remoteExists {
				// 远程已删除 → 删除本地
				logger.Log.Info("feishu sync: remote deleted, removing local", "taskID", task.ID)
				s.Core.TaskStore.Delete(task.ID)
				s.Core.SyncStore.Delete(mapping.ID)
				continue
			}
			delete(remoteByID, mapping.BitableRecordID) // 标记已处理

			localUpdated := task.UpdatedAt
			syncedAt := mapping.LastSyncedAt

			if localUpdated > syncedAt {
				// 本地有变更 → push
				fields := feishu.TaskToRecordFields(task, projectNameMap[task.ProjectID])
				if err := client.UpdateRecord(cfg.BitableApp, cfg.BitableTable, mapping.BitableRecordID, fields); err != nil {
					logger.Log.Error("feishu sync: push failed", "taskID", task.ID, "error", err)
					continue
				}
				mapping.LastSyncedAt = time.Now().Format(time.RFC3339)
				s.Core.SyncStore.Update(mapping)
				pushed++
			} else {
				// 检查远程是否变更 — 直接 pull（last-write-wins 简化处理）
				remoteTask := feishu.RecordFieldsToTask(remote.Fields)
				if remoteTask.Title != task.Title || remoteTask.Status != task.Status ||
					remoteTask.Priority != task.Priority || remoteTask.Description != task.Description {
					task.Title = remoteTask.Title
					task.Status = remoteTask.Status
					task.Priority = remoteTask.Priority
					task.Description = remoteTask.Description
					if remoteTask.DueDate != "" {
						task.DueDate = remoteTask.DueDate
					}
					if remoteTask.Tags != "" {
						task.Tags = remoteTask.Tags
					}
					s.Core.TaskStore.Update(task)
					mapping.LastSyncedAt = time.Now().Format(time.RFC3339)
					s.Core.SyncStore.Update(mapping)
					pulled++
				}
			}
		} else {
			// 无映射 — 本地新建，push 到 Bitable
			fields := feishu.TaskToRecordFields(task, projectNameMap[task.ProjectID])
			recordID, err := client.CreateRecord(cfg.BitableApp, cfg.BitableTable, fields)
			if err != nil {
				logger.Log.Error("feishu sync: push new failed", "taskID", task.ID, "error", err)
				continue
			}
			s.Core.SyncStore.Create(model.SyncMapping{
				ID:              uuid.NewString(),
				LocalTaskID:     task.ID,
				BitableRecordID: recordID,
				BitableAppToken: cfg.BitableApp,
				BitableTableID:  cfg.BitableTable,
			})
			pushed++
		}
	}

	// 4. 遍历未处理的远程记录（远程新建，pull 到本地）
	for recordID, record := range remoteByID {
		if _, mapped := mappingByRecord[recordID]; mapped {
			continue
		}
		remoteTask := feishu.RecordFieldsToTask(record.Fields)
		if remoteTask.Title == "" {
			continue
		}
		remoteTask.ID = uuid.NewString()
		if err := s.Core.TaskStore.Create(remoteTask); err != nil {
			logger.Log.Error("feishu sync: pull new failed", "recordID", recordID, "error", err)
			continue
		}
		s.Core.SyncStore.Create(model.SyncMapping{
			ID:              uuid.NewString(),
			LocalTaskID:     remoteTask.ID,
			BitableRecordID: recordID,
			BitableAppToken: cfg.BitableApp,
			BitableTableID:  cfg.BitableTable,
		})
		pulled++
	}

	// 5. 处理映射存在但本地已删除的情况
	for _, mapping := range allMappings {
		if _, exists := localTaskMap[mapping.LocalTaskID]; !exists {
			// 本地已删除 → 删除远程
			logger.Log.Info("feishu sync: local deleted, removing remote", "recordID", mapping.BitableRecordID)
			client.DeleteRecord(cfg.BitableApp, cfg.BitableTable, mapping.BitableRecordID)
			s.Core.SyncStore.Delete(mapping.ID)
		}
	}

	// 更新状态
	s.mu.Lock()
	s.status.LastSyncAt = time.Now().Format(time.RFC3339)
	s.status.LastError = ""
	s.status.PushedCount = pushed
	s.status.PulledCount = pulled
	mappings, _ := s.Core.SyncStore.ListAll()
	s.status.SyncedCount = len(mappings)
	s.mu.Unlock()

	// 发射事件刷新 UI
	if app := application.Get(); app != nil {
		app.Event.Emit("task:changed", nil)
	}

	logger.Log.Info("feishu sync cycle done", "pushed", pushed, "pulled", pulled)
	return nil
}

func (s *FeishuService) setError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status.LastError = err.Error()
	s.status.LastSyncAt = time.Now().Format(time.RFC3339)
}

// ── Bot 功能 ────────────────────────────────────────────────────────────

// GetBotConfig 获取 Bot 配置
func (s *FeishuService) GetBotConfig() (*BotConfig, error) {
	cfg := &BotConfig{}
	enabledStr, _ := s.Core.ConfigStore.Get("feishu_bot_enabled")
	cfg.BotEnabled = enabledStr == "true"
	cfg.BotChatID, _ = s.Core.ConfigStore.Get("feishu_bot_chat_id")
	notifyStr, _ := s.Core.ConfigStore.Get("feishu_bot_notify_on_change")
	cfg.NotifyOnChange = notifyStr == "true"
	return cfg, nil
}

// SaveBotConfig 保存 Bot 配置
func (s *FeishuService) SaveBotConfig(cfg BotConfig) error {
	pairs := map[string]string{
		"feishu_bot_enabled":          fmt.Sprintf("%v", cfg.BotEnabled),
		"feishu_bot_chat_id":          cfg.BotChatID,
		"feishu_bot_notify_on_change": fmt.Sprintf("%v", cfg.NotifyOnChange),
	}
	for k, v := range pairs {
		if err := s.Core.ConfigStore.Set(k, v); err != nil {
			return fmt.Errorf("save bot config %s: %w", k, err)
		}
	}
	return nil
}

// SendBotMessage 通过 Bot 发送消息到配置的群
func (s *FeishuService) SendBotMessage(text string) error {
	s.mu.Lock()
	client := s.client
	s.mu.Unlock()

	if client == nil {
		return fmt.Errorf("飞书客户端未初始化")
	}

	botCfg, err := s.GetBotConfig()
	if err != nil {
		return err
	}
	if botCfg.BotChatID == "" {
		return fmt.Errorf("未配置 Bot 目标群 Chat ID")
	}

	return client.SendTextMessage(botCfg.BotChatID, text)
}

// HandleBotMessage 处理 Bot 收到的消息（路由到 AI）
func (s *FeishuService) HandleBotMessage(chatID, userMessage string) error {
	if s.AIService == nil {
		return fmt.Errorf("AI service not available")
	}

	s.mu.Lock()
	client := s.client
	s.mu.Unlock()

	if client == nil {
		return fmt.Errorf("飞书客户端未初始化")
	}

	// 调用 AI 对话（同步模式，复用 tool-call 能力）
	resp, err := s.AIService.ChatWithAI(userMessage)
	if err != nil {
		replyText := fmt.Sprintf("AI 处理失败: %v", err)
		client.SendTextMessage(chatID, replyText)
		return err
	}

	// 构建回复
	reply := resp.Text
	if len(resp.ToolCalls) > 0 {
		reply += "\n\n---\n"
		for _, tc := range resp.ToolCalls {
			icon := "✅"
			if !tc.Success {
				icon = "❌"
			}
			reply += fmt.Sprintf("%s %s: %s\n", icon, tc.Action, tc.Message)
		}
	}

	return client.SendTextMessage(chatID, reply)
}

// NotifyTaskChanged 任务变更通知（发送卡片到配置的群）
func (s *FeishuService) NotifyTaskChanged(taskTitle, status, action string) {
	botCfg, err := s.GetBotConfig()
	if err != nil || !botCfg.BotEnabled || !botCfg.NotifyOnChange || botCfg.BotChatID == "" {
		return
	}

	s.mu.Lock()
	client := s.client
	s.mu.Unlock()
	if client == nil {
		return
	}

	actionText := map[string]string{
		"create": "创建了新任务",
		"update": "更新了任务",
		"delete": "删除了任务",
	}
	text := fmt.Sprintf("📋 TaskPilot: %s「%s」", actionText[action], taskTitle)
	if status != "" {
		text += fmt.Sprintf(" (状态: %s)", status)
	}

	if err := client.SendTextMessage(botCfg.BotChatID, text); err != nil {
		logger.Log.Error("feishu bot notify failed", "error", err)
	}
}
