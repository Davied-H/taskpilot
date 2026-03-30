package feishu

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"taskpilot/internal/logger"
)

const baseURL = "https://open.feishu.cn/open-apis"

// Client 飞书 API 客户端，自动管理 tenant_access_token
type Client struct {
	appID     string
	appSecret string
	http      *http.Client

	mu          sync.Mutex
	token       string
	tokenExpiry time.Time
}

// NewClient 创建飞书客户端
func NewClient(appID, appSecret string) *Client {
	return &Client{
		appID:     appID,
		appSecret: appSecret,
		http:      &http.Client{Timeout: 30 * time.Second},
	}
}

// refreshToken 获取/刷新 tenant_access_token
func (c *Client) refreshToken() error {
	body, _ := json.Marshal(map[string]string{
		"app_id":     c.appID,
		"app_secret": c.appSecret,
	})

	resp, err := c.http.Post(
		baseURL+"/auth/v3/tenant_access_token/internal/",
		"application/json; charset=utf-8",
		bytes.NewReader(body),
	)
	if err != nil {
		return fmt.Errorf("feishu token request failed: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return fmt.Errorf("feishu token decode failed: %w", err)
	}
	if tokenResp.Code != 0 {
		return fmt.Errorf("feishu token error: code=%d msg=%s", tokenResp.Code, tokenResp.Msg)
	}

	c.token = tokenResp.TenantAccessToken
	// 提前 5 分钟过期，避免边界问题
	c.tokenExpiry = time.Now().Add(time.Duration(tokenResp.Expire-300) * time.Second)
	logger.Log.Info("feishu token refreshed", "expire", tokenResp.Expire)
	return nil
}

// getToken 获取有效的 token，过期则自动刷新
func (c *Client) getToken() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token == "" || time.Now().After(c.tokenExpiry) {
		if err := c.refreshToken(); err != nil {
			return "", err
		}
	}
	return c.token, nil
}

// DoRequest 执行带认证的 API 请求
func (c *Client) DoRequest(method, path string, body interface{}) ([]byte, error) {
	token, err := c.getToken()
	if err != nil {
		return nil, err
	}

	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("feishu API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("feishu API error: status=%d body=%s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// TestConnection 测试连接是否可用
func (c *Client) TestConnection() error {
	_, err := c.getToken()
	return err
}
