package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"

	"taskpilot/internal/ai"
	"taskpilot/internal/core"
	"taskpilot/internal/logger"
	"taskpilot/internal/model"
)

// RecordingState 录制状态
type RecordingState struct {
	MeetingID string `json:"meetingId"`
	Status    string `json:"status"` // idle, recording, paused
	Duration  int    `json:"duration"`
}

// MeetingService 会议录音服务
type MeetingService struct {
	Core      *core.AppCore
	AIService *AIService

	mu             sync.Mutex
	recordingState RecordingState
	stopRecording  chan struct{}
}

// ── Meeting CRUD ────────────────────────────────────────────────────────

func (s *MeetingService) GetMeetings() ([]model.Meeting, error) {
	return s.Core.MeetingStore.ListMeetings()
}

func (s *MeetingService) GetMeetingsByProject(projectID string) ([]model.Meeting, error) {
	return s.Core.MeetingStore.ListMeetingsByProject(projectID)
}

func (s *MeetingService) GetMeeting(id string) (*model.Meeting, error) {
	return s.Core.MeetingStore.GetMeetingByID(id)
}

func (s *MeetingService) CreateMeeting(title, projectID string) (*model.Meeting, error) {
	id := uuid.NewString()

	// 创建会议文件目录
	meetingDir := filepath.Join(s.Core.DataDir, "meetings", id)
	if err := os.MkdirAll(meetingDir, 0o755); err != nil {
		return nil, fmt.Errorf("create meeting dir: %w", err)
	}

	m := model.Meeting{
		ID:        id,
		ProjectID: projectID,
		Title:     title,
		Status:    "recording",
		AudioPath: filepath.Join(meetingDir, "audio.wav"),
	}
	if err := s.Core.MeetingStore.CreateMeeting(m); err != nil {
		return nil, err
	}

	s.emitChange()
	logger.Log.Info("meeting created", "id", id, "title", title)
	return &m, nil
}

func (s *MeetingService) UpdateMeeting(id, title, projectID string) error {
	m, err := s.Core.MeetingStore.GetMeetingByID(id)
	if err != nil {
		return err
	}
	if m == nil {
		return fmt.Errorf("meeting not found: %s", id)
	}
	m.Title = title
	m.ProjectID = projectID
	if err := s.Core.MeetingStore.UpdateMeeting(*m); err != nil {
		return err
	}
	s.emitChange()
	return nil
}

func (s *MeetingService) DeleteMeeting(id string) error {
	m, err := s.Core.MeetingStore.GetMeetingByID(id)
	if err != nil {
		return err
	}
	if m != nil {
		// 删除会议文件目录
		meetingDir := filepath.Join(s.Core.DataDir, "meetings", id)
		os.RemoveAll(meetingDir)
	}

	if err := s.Core.MeetingStore.DeleteMeeting(id); err != nil {
		return err
	}
	s.emitChange()
	return nil
}

// ── 录制控制 ────────────────────────────────────────────────────────────

func (s *MeetingService) StartRecording(title, projectID string) (*model.Meeting, error) {
	s.mu.Lock()
	if s.recordingState.Status == "recording" {
		s.mu.Unlock()
		return nil, fmt.Errorf("已有录制正在进行")
	}
	s.mu.Unlock()

	m, err := s.CreateMeeting(title, projectID)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.recordingState = RecordingState{
		MeetingID: m.ID,
		Status:    "recording",
		Duration:  0,
	}
	s.stopRecording = make(chan struct{})
	s.mu.Unlock()

	// 启动音频采集（将在音频采集模块中实现）
	go s.recordAudio(m)

	s.emitRecordingStatus("recording")
	return m, nil
}

func (s *MeetingService) StopRecording() (*model.Meeting, error) {
	s.mu.Lock()
	if s.recordingState.Status != "recording" && s.recordingState.Status != "paused" {
		s.mu.Unlock()
		return nil, fmt.Errorf("当前没有录制")
	}

	meetingID := s.recordingState.MeetingID
	if s.stopRecording != nil {
		close(s.stopRecording)
		s.stopRecording = nil
	}
	s.recordingState.Status = "idle"
	s.mu.Unlock()

	m, err := s.Core.MeetingStore.GetMeetingByID(meetingID)
	if err != nil {
		return nil, err
	}
	if m != nil {
		m.Status = "transcribing"
		s.Core.MeetingStore.UpdateMeeting(*m)
	}

	s.emitRecordingStatus("idle")
	s.emitChange()
	return m, nil
}

