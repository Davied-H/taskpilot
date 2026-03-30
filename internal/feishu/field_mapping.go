package feishu

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"taskpilot/internal/model"
)

// 飞书多维表格字段名 — 与 Bitable 表格列名保持一致
const (
	FieldTitle       = "任务名称"
	FieldStatus      = "状态"
	FieldPriority    = "优先级"
	FieldDueDate     = "截止日期"
	FieldTags        = "标签"
	FieldDescription = "描述"
	FieldProject     = "所属项目"
	FieldLocalID     = "本地ID" // 用于双向映射
)

var statusMap = map[string]string{
	"todo":  "待办",
	"doing": "进行中",
	"done":  "已完成",
}

var statusReverseMap = map[string]string{
	"待办":  "todo",
	"进行中": "doing",
	"已完成": "done",
}

var priorityMap = map[int]string{
	0: "P0-紧急",
	1: "P1-高",
	2: "P2-中",
	3: "P3-低",
}

var priorityReverseMap = map[string]int{
	"P0-紧急": 0,
	"P1-高":  1,
	"P2-中":  2,
	"P3-低":  3,
}

// TaskToRecordFields 将本地 Task 转换为多维表格字段
func TaskToRecordFields(task model.Task, projectName string) map[string]interface{} {
	fields := map[string]interface{}{
		FieldTitle:       task.Title,
		FieldDescription: task.Description,
		FieldLocalID:     task.ID,
	}

	if s, ok := statusMap[task.Status]; ok {
		fields[FieldStatus] = s
	}
	if p, ok := priorityMap[task.Priority]; ok {
		fields[FieldPriority] = p
	}
	if task.DueDate != "" {
		// 飞书日期字段需要毫秒时间戳
		if ts, err := parseDateToMillis(task.DueDate); err == nil {
			fields[FieldDueDate] = ts
		}
	}
	if task.Tags != "" {
		tags := strings.Split(task.Tags, ",")
		for i := range tags {
			tags[i] = strings.TrimSpace(tags[i])
		}
		fields[FieldTags] = tags
	}
	if projectName != "" {
		fields[FieldProject] = projectName
	}

	return fields
}

// RecordFieldsToTask 将多维表格字段转换为本地 Task 字段
// 返回的 Task 只填充了从 Bitable 能获取的字段，调用方需自行处理 ID、ProjectID 等
func RecordFieldsToTask(fields map[string]interface{}) model.Task {
	var t model.Task

	if v, ok := fields[FieldTitle]; ok {
		t.Title = toString(v)
	}
	if v, ok := fields[FieldDescription]; ok {
		t.Description = toString(v)
	}
	if v, ok := fields[FieldLocalID]; ok {
		t.ID = toString(v)
	}

	if v, ok := fields[FieldStatus]; ok {
		statusStr := toString(v)
		if s, ok := statusReverseMap[statusStr]; ok {
			t.Status = s
		}
	}
	if t.Status == "" {
		t.Status = "todo"
	}

	if v, ok := fields[FieldPriority]; ok {
		priorityStr := toString(v)
		if p, ok := priorityReverseMap[priorityStr]; ok {
			t.Priority = p
		} else {
			t.Priority = 2
		}
	}

	if v, ok := fields[FieldDueDate]; ok {
		if millis, err := toFloat64(v); err == nil && millis > 0 {
			t.DueDate = time.UnixMilli(int64(millis)).Format("2006-01-02")
		}
	}

	if v, ok := fields[FieldTags]; ok {
		switch tags := v.(type) {
		case []interface{}:
			var tagStrs []string
			for _, tag := range tags {
				tagStrs = append(tagStrs, toString(tag))
			}
			t.Tags = strings.Join(tagStrs, ",")
		case string:
			t.Tags = tags
		}
	}

	return t
}

func parseDateToMillis(dateStr string) (int64, error) {
	// 尝试 RFC3339
	if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
		return t.UnixMilli(), nil
	}
	// 尝试 YYYY-MM-DD
	if t, err := time.Parse("2006-01-02", dateStr); err == nil {
		return t.UnixMilli(), nil
	}
	return 0, fmt.Errorf("unsupported date format: %s", dateStr)
}

func toString(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case []interface{}:
		// 多选字段可能返回数组
		if len(val) > 0 {
			return toString(val[0])
		}
	}
	return fmt.Sprintf("%v", v)
}

func toFloat64(v interface{}) (float64, error) {
	switch val := v.(type) {
	case float64:
		return val, nil
	case int:
		return float64(val), nil
	case int64:
		return float64(val), nil
	case string:
		return strconv.ParseFloat(val, 64)
	}
	return 0, fmt.Errorf("cannot convert %T to float64", v)
}
