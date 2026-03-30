package model

// Meeting 会议
type Meeting struct {
	ID             string `json:"id"`
	ProjectID      string `json:"projectId"`
	Title          string `json:"title"`
	Status         string `json:"status"` // recording, transcribing, diarizing, analyzing, done, error
	AudioPath      string `json:"audioPath"`
	TranscriptPath string `json:"transcriptPath"`
	Summary        string `json:"summary"`
	Duration       int    `json:"duration"` // 录制时长（秒）
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// MeetingSpeaker 说话人
type MeetingSpeaker struct {
	ID           string `json:"id"`
	MeetingID    string `json:"meetingId"`
	SpeakerLabel string `json:"speakerLabel"` // 自动编号 "Speaker 1"
	DisplayName  string `json:"displayName"`  // 用户命名 "张明"
	Color        string `json:"color"`        // UI 标识色 "#60a5fa"
}

// TranscriptSegment 转录片段
type TranscriptSegment struct {
	ID        string  `json:"id"`
	MeetingID string  `json:"meetingId"`
	SpeakerID string  `json:"speakerId"`
	StartTime float64 `json:"startTime"` // 秒
	EndTime   float64 `json:"endTime"`   // 秒
	Text      string  `json:"text"`
}

// SuggestedTask AI 建议的任务
type SuggestedTask struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Priority    int      `json:"priority"`
	Assignee    string   `json:"assignee"`
	DueDate     string   `json:"dueDate"`
	Tags        []string `json:"tags"`
	Selected    bool     `json:"selected"`
}
