package feishu

import (
	"encoding/json"
	"fmt"

	"taskpilot/internal/logger"
)

// BotMessageEvent 飞书 Bot 收到的消息事件
type BotMessageEvent struct {
	MessageID   string `json:"message_id"`
	ChatID      string `json:"chat_id"`
	ChatType    string `json:"chat_type"` // p2p, group
	SenderID    string `json:"sender_id"`
	MessageType string `json:"message_type"` // text, interactive
	Content     string `json:"content"`      // JSON string
}

// BotTextContent 文本消息内容
type BotTextContent struct {
	Text string `json:"text"`
}

// SendTextMessage 发送文本消息到指定会话
func (c *Client) SendTextMessage(chatID, text string) error {
	body := map[string]interface{}{
		"receive_id_type": "chat_id",
		"msg_type":        "text",
		"receive_id":      chatID,
		"content":         fmt.Sprintf(`{"text":"%s"}`, escapeJSON(text)),
	}

	data, err := c.DoRequest("POST", "/im/v1/messages?receive_id_type=chat_id", body)
	if err != nil {
		return fmt.Errorf("send text message: %w", err)
	}

	var resp BaseResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return fmt.Errorf("decode send message response: %w", err)
	}
	if resp.Code != 0 {
		return fmt.Errorf("send message error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}

// SendCardMessage 发送交互式卡片消息
func (c *Client) SendCardMessage(chatID string, card map[string]interface{}) error {
	cardJSON, _ := json.Marshal(card)
	body := map[string]interface{}{
		"receive_id_type": "chat_id",
		"msg_type":        "interactive",
		"receive_id":      chatID,
		"content":         string(cardJSON),
	}

	data, err := c.DoRequest("POST", "/im/v1/messages?receive_id_type=chat_id", body)
	if err != nil {
		return fmt.Errorf("send card message: %w", err)
	}

	var resp BaseResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return fmt.Errorf("decode send card response: %w", err)
	}
	if resp.Code != 0 {
		return fmt.Errorf("send card error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	return nil
}

// BuildTaskCard 构建任务详情卡片
func BuildTaskCard(title, status, priority, dueDate string) map[string]interface{} {
	statusEmoji := map[string]string{
		"todo": "📋", "doing": "🔨", "done": "✅",
	}
	emoji := statusEmoji[status]
	if emoji == "" {
		emoji = "📋"
	}

	elements := []map[string]interface{}{
		{
			"tag": "div",
			"text": map[string]interface{}{
				"tag":     "lark_md",
				"content": fmt.Sprintf("**状态**: %s %s\n**优先级**: %s\n**截止日期**: %s", emoji, status, priority, dueDate),
			},
		},
	}

	return map[string]interface{}{
		"config": map[string]interface{}{
			"wide_screen_mode": true,
		},
		"header": map[string]interface{}{
			"title": map[string]interface{}{
				"tag":     "plain_text",
				"content": title,
			},
			"template": "blue",
		},
		"elements": elements,
	}
}

// ParseTextContent 解析文本消息内容
func ParseTextContent(contentJSON string) string {
	var content BotTextContent
	if err := json.Unmarshal([]byte(contentJSON), &content); err != nil {
		logger.Log.Error("parse bot text content failed", "error", err)
		return contentJSON
	}
	return content.Text
}

func escapeJSON(s string) string {
	b, _ := json.Marshal(s)
	// 去掉首尾的引号
	return string(b[1 : len(b)-1])
}
