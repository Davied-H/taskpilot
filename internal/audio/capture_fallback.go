//go:build !darwin

package audio

import "fmt"

// fallbackCapturer 非 macOS 平台的降级采集器
type fallbackCapturer struct{}

func newPlatformCapturer() AudioCapturer {
	return &fallbackCapturer{}
}

func (c *fallbackCapturer) Start(outputPath string) error {
	return fmt.Errorf("音频采集当前仅支持 macOS，其他平台支持即将推出")
}

func (c *fallbackCapturer) Stop() (int, error) {
	return 0, fmt.Errorf("not recording")
}

func (c *fallbackCapturer) Pause() error {
	return fmt.Errorf("not supported")
}

func (c *fallbackCapturer) Resume() error {
	return fmt.Errorf("not supported")
}

func (c *fallbackCapturer) IsRecording() bool {
	return false
}
