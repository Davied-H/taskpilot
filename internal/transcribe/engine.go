package transcribe

// Segment 转录片段
type Segment struct {
	StartTime float64 `json:"start"`
	EndTime   float64 `json:"end"`
	Text      string  `json:"text"`
}

// Result 转录结果
type Result struct {
	Text     string    `json:"text"`
	Segments []Segment `json:"segments"`
	Language string    `json:"language"`
}

// Transcriber 转录引擎接口
type Transcriber interface {
	// Transcribe 对音频文件进行转录
	Transcribe(audioPath string, onProgress func(percent int)) (*Result, error)
	// IsAvailable 检查引擎是否可用
	IsAvailable() bool
	// Name 引擎名称
	Name() string
}

// NewTranscriber 根据配置创建转录引擎
// engine: "whisper" (本地) 或 "cloud" (云端)
func NewTranscriber(engine, modelSize, apiURL, apiKey string) Transcriber {
	switch engine {
	case "cloud":
		return NewCloudTranscriber(apiURL, apiKey)
	default:
		return NewWhisperTranscriber(modelSize)
	}
}