func (s *MeetingService) GetRecordingState() RecordingState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.recordingState
}

// recordAudio 音频采集占位（将在音频采集模块实现实际逻辑）
func (s *MeetingService) recordAudio(m *model.Meeting) {
	logger.Log.Info("audio recording started (placeholder)", "meetingID", m.ID)
	// 实际的音频采集将在 internal/audio 模块中实现
	// 这里等待停止信号
	s.mu.Lock()
	stopCh := s.stopRecording
	s.mu.Unlock()

	if stopCh != nil {
		<-stopCh
	}
	logger.Log.Info("audio recording stopped", "meetingID", m.ID)
}

// ── Speaker 管理 ────────────────────────────────────────────────────────

func (s *MeetingService) GetSpeakers(meetingID string) ([]model.MeetingSpeaker, error) {
	return s.Core.MeetingStore.ListSpeakers(meetingID)
}

func (s *MeetingService) RenameSpeaker(speakerID, displayName string) error {
	return s.Core.MeetingStore.UpdateSpeaker(model.MeetingSpeaker{
		ID:          speakerID,
		DisplayName: displayName,
	})
}

func (s *MeetingService) MergeSpeakers(toID, fromID string) error {
	return s.Core.MeetingStore.MergeSpeakers(toID, fromID)
}

// ── 转录片段 ────────────────────────────────────────────────────────────

func (s *MeetingService) GetSegments(meetingID string) ([]model.TranscriptSegment, error) {
	return s.Core.MeetingStore.ListSegments(meetingID)
}

// ── AI 分析 ────────────────────────────────────────────────────────────

// AnalyzeMeeting 对会议进行 AI 分析
func (s *MeetingService) AnalyzeMeeting(meetingID string) (*ai.MeetingAnalysis, error) {
	if s.AIService == nil || s.AIService.GetAIClient() == nil {
		return nil, fmt.Errorf("AI 未配置")
	}

	m, err := s.Core.MeetingStore.GetMeetingByID(meetingID)
	if err != nil || m == nil {
		return nil, fmt.Errorf("meeting not found: %s", meetingID)
	}

	// 更新状态
	m.Status = "analyzing"
	s.Core.MeetingStore.UpdateMeeting(*m)
	s.emitChange()

	if app := application.Get(); app != nil {
		app.Event.Emit("meeting:analyze:start", map[string]string{"meetingId": meetingID})
	}

	// 获取转录文本
	segments, err := s.Core.MeetingStore.ListSegments(meetingID)
	if err != nil {
		return nil, err
	}

	speakers, _ := s.Core.MeetingStore.ListSpeakers(meetingID)
	speakerMap := make(map[string]string)
	var speakerNames []string
	for _, sp := range speakers {
		name := sp.DisplayName
		if name == "" {
			name = sp.SpeakerLabel
		}
		speakerMap[sp.ID] = name
		speakerNames = append(speakerNames, name)
	}

	// 构建转录文本
	var transcriptBuilder strings.Builder
	for _, seg := range segments {
		speaker := speakerMap[seg.SpeakerID]
		if speaker == "" {
			speaker = "Unknown"
		}
		fmt.Fprintf(&transcriptBuilder, "[%s] %s: %s\n", formatSeconds(seg.StartTime), speaker, seg.Text)
	}
	transcript := transcriptBuilder.String()

	// AI 分析
	analysis, err := s.AIService.GetAIClient().AnalyzeMeeting(transcript, speakerNames)
	if err != nil {
		m.Status = "error"
		s.Core.MeetingStore.UpdateMeeting(*m)
		s.emitChange()
		return nil, err
	}

	// 保存总结
	m.Summary = analysis.Summary
	m.Status = "done"
	s.Core.MeetingStore.UpdateMeeting(*m)

	// 保存总结到文件
	meetingDir := filepath.Join(s.Core.DataDir, "meetings", meetingID)
	summaryJSON, _ := json.MarshalIndent(analysis, "", "  ")
	os.WriteFile(filepath.Join(meetingDir, "summary.json"), summaryJSON, 0o644)

	if app := application.Get(); app != nil {
		app.Event.Emit("meeting:analyze:done", map[string]string{"meetingId": meetingID})
	}
	s.emitChange()

	logger.Log.Info("meeting analysis done", "meetingID", meetingID)
	return analysis, nil
}

