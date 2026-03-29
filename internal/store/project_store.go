package store

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"taskpilot/internal/model"
)

type ProjectStore struct {
	db *DB
}

func NewProjectStore(db *DB) *ProjectStore {
	return &ProjectStore{db: db}
}

func (s *ProjectStore) Create(p model.Project) error {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	now := time.Now().Format(time.RFC3339)
	if p.CreatedAt == "" {
		p.CreatedAt = now
	}
	p.UpdatedAt = now

	_, err := s.db.Exec(
		`INSERT INTO projects (id, name, description, color, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Description, p.Color, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (s *ProjectStore) Update(p model.Project) error {
	p.UpdatedAt = time.Now().Format(time.RFC3339)
	_, err := s.db.Exec(
		`UPDATE projects SET name=?, description=?, color=?, updated_at=? WHERE id=?`,
		p.Name, p.Description, p.Color, p.UpdatedAt, p.ID,
	)
	return err
}

func (s *ProjectStore) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM projects WHERE id=?`, id)
	return err
}

func (s *ProjectStore) GetByID(id string) (*model.Project, error) {
	row := s.db.QueryRow(
		`SELECT id, name, description, color, created_at, updated_at FROM projects WHERE id=?`, id,
	)
	p, err := scanProject(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return p, err
}

func (s *ProjectStore) List() ([]model.Project, error) {
	rows, err := s.db.Query(
		`SELECT id, name, description, color, created_at, updated_at FROM projects ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []model.Project
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, *p)
	}
	return projects, rows.Err()
}

type scanner interface {
	Scan(dest ...any) error
}

func scanProject(s scanner) (*model.Project, error) {
	var p model.Project
	err := s.Scan(&p.ID, &p.Name, &p.Description, &p.Color, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}
