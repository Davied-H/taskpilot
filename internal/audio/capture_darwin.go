//go:build darwin

package audio

import (
	"fmt"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"taskpilot/internal/logger"
)

// darwinCapturer macOS 音频采集器
// 优先使用 ffmpeg（通过 avfoundation），降级到 sox，最后到 afrecord
type darwinCapturer struct {
	mu        sync.Mutex
	cmd       *exec.Cmd
	recording bool
	paused    bool
	startTime time.Time
	output    string
}

func newPlatformCapturer() AudioCapturer {
	return &darwinCapturer{}
}

func (c *darwinCapturer) Start(outputPath string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.recording {
		return fmt.Errorf("already recording")
	}

	c.output = outputPath

	// 尝试 ffmpeg
	if ffmpegPath, err := exec.LookPath("ffmpeg"); err == nil {
		c.cmd = exec.Command(ffmpegPath,
			"-f", "avfoundation",
			"-i", ":0",
			"-acodec", "pcm_s16le",
			"-ar", "16000",
			"-ac", "1",
			"-y",
			outputPath,
		)
		if err := c.cmd.Start(); err == nil {
			c.recording = true
			c.startTime = time.Now()
			logger.Log.Info("audio capture started (ffmpeg)", "output", outputPath)
			return nil
		}
	}

	// 尝试 sox
	if soxPath, err := exec.LookPath("sox"); err == nil {
		c.cmd = exec.Command(soxPath, "-d", "-r", "16000", "-c", "1", "-b", "16", outputPath)
		if err := c.cmd.Start(); err == nil {
			c.recording = true
			c.startTime = time.Now()
			logger.Log.Info("audio capture started (sox)", "output", outputPath)
			return nil
		}
	}

	// 尝试 afrecord
	c.cmd = exec.Command("afrecord", "-f", "WAVE", "-d", "LEI16", "-r", "16000", "-c", "1", outputPath)
	if err := c.cmd.Start(); err != nil {
		return fmt.Errorf("无法找到音频采集工具，请安装 ffmpeg (brew install ffmpeg) 或 sox (brew install sox)")
	}

	c.recording = true
	c.startTime = time.Now()
	logger.Log.Info("audio capture started (afrecord)", "output", outputPath)
	return nil
}

func (c *darwinCapturer) Stop() (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.recording {
		return 0, fmt.Errorf("not recording")
	}

	duration := int(time.Since(c.startTime).Seconds())

	if c.cmd != nil && c.cmd.Process != nil {
		// 发送 SIGINT 让工具正常关闭并写入文件头
		c.cmd.Process.Signal(syscall.SIGINT)
		done := make(chan error, 1)
		go func() { done <- c.cmd.Wait() }()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			c.cmd.Process.Kill()
			<-done
		}
		c.cmd = nil
	}

	c.recording = false
	c.paused = false
	logger.Log.Info("audio capture stopped", "duration", duration)
	return duration, nil
}

func (c *darwinCapturer) Pause() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.recording || c.paused {
		return fmt.Errorf("cannot pause")
	}

	if c.cmd != nil && c.cmd.Process != nil {
		c.cmd.Process.Signal(syscall.SIGSTOP)
	}

	c.paused = true
	return nil
}

func (c *darwinCapturer) Resume() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.recording || !c.paused {
		return fmt.Errorf("cannot resume")
	}

	if c.cmd != nil && c.cmd.Process != nil {
		c.cmd.Process.Signal(syscall.SIGCONT)
	}

	c.paused = false
	return nil
}

func (c *darwinCapturer) IsRecording() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.recording
}
