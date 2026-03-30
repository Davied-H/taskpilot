package diarize

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"taskpilot/internal/logger"
)

// SpeakerSegment 说话人片段
type SpeakerSegment struct {
	Speaker   string  `json:"speaker"`
	StartTime float64 `json:"start"`
	EndTime   float64 `json:"end"`
}

// Result 说话人分辨结果
type Result struct {
	Speakers []string         `json:"speakers"` // 唯一说话人列表
	Segments []SpeakerSegment `json:"segments"`
}

// Diarizer 说话人分辨接口
type Diarizer interface {
	Diarize(audioPath string, onProgress func(percent int)) (*Result, error)
	IsAvailable() bool
}

// PyAnnoteDiarizer 使用 pyannote.audio 的 Python sidecar 进行说话人分辨
type PyAnnoteDiarizer struct {
	scriptPath string
}

// NewDiarizer 创建说话人分辨器
func NewDiarizer() Diarizer {
	// 查找脚本路径
	// 1. 先检查应用目录下的 scripts/diarize.py
	// 2. 再检查可执行文件同级目录
	candidates := []string{
		"scripts/diarize.py",
	}

	// 获取可执行文件所在目录
	if execPath, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(execPath), "scripts", "diarize.py"))
	}

	// 获取用户主目录
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, ".taskpilot", "scripts", "diarize.py"))
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return &PyAnnoteDiarizer{scriptPath: path}
		}
	}

	return &PyAnnoteDiarizer{scriptPath: "scripts/diarize.py"}
}

func (d *PyAnnoteDiarizer) IsAvailable() bool {
	// 检查 Python 和 pyannote 是否可用
	_, err := exec.LookPath("python3")
	if err != nil {
		return false
	}

	// 检查脚本是否存在
	if _, err := os.Stat(d.scriptPath); err != nil {
		return false
	}

	return true
}

func (d *PyAnnoteDiarizer) Diarize(audioPath string, onProgress func(percent int)) (*Result, error) {
	if onProgress != nil {
		onProgress(0)
	}

	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		return nil, fmt.Errorf("python3 未安装")
	}

	if _, err := os.Stat(d.scriptPath); err != nil {
		return nil, fmt.Errorf("说话人分辨脚本不存在: %s，请先初始化", d.scriptPath)
	}

	outDir := filepath.Dir(audioPath)
	outputFile := filepath.Join(outDir, "diarization.json")

	if onProgress != nil {
		onProgress(10)
	}

	cmd := exec.Command(pythonPath, d.scriptPath,
		"--audio", audioPath,
		"--output", outputFile,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		logger.Log.Error("diarization failed", "error", err, "output", string(output))
		return nil, fmt.Errorf("说话人分辨失败: %w\n%s", err, string(output))
	}

	if onProgress != nil {
		onProgress(80)
	}

	data, err := os.ReadFile(outputFile)
	if err != nil {
		return nil, fmt.Errorf("读取分辨结果: %w", err)
	}

	var result Result
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("解析分辨结果: %w", err)
	}

	if onProgress != nil {
		onProgress(100)
	}

	logger.Log.Info("diarization complete", "speakers", len(result.Speakers), "segments", len(result.Segments))
	return &result, nil
}
