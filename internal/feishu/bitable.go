package feishu

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
)

// ListRecords 分页获取多维表格记录
func (c *Client) ListRecords(appToken, tableID, pageToken string, pageSize int) (*BitableListResponse, error) {
	params := url.Values{}
	if pageToken != "" {
		params.Set("page_token", pageToken)
	}
	if pageSize > 0 {
		params.Set("page_size", strconv.Itoa(pageSize))
	}

	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records?%s", appToken, tableID, params.Encode())
	data, err := c.DoRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var resp BitableListResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("decode list records: %w", err)
	}
	if resp.Code != 0 {
		return nil, fmt.Errorf("list records error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return &resp, nil
}

// ListAllRecords 获取所有记录（自动翻页）
func (c *Client) ListAllRecords(appToken, tableID string) ([]BitableRecord, error) {
	var all []BitableRecord
	pageToken := ""
	for {
		resp, err := c.ListRecords(appToken, tableID, pageToken, 100)
		if err != nil {
			return nil, err
		}
		all = append(all, resp.Data.Items...)
		if !resp.Data.HasMore {
			break
		}
		pageToken = resp.Data.PageToken
	}
	return all, nil
}

// CreateRecord 创建记录，返回 record_id
func (c *Client) CreateRecord(appToken, tableID string, fields map[string]interface{}) (string, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records", appToken, tableID)
	body := map[string]interface{}{"fields": fields}

	data, err := c.DoRequest("POST", path, body)
	if err != nil {
		return "", err
	}

	var resp BitableCreateResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", fmt.Errorf("decode create record: %w", err)
	}
	if resp.Code != 0 {
		return "", fmt.Errorf("create record error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return resp.Data.Record.RecordID, nil
}

// UpdateRecord 更新记录
func (c *Client) UpdateRecord(appToken, tableID, recordID string, fields map[string]interface{}) error {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records/%s", appToken, tableID, recordID)
	body := map[string]interface{}{"fields": fields}

	data, err := c.DoRequest("PUT", path, body)
	if err != nil {
		return err
	}

	var resp BaseResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return fmt.Errorf("decode update record: %w", err)
	}
	if resp.Code != 0 {
		return fmt.Errorf("update record error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}

// DeleteRecord 删除记录
func (c *Client) DeleteRecord(appToken, tableID, recordID string) error {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/records/%s", appToken, tableID, recordID)

	data, err := c.DoRequest("DELETE", path, nil)
	if err != nil {
		return err
	}

	var resp BaseResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return fmt.Errorf("decode delete record: %w", err)
	}
	if resp.Code != 0 {
		return fmt.Errorf("delete record error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}

// GetTableFields 获取表格字段定义
func (c *Client) GetTableFields(appToken, tableID string) ([]BitableField, error) {
	path := fmt.Sprintf("/bitable/v1/apps/%s/tables/%s/fields", appToken, tableID)

	data, err := c.DoRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var resp BitableFieldsResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("decode table fields: %w", err)
	}
	if resp.Code != 0 {
		return nil, fmt.Errorf("get table fields error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return resp.Data.Items, nil
}
