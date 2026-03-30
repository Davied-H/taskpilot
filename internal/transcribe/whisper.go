package transcribe

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"taskpilot/internal/logger"
)

// WhisperTranscriber 使用 whisper.cpp CLI 或 OpenAI Whisper Python 进行本地转录
type WhisperTranscriber struct {
	modelSize string // tiny, base, small, medium, large
}

func NewWhisperTranscriber(modelSize string) *WhisperTranscriber {
	if modelSize == "" {
		modelSize = "base"
	}
	return &WhisperTranscriber{modelSize: modelSize}
}

func (t *WhisperTranscriber) Name() string {
	return "whisper-local"
}

func (t *WhisperTranscriber) IsAvailable() bool {
	// 检查 whisper CLI 是否可用
	if _, err := exec.LookPath("whisper"); err == nil {
		return true
	}
	// 检查 whisper-cpp 的 main 可执行文件
	if _, err := exec.LookPath("whisper-cpp"); err == nil {
		return true
	}
	return false
}

func (t *WhisperTranscriber) Transcribe(audioPath string, onProgress func(percent int)) (*Result, error) {
	if onProgress != nil {
		onProgress(0)
	}

	// 优先尝试 Python whisper CLI
	if whisperPath, err := exec.LookPath("whisper"); err == nil {
		return t.transcribeWithPythonWhisper(whisperPath, audioPath, onProgress)
	}

	// 尝试 whisper-cpp
	if cppPath, err := exec.LookPath("whisper-cpp"); err == nil {
		return t.transcribeWithWhisperCpp(cppPath, audioPath, onProgress)
	}

	return nil, fmt.Errorf("whisper 未安装，请运行 pip install openai-whisper 或安装 whisper.cpp")
}

func (t *WhisperTranscriber) transcribeWithPythonWhisper(whisperPath, audioPath string, onProgress func(percent int)) (*Result, error) {
	outDir := filepath.Dir(audioPath)
	outputFile := filepath.Join(outDir, "transcript")

	if onProgress != nil {
		onProgress(10)
	}

	cmd := exec.Command(whisperPath,
		audioPath,
		"--model", t.modelSize,
		"--output_format", "json",
		"--output_dir", outDir,
		"--language", "zh",
	)
	cmd.Dir = outDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		logger.Log.Error("whisper transcribe failed", "error", err, "output", string(output))
		return nil, fmt.Errorf("whisper 转录失败: %w\n%s", err, string(output))
	}

	if onProgress != nil {
		onProgress(80)
	}

	// 读取 JSON 输出
	jsonFile := outputFile + ".json"
	// whisper 输出文件名基于输入文件名
	baseName := filepath.Base(audioPath)
	ext := filepath.Ext(baseName)
	jsonFile = filepath.Join(outDir, baseName[:len(baseName)-len(ext)]+".json")

	data, err := os.ReadFile(jsonFile)
	if err != nil {
		return nil, fmt.Errorf("读取转录结果: %w", err)
	}

	var whisperResult struct {
		Text     string `json:"text"`
		Segments []struct {
			Start float64 `json:"start"`
			End   float64 `json:"end"`
			Text  string  `json:"text"`
		} `json:"segments"`
		Language string `json:"language"`
	}

	if err := json.Unmarshal(data, &whisperResult); err != nil {
		return nil, fmt.Errorf("解析转录结果: %w", err)
	}

	result := &Result{
		Text:     whisperResult.Text,
		Language: whisperResult.Language,
	}
	for _, seg := range whisperResult.Segments {
		result.Segments = append(result.Segments, Segment{
			StartTime: seg.Start,
			EndTime:   seg.End,
			Text:      seg.Text,
		})
	}

	if onProgress != nil {
		onProgress(100)
	}

	logger.Log.Info("whisper transcribe complete", "segments", len(result.Segments))
	return result, nil
}

func (t *WhisperTranscriber) transcribeWithWhisperCpp(cppPath, audioPath string, onProgress func(percent int)) (*Result, error) {
	outDir := filepath.Dir(audioPath)
	outputJSON := filepath.Join(outDir, "transcript.json")

	if onProgress != nil {
		onProgress(10)
	}

	home, _ := os.UserHomeDir()
	modelPath := filepath.Join(home, ".taskpilot", "whisper-models", fmt.Sprintf("ggml-%s.bin", t.modelSize))

	cmd := exec.Command(cppPath,
		"-m", modelPath,
		"-f", audioPath,
		"-oj",
		"-of", filepath.Join(outDir, "transcript"),
		"-l", "zh",
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		logger.Log.Error("whisper-cpp transcribe failed", "error", err, "output", string(output))
		return nil, fmt.Errorf("whisper-cpp 转录失败: %w", err)
	}

	if onProgress != nil {
		onProgress(80)
	}

	data, err := os.ReadFile(outputJSON)
	if err != nil {
		return nil, fmt.Errorf("读取转录结果: %w", err)
	}

	var cppResult struct {
		Transcription []struct {
			Timestamps struct {
				From string `json:"from"`
				To   string `json:"to"`
			} `json:"timestamps"`
			Offsets struct {
				From int `json:"from"`
				To   int `json:"to"`
			} `json:"offsets"`
			Text string `json:"text"`
		} `json:"transcription"`
	}

	if err := json.Unmarshal(data, &cppResult); err != nil {
		return nil, fmt.Errorf("解析转录结果: %w", err)
	}

	result := &Result{Language: "zh"}
	for _, seg := range cppResult.Transcription {
		startSec := float64(seg.Offsets.From) / 1000.0
		endSec := float64(seg.Offsets.To) / 1000.0
		result.Segments = append(result.Segments, Segment{
			StartTime: startSec,
			EndTime:   endSec,
			Text:      seg.Text,
		})
		result.Text += seg.Text + " "
	}

	if onProgress != nil {
		onProgress(100)
	}

	return result, nil
}
