package feishu

// TokenResponse 租户访问令牌响应
type TokenResponse struct {
	Code              int    `json:"code"`
	Msg               string `json:"msg"`
	TenantAccessToken string `json:"tenant_access_token"`
	Expire            int    `json:"expire"` // 秒
}

// BitableRecord 多维表格记录
type BitableRecord struct {
	RecordID string                 `json:"record_id"`
	Fields   map[string]interface{} `json:"fields"`
}

// BitableListResponse 列表记录响应
type BitableListResponse struct {
	Code int `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		HasMore   bool            `json:"has_more"`
		PageToken string          `json:"page_token"`
		Total     int             `json:"total"`
		Items     []BitableRecord `json:"items"`
	} `json:"data"`
}

// BitableCreateResponse 创建记录响应
type BitableCreateResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		Record BitableRecord `json:"record"`
	} `json:"data"`
}

// BitableUpdateResponse 更新记录响应
type BitableUpdateResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		Record BitableRecord `json:"record"`
	} `json:"data"`
}

// BitableFieldsResponse 获取字段定义响应
type BitableFieldsResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		HasMore   bool           `json:"has_more"`
		PageToken string         `json:"page_token"`
		Items     []BitableField `json:"items"`
	} `json:"data"`
}

// BitableField 字段定义
type BitableField struct {
	FieldID   string `json:"field_id"`
	FieldName string `json:"field_name"`
	Type      int    `json:"type"`
}

// BaseResponse 通用响应
type BaseResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}
