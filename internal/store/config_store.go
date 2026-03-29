package store

import "database/sql"

type ConfigStore struct {
	db *DB
}

func NewConfigStore(db *DB) *ConfigStore {
	return &ConfigStore{db: db}
}

func (s *ConfigStore) Get(key string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM config WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (s *ConfigStore) Set(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO config (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	return err
}
