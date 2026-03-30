package transcribe

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"taskpilot/internal/logger"
)

// CloudTranscriber 云端转录引擎（兼容 OpenAI Whisper API）
type CloudTranscriber struct {
	apiURL string
	apiKey string
	client *http.Client
}

func NewCloudTranscriber(apiURL, apiKey string) *CloudTranscriber {
	if apiURL == "" {
		apiURL = "https://api.openai.com/v1/audio/transcriptions"
	}
	return &CloudTranscriber{
		apiURL: apiURL,
		apiKey: apiKey,
		client: &http.Client{Timeout: 10 * time.Minute},
	}
}

func (t *CloudTranscriber) Name() string {
	return "cloud"
}

func (t *CloudTranscriber) IsAvailable() bool {
	return t.apiKey != ""
}

func (t *CloudTranscriber) Transcribe(audioPath string, onProgress func(percent int)) (*Result, error) {
	if t.apiKey == "" {
		return nil, fmt.Errorf("云端转录 API Key 未配置")
	}

	if onProgress != nil {
		onProgress(10)
	}

	// 打开音频文件
	file, err := os.Open(audioPath)
	if err != nil {
		return nil, fmt.Errorf("open audio file: %w", err)
	}
	defer file.Close()

	// 构建 multipart 请求
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	part, err := writer.CreateFormFile("file", filepath.Base(audioPath))
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, fmt.Errorf("copy audio data: %w", err)
	}

	writer.WriteField("model", "whisper-1")
	writer.WriteField("response_format", "verbose_json")
	writer.WriteField("language", "zh")
	writer.WriteField("timestamp_granularities[]", "segment")
	writer.Close()

	if onProgress != nil {
		onProgress(30)
	}

	req, err := http.NewRequest("POST", t.apiURL, &buf)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+t.apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := t.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cloud transcribe request: %w", err)
	}
	defer resp.Body.Close()

	if onProgress != nil {
		onProgress(80)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("cloud API error: status=%d body=%s", resp.StatusCode, string(body))
	}

	var cloudResult struct {
		Text     string `json:"text"`
		Language string `json:"language"`
		Segments []struct {
			Start float64 `json:"start"`
			End   float64 `json:"end"`
			Text  string  `json:"text"`
		} `json:"segments"`
	}

	if err := json.Unmarshal(body, &cloudResult); err != nil {
		return nil, fmt.Errorf("parse cloud response: %w", err)
	}

	result := &Result{
		Text:     cloudResult.Text,
		Language: cloudResult.Language,
	}
	for _, seg := range cloudResult.Segments {
		result.Segments = append(result.Segments, Segment{
			StartTime: seg.Start,
			EndTime:   seg.End,
			Text:      seg.Text,
		})
	}

	if onProgress != nil {
		onProgress(100)
	}

	logger.Log.Info("cloud transcribe complete", "segments", len(result.Segments))
	return result, nil
}
