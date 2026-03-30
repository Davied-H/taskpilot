package store

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"taskpilot/internal/model"
)

type SyncStore struct {
	db *DB
}

func NewSyncStore(db *DB) *SyncStore {
	return &SyncStore{db: db}
}

func (s *SyncStore) Create(m model.SyncMapping) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	now := time.Now().Format(time.RFC3339)
	if m.CreatedAt == "" {
		m.CreatedAt = now
	}
	m.UpdatedAt = now
	if m.LastSyncedAt == "" {
		m.LastSyncedAt = now
	}

	_, err := s.db.Exec(
		`INSERT INTO feishu_sync_map (id, local_task_id, bitable_record_id, bitable_app_token, bitable_table_id, last_synced_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.LocalTaskID, m.BitableRecordID, m.BitableAppToken, m.BitableTableID, m.LastSyncedAt, m.CreatedAt, m.UpdatedAt,
	)
	return err
}

func (s *SyncStore) Update(m model.SyncMapping) error {
	m.UpdatedAt = time.Now().Format(time.RFC3339)
	_, err := s.db.Exec(
		`UPDATE feishu_sync_map SET local_task_id=?, bitable_record_id=?, bitable_app_token=?, bitable_table_id=?, last_synced_at=?, updated_at=?
		 WHERE id=?`,
		m.LocalTaskID, m.BitableRecordID, m.BitableAppToken, m.BitableTableID, m.LastSyncedAt, m.UpdatedAt, m.ID,
	)
	return err
}

func (s *SyncStore) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM feishu_sync_map WHERE id=?`, id)
	return err
}

func (s *SyncStore) DeleteByLocalTaskID(localTaskID string) error {
	_, err := s.db.Exec(`DELETE FROM feishu_sync_map WHERE local_task_id=?`, localTaskID)
	return err
}

func (s *SyncStore) GetByLocalTaskID(localTaskID string) (*model.SyncMapping, error) {
	row := s.db.QueryRow(
		`SELECT id, local_task_id, bitable_record_id, bitable_app_token, bitable_table_id, last_synced_at, created_at, updated_at
		 FROM feishu_sync_map WHERE local_task_id=?`, localTaskID,
	)
	return scanSyncMapping(row)
}

func (s *SyncStore) GetByRecordID(recordID string) (*model.SyncMapping, error) {
	row := s.db.QueryRow(
		`SELECT id, local_task_id, bitable_record_id, bitable_app_token, bitable_table_id, last_synced_at, created_at, updated_at
		 FROM feishu_sync_map WHERE bitable_record_id=?`, recordID,
	)
	return scanSyncMapping(row)
}

func (s *SyncStore) ListAll() ([]model.SyncMapping, error) {
	rows, err := s.db.Query(
		`SELECT id, local_task_id, bitable_record_id, bitable_app_token, bitable_table_id, last_synced_at, created_at, updated_at
		 FROM feishu_sync_map ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mappings []model.SyncMapping
	for rows.Next() {
		m, err := scanSyncMapping(rows)
		if err != nil {
			return nil, err
		}
		mappings = append(mappings, *m)
	}
	return mappings, rows.Err()
}

func scanSyncMapping(s scanner) (*model.SyncMapping, error) {
	var m model.SyncMapping
	err := s.Scan(&m.ID, &m.LocalTaskID, &m.BitableRecordID, &m.BitableAppToken, &m.BitableTableID, &m.LastSyncedAt, &m.CreatedAt, &m.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}
