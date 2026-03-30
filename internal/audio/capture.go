package audio

// AudioCapturer 音频采集接口
type AudioCapturer interface {
	// Start 开始音频采集，写入指定文件路径
	Start(outputPath string) error
	// Stop 停止采集，返回录制时长（秒）
	Stop() (int, error)
	// Pause 暂停采集
	Pause() error
	// Resume 恢复采集
	Resume() error
	// IsRecording 是否正在录制
	IsRecording() bool
}

// NewCapturer 创建平台对应的音频采集器
func NewCapturer() AudioCapturer {
	return newPlatformCapturer()
}
