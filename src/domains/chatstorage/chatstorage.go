package chatstorage

import "time"

// DeviceAgent stores a per-device LLM agent configuration
type DeviceAgent struct {
	DeviceID        string    `db:"device_id"        json:"device_id"`
	Provider        string    `db:"provider"         json:"provider"` // "ollama", "openai", "groq", "custom"
	APIURL          string    `db:"api_url"          json:"api_url"`
	APIKey          string    `db:"api_key"          json:"api_key"`
	Model           string    `db:"model"            json:"model"`
	SystemPrompt    string    `db:"system_prompt"    json:"system_prompt"`
	Enabled         bool      `db:"enabled"          json:"enabled"`
	Temperature     float64   `db:"temperature"      json:"temperature"`      // 0.0-2.0; 0 = use provider default
	MaxTokens       int       `db:"max_tokens"       json:"max_tokens"`       // 0 = no limit
	ContextMessages int       `db:"context_messages" json:"context_messages"` // 0 = stateless; N = last N messages
	AllowGroups      bool      `db:"allow_groups"      json:"allow_groups"`      // reply in group chats
	StructuredOutput bool      `db:"structured_output" json:"structured_output"` // expect JSON {answer,confidence,action,media_url,citations}
	CreatedAt       time.Time `db:"created_at"       json:"created_at"`
	UpdatedAt       time.Time `db:"updated_at"       json:"updated_at"`
}

// AgentTemplate is a reusable LLM agent configuration that can be applied to any device.
type AgentTemplate struct {
	ID               int64     `db:"id"               json:"id"`
	Name             string    `db:"name"             json:"name"`
	Description      string    `db:"description"      json:"description"`
	Provider         string    `db:"provider"         json:"provider"`
	APIURL           string    `db:"api_url"          json:"api_url"`
	APIKey           string    `db:"api_key"          json:"api_key"`
	Model            string    `db:"model"            json:"model"`
	SystemPrompt     string    `db:"system_prompt"    json:"system_prompt"`
	Temperature      float64   `db:"temperature"      json:"temperature"`
	MaxTokens        int       `db:"max_tokens"       json:"max_tokens"`
	ContextMessages  int       `db:"context_messages" json:"context_messages"`
	AllowGroups      bool      `db:"allow_groups"     json:"allow_groups"`
	StructuredOutput bool      `db:"structured_output" json:"structured_output"`
	CreatedAt        time.Time `db:"created_at"       json:"created_at"`
	UpdatedAt        time.Time `db:"updated_at"       json:"updated_at"`
}

// DeviceWebhook stores a per-device n8n/webhook URL configuration
type DeviceWebhook struct {
	DeviceID  string    `db:"device_id" json:"device_id"`
	URL       string    `db:"url" json:"url"`
	Enabled   bool      `db:"enabled" json:"enabled"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// Chat represents a WhatsApp chat/conversation
type Chat struct {
	DeviceID            string    `db:"device_id"`
	JID                 string    `db:"jid"`
	Name                string    `db:"name"`
	LastMessageTime     time.Time `db:"last_message_time"`
	EphemeralExpiration uint32    `db:"ephemeral_expiration"`
	CreatedAt           time.Time `db:"created_at"`
	UpdatedAt           time.Time `db:"updated_at"`
	Archived            bool      `db:"archived"`
}

// Message represents a WhatsApp message
type Message struct {
	ID            string    `db:"id"`
	ChatJID       string    `db:"chat_jid"`
	DeviceID      string    `db:"device_id"`
	Sender        string    `db:"sender"`
	Content       string    `db:"content"`
	Timestamp     time.Time `db:"timestamp"`
	IsFromMe      bool      `db:"is_from_me"`
	MediaType     string    `db:"media_type"`
	Filename      string    `db:"filename"`
	URL           string    `db:"url"`
	MediaKey      []byte    `db:"media_key"`
	FileSHA256    []byte    `db:"file_sha256"`
	FileEncSHA256 []byte    `db:"file_enc_sha256"`
	FileLength    uint64    `db:"file_length"`
	CreatedAt     time.Time `db:"created_at"`
	UpdatedAt     time.Time `db:"updated_at"`
}

// MediaInfo represents downloadable media information
type MediaInfo struct {
	MessageID     string
	ChatJID       string
	MediaType     string
	Filename      string
	URL           string
	MediaKey      []byte
	FileSHA256    []byte
	FileEncSHA256 []byte
	FileLength    uint64
}

// DeviceRecord tracks a registered device for persistence purposes.
type DeviceRecord struct {
	DeviceID    string    `db:"device_id"`
	DisplayName string    `db:"display_name"`
	JID         string    `db:"jid"`
	CreatedAt   time.Time `db:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"`
}

// MessageFilter represents query filters for messages
type MessageFilter struct {
	DeviceID  string
	ChatJID   string
	Limit     int
	Offset    int
	StartTime *time.Time
	EndTime   *time.Time
	MediaOnly bool
	IsFromMe  *bool
}

// ChatFilter represents query filters for chats
type ChatFilter struct {
	DeviceID   string
	Limit      int
	Offset     int
	SearchName string
	HasMedia   bool
	IsArchived *bool
}