// GetMeetingAnalysis 获取已有的分析结果
func (s *MeetingService) GetMeetingAnalysis(meetingID string) (*ai.MeetingAnalysis, error) {
	meetingDir := filepath.Join(s.Core.DataDir, "meetings", meetingID)
	data, err := os.ReadFile(filepath.Join(meetingDir, "summary.json"))
	if err != nil {
		return nil, fmt.Errorf("分析结果不存在，请先执行 AI 分析")
	}
	var analysis ai.MeetingAnalysis
	if err := json.Unmarshal(data, &analysis); err != nil {
		return nil, err
	}
	return &analysis, nil
}

// DecomposeMeetingTasks 从会议分解任务
func (s *MeetingService) DecomposeMeetingTasks(meetingID string) ([]ai.SuggestedTask, error) {
	if s.AIService == nil || s.AIService.GetAIClient() == nil {
		return nil, fmt.Errorf("AI 未配置")
	}

	m, err := s.Core.MeetingStore.GetMeetingByID(meetingID)
	if err != nil || m == nil {
		return nil, fmt.Errorf("meeting not found")
	}

	segments, _ := s.Core.MeetingStore.ListSegments(meetingID)
	speakers, _ := s.Core.MeetingStore.ListSpeakers(meetingID)

	speakerMap := make(map[string]string)
	var speakerNames []string
	for _, sp := range speakers {
		name := sp.DisplayName
		if name == "" {
			name = sp.SpeakerLabel
		}
		speakerMap[sp.ID] = name
		speakerNames = append(speakerNames, name)
	}

	var transcriptBuilder strings.Builder
	for _, seg := range segments {
		speaker := speakerMap[seg.SpeakerID]
		if speaker == "" {
			speaker = "Unknown"
		}
		fmt.Fprintf(&transcriptBuilder, "[%s] %s: %s\n", formatSeconds(seg.StartTime), speaker, seg.Text)
	}

	return s.AIService.GetAIClient().DecomposeMeetingTasks(m.Summary, transcriptBuilder.String(), speakerNames)
}

// CreateTasksFromMeeting 从会议建议批量创建任务
func (s *MeetingService) CreateTasksFromMeeting(meetingID string, tasks []ai.SuggestedTask) error {
	m, err := s.Core.MeetingStore.GetMeetingByID(meetingID)
	if err != nil || m == nil {
		return fmt.Errorf("meeting not found")
	}

	for _, t := range tasks {
		task := model.Task{
			ID:          uuid.NewString(),
			ProjectID:   m.ProjectID,
			Title:       t.Title,
			Description: t.Description,
			Priority:    t.Priority,
			DueDate:     t.DueDate,
			Status:      "todo",
			Tags:        strings.Join(t.Tags, ","),
		}
		if err := s.Core.TaskStore.Create(task); err != nil {
			logger.Log.Error("create task from meeting failed", "title", t.Title, "error", err)
			continue
		}
	}

	if app := application.Get(); app != nil {
		app.Event.Emit("task:changed", nil)
	}

	logger.Log.Info("created tasks from meeting", "meetingID", meetingID, "count", len(tasks))
	return nil
}

func formatSeconds(seconds float64) string {
	m := int(seconds) / 60
	s := int(seconds) % 60
	return fmt.Sprintf("%02d:%02d", m, s)
}

// ── 事件 ────────────────────────────────────────────────────────────────

func (s *MeetingService) emitChange() {
	if app := application.Get(); app != nil {
		app.Event.Emit("meeting:changed", nil)
	}
}

func (s *MeetingService) emitRecordingStatus(status string) {
	if app := application.Get(); app != nil {
		app.Event.Emit("meeting:recording:status", map[string]string{"status": status})
	}
}
