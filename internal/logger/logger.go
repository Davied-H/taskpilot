package logger

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// Log is the global structured logger.
var Log *slog.Logger

// logFile keeps a reference so it can be closed if needed.
var logFile *os.File

// LogDir stores the log directory path for external use.
var LogDir string

// Init sets up the global logger writing to ~/.taskpilot/logs/taskpilot-YYYY-MM-DD.log.
func Init(dataDir string) error {
	LogDir = filepath.Join(dataDir, "logs")
	if err := os.MkdirAll(LogDir, 0o755); err != nil {
		return fmt.Errorf("create log dir: %w", err)
	}

	filename := fmt.Sprintf("taskpilot-%s.log", time.Now().Format("2006-01-02"))
	path := filepath.Join(LogDir, filename)

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open log file: %w", err)
	}
	logFile = f

	// Write to both file and stderr.
	w := io.MultiWriter(f, os.Stderr)
	Log = slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	return nil
}
