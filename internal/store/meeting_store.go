package store

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"taskpilot/internal/model"
)

type MeetingStore struct {
	db *DB
}

func NewMeetingStore(db *DB) *MeetingStore {
	return &MeetingStore{db: db}
}

// ── Meeting CRUD ────────────────────────────────────────────────────────

func (s *MeetingStore) CreateMeeting(m model.Meeting) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	now := time.Now().Format(time.RFC3339)
	if m.CreatedAt == "" {
		m.CreatedAt = now
	}
	m.UpdatedAt = now

	_, err := s.db.Exec(
		`INSERT INTO meetings (id, project_id, title, status, audio_path, transcript_path, summary, duration, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.ProjectID, m.Title, m.Status, m.AudioPath, m.TranscriptPath, m.Summary, m.Duration, m.CreatedAt, m.UpdatedAt,
	)
	return err
}

func (s *MeetingStore) UpdateMeeting(m model.Meeting) error {
	m.UpdatedAt = time.Now().Format(time.RFC3339)
	_, err := s.db.Exec(
		`UPDATE meetings SET project_id=?, title=?, status=?, audio_path=?, transcript_path=?, summary=?, duration=?, updated_at=?
		 WHERE id=?`,
		m.ProjectID, m.Title, m.Status, m.AudioPath, m.TranscriptPath, m.Summary, m.Duration, m.UpdatedAt, m.ID,
	)
	return err
}

func (s *MeetingStore) DeleteMeeting(id string) error {
	// 级联删除相关数据
	s.db.Exec(`DELETE FROM transcript_segments WHERE meeting_id=?`, id)
	s.db.Exec(`DELETE FROM meeting_speakers WHERE meeting_id=?`, id)
	_, err := s.db.Exec(`DELETE FROM meetings WHERE id=?`, id)
	return err
}

func (s *MeetingStore) GetMeetingByID(id string) (*model.Meeting, error) {
	row := s.db.QueryRow(
		`SELECT id, project_id, title, status, audio_path, transcript_path, summary, duration, created_at, updated_at
		 FROM meetings WHERE id=?`, id,
	)
	var m model.Meeting
	err := row.Scan(&m.ID, &m.ProjectID, &m.Title, &m.Status, &m.AudioPath, &m.TranscriptPath, &m.Summary, &m.Duration, &m.CreatedAt, &m.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *MeetingStore) ListMeetings() ([]model.Meeting, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, title, status, audio_path, transcript_path, summary, duration, created_at, updated_at
		 FROM meetings ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var meetings []model.Meeting
	for rows.Next() {
		var m model.Meeting
		if err := rows.Scan(&m.ID, &m.ProjectID, &m.Title, &m.Status, &m.AudioPath, &m.TranscriptPath, &m.Summary, &m.Duration, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		meetings = append(meetings, m)
	}
	return meetings, rows.Err()
}

func (s *MeetingStore) ListMeetingsByProject(projectID string) ([]model.Meeting, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, title, status, audio_path, transcript_path, summary, duration, created_at, updated_at
		 FROM meetings WHERE project_id=? ORDER BY created_at DESC`, projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var meetings []model.Meeting
	for rows.Next() {
		var m model.Meeting
		if err := rows.Scan(&m.ID, &m.ProjectID, &m.Title, &m.Status, &m.AudioPath, &m.TranscriptPath, &m.Summary, &m.Duration, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		meetings = append(meetings, m)
	}
	return meetings, rows.Err()
}

// ── Speaker CRUD ────────────────────────────────────────────────────────

func (s *MeetingStore) CreateSpeaker(sp model.MeetingSpeaker) error {
	if sp.ID == "" {
		sp.ID = uuid.NewString()
	}
	_, err := s.db.Exec(
		`INSERT INTO meeting_speakers (id, meeting_id, speaker_label, display_name, color)
		 VALUES (?, ?, ?, ?, ?)`,
		sp.ID, sp.MeetingID, sp.SpeakerLabel, sp.DisplayName, sp.Color,
	)
	return err
}

func (s *MeetingStore) UpdateSpeaker(sp model.MeetingSpeaker) error {
	_, err := s.db.Exec(
		`UPDATE meeting_speakers SET speaker_label=?, display_name=?, color=? WHERE id=?`,
		sp.SpeakerLabel, sp.DisplayName, sp.Color, sp.ID,
	)
	return err
}

func (s *MeetingStore) DeleteSpeaker(id string) error {
	_, err := s.db.Exec(`DELETE FROM meeting_speakers WHERE id=?`, id)
	return err
}

func (s *MeetingStore) ListSpeakers(meetingID string) ([]model.MeetingSpeaker, error) {
	rows, err := s.db.Query(
		`SELECT id, meeting_id, speaker_label, display_name, color FROM meeting_speakers WHERE meeting_id=? ORDER BY speaker_label`,
		meetingID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var speakers []model.MeetingSpeaker
	for rows.Next() {
		var sp model.MeetingSpeaker
		if err := rows.Scan(&sp.ID, &sp.MeetingID, &sp.SpeakerLabel, &sp.DisplayName, &sp.Color); err != nil {
			return nil, err
		}
		speakers = append(speakers, sp)
	}
	return speakers, rows.Err()
}

// MergeSpeakers 合并说话人：将 fromID 的所有转录片段归到 toID
func (s *MeetingStore) MergeSpeakers(toID, fromID string) error {
	_, err := s.db.Exec(`UPDATE transcript_segments SET speaker_id=? WHERE speaker_id=?`, toID, fromID)
	if err != nil {
		return err
	}
	return s.DeleteSpeaker(fromID)
}

// ── TranscriptSegment CRUD ──────────────────────────────────────────────

func (s *MeetingStore) CreateSegment(seg model.TranscriptSegment) error {
	if seg.ID == "" {
		seg.ID = uuid.NewString()
	}
	_, err := s.db.Exec(
		`INSERT INTO transcript_segments (id, meeting_id, speaker_id, start_time, end_time, text)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		seg.ID, seg.MeetingID, seg.SpeakerID, seg.StartTime, seg.EndTime, seg.Text,
	)
	return err
}

func (s *MeetingStore) CreateSegmentsBatch(segments []model.TranscriptSegment) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(
		`INSERT INTO transcript_segments (id, meeting_id, speaker_id, start_time, end_time, text)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, seg := range segments {
		if seg.ID == "" {
			seg.ID = uuid.NewString()
		}
		if _, err := stmt.Exec(seg.ID, seg.MeetingID, seg.SpeakerID, seg.StartTime, seg.EndTime, seg.Text); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *MeetingStore) ListSegments(meetingID string) ([]model.TranscriptSegment, error) {
	rows, err := s.db.Query(
		`SELECT id, meeting_id, speaker_id, start_time, end_time, text
		 FROM transcript_segments WHERE meeting_id=? ORDER BY start_time ASC`,
		meetingID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var segments []model.TranscriptSegment
	for rows.Next() {
		var seg model.TranscriptSegment
		if err := rows.Scan(&seg.ID, &seg.MeetingID, &seg.SpeakerID, &seg.StartTime, &seg.EndTime, &seg.Text); err != nil {
			return nil, err
		}
		segments = append(segments, seg)
	}
	return segments, rows.Err()
}

func (s *MeetingStore) DeleteSegmentsByMeeting(meetingID string) error {
	_, err := s.db.Exec(`DELETE FROM transcript_segments WHERE meeting_id=?`, meetingID)
	return err
}
