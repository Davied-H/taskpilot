package model

// SyncMapping 飞书多维表格同步映射
type SyncMapping struct {
	ID              string `json:"id"`
	LocalTaskID     string `json:"localTaskId"`
	BitableRecordID string `json:"bitableRecordId"`
	BitableAppToken string `json:"bitableAppToken"`
	BitableTableID  string `json:"bitableTableId"`
	LastSyncedAt    string `json:"lastSyncedAt"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}
