package store

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	*sql.DB
}

func NewDB(dbPath string) (*DB, error) {
	sqlDB, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}

	if err := sqlDB.Ping(); err != nil {
		return nil, err
	}

	db := &DB{sqlDB}
	if err := db.migrate(); err != nil {
		return nil, err
	}

	return db, nil
}

func (db *DB) migrate() error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id          TEXT PRIMARY KEY,
			name        TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			color       TEXT NOT NULL DEFAULT '',
			created_at  TEXT NOT NULL,
			updated_at  TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS tasks (
			id          TEXT PRIMARY KEY,
			project_id  TEXT NOT NULL DEFAULT '',
			title       TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			status      TEXT NOT NULL DEFAULT 'todo',
			priority    INTEGER NOT NULL DEFAULT 2,
			due_date    TEXT NOT NULL DEFAULT '',
			tags        TEXT NOT NULL DEFAULT '',
			created_at  TEXT NOT NULL,
			updated_at  TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS config (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS chat_messages (
			id          TEXT PRIMARY KEY,
			project_id  TEXT NOT NULL DEFAULT '',
			role        TEXT NOT NULL,
			content     TEXT NOT NULL,
			tool_results TEXT NOT NULL DEFAULT '',
			created_at  TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id);
		CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
	`)
	if err != nil {
		return err
	}

	// 为已有的 tasks 表添加 tags 列（忽略"列已存在"错误）
	db.Exec(`ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT ''`)

	// 会议相关表
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS meetings (
			id              TEXT PRIMARY KEY,
			project_id      TEXT NOT NULL DEFAULT '',
			title           TEXT NOT NULL,
			status          TEXT NOT NULL DEFAULT 'recording',
			audio_path      TEXT NOT NULL DEFAULT '',
			transcript_path TEXT NOT NULL DEFAULT '',
			summary         TEXT NOT NULL DEFAULT '',
			duration        INTEGER NOT NULL DEFAULT 0,
			created_at      TEXT NOT NULL,
			updated_at      TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS meeting_speakers (
			id            TEXT PRIMARY KEY,
			meeting_id    TEXT NOT NULL,
			speaker_label TEXT NOT NULL DEFAULT '',
			display_name  TEXT NOT NULL DEFAULT '',
			color         TEXT NOT NULL DEFAULT '#60a5fa'
		);
		CREATE INDEX IF NOT EXISTS idx_speakers_meeting ON meeting_speakers(meeting_id);

		CREATE TABLE IF NOT EXISTS transcript_segments (
			id         TEXT PRIMARY KEY,
			meeting_id TEXT NOT NULL,
			speaker_id TEXT NOT NULL DEFAULT '',
			start_time REAL NOT NULL DEFAULT 0,
			end_time   REAL NOT NULL DEFAULT 0,
			text       TEXT NOT NULL DEFAULT ''
		);
		CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments(meeting_id);
		CREATE INDEX IF NOT EXISTS idx_segments_speaker ON transcript_segments(speaker_id);
	`)
	if err != nil {
		return err
	}

	// 飞书同步映射表
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS feishu_sync_map (
			id                TEXT PRIMARY KEY,
			local_task_id     TEXT NOT NULL,
			bitable_record_id TEXT NOT NULL DEFAULT '',
			bitable_app_token TEXT NOT NULL DEFAULT '',
			bitable_table_id  TEXT NOT NULL DEFAULT '',
			last_synced_at    TEXT NOT NULL,
			created_at        TEXT NOT NULL,
			updated_at        TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_sync_local ON feishu_sync_map(local_task_id);
		CREATE INDEX IF NOT EXISTS idx_sync_record ON feishu_sync_map(bitable_record_id);
	`)
	if err != nil {
		return err
	}

	return nil
}
