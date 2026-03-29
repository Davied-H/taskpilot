package services

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// LogFileInfo describes a single log file.
type LogFileInfo struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
}

// LogService exposes log file operations to the frontend.
type LogService struct {
	LogDir string
}

// GetLogFiles returns all log files sorted by date descending.
func (s *LogService) GetLogFiles() ([]LogFileInfo, error) {
	entries, err := os.ReadDir(s.LogDir)
	if err != nil {
		return nil, fmt.Errorf("read log dir: %w", err)
	}

	var files []LogFileInfo
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, LogFileInfo{
			Name:    e.Name(),
			Size:    info.Size(),
			ModTime: info.ModTime().Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].Name > files[j].Name
	})

	return files, nil
}

// ExportLogs opens a native save dialog and copies the specified log file.
func (s *LogService) ExportLogs(filename string) error {
	srcPath := filepath.Join(s.LogDir, filepath.Base(filename))
	if _, err := os.Stat(srcPath); err != nil {
		return fmt.Errorf("log file not found: %s", filename)
	}

	app := application.Get()
	if app == nil {
		return fmt.Errorf("application not available")
	}

	dstPath, err := app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Filename: filename,
		Filters: []application.FileFilter{
			{DisplayName: "Log Files (*.log)", Pattern: "*.log"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	}).PromptForSingleSelection()
	if err != nil {
		return fmt.Errorf("save dialog: %w", err)
	}
	if dstPath == "" {
		return nil // user cancelled
	}

	return copyFile(srcPath, dstPath)
}

// OpenLogDir opens the log directory in the system file manager.
func (s *LogService) OpenLogDir() error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", s.LogDir)
	case "windows":
		cmd = exec.Command("explorer", s.LogDir)
	default:
		cmd = exec.Command("xdg-open", s.LogDir)
	}
	return cmd.Start()
}

// GetLogContent reads the last tailLines lines from a log file.
func (s *LogService) GetLogContent(filename string, tailLines int) (string, error) {
	path := filepath.Join(s.LogDir, filepath.Base(filename))
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read log file: %w", err)
	}

	if tailLines <= 0 {
		return string(data), nil
	}

	lines := strings.Split(string(data), "\n")
	if len(lines) > tailLines {
		lines = lines[len(lines)-tailLines:]
	}
	return strings.Join(lines, "\n"), nil
}

// ClearOldLogs removes log files older than the given number of days.
// Returns the number of files removed.
func (s *LogService) ClearOldLogs(days int) (int, error) {
	entries, err := os.ReadDir(s.LogDir)
	if err != nil {
		return 0, fmt.Errorf("read log dir: %w", err)
	}

	cutoff := time.Now().AddDate(0, 0, -days)
	removed := 0
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			if err := os.Remove(filepath.Join(s.LogDir, e.Name())); err == nil {
				removed++
			}
		}
	}
	return removed, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
