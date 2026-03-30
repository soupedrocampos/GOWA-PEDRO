package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"

	domainChatStorage "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/chatstorage"
	"github.com/aldinokemal/go-whatsapp-web-multidevice/pkg/utils"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

// llmHTTPClient is a shared HTTP client with a tuned transport so that concurrent
// calls across many devices reuse connections instead of opening a new TCP connection
// per request (http.DefaultClient uses MaxIdleConnsPerHost=2 which throttles throughput).
var llmHTTPClient = &http.Client{
	Transport: &http.Transport{
		MaxIdleConns:        200,
		MaxIdleConnsPerHost: 20, // each LLM endpoint can sustain 20 keep-alive connections
		IdleConnTimeout:     90 * time.Second,
	},
	// No client-level Timeout: each call uses a per-request context deadline instead.
}

// llmMaxConcurrent caps the total number of simultaneous LLM goroutines across all
// devices.  Without this, a message flood would spawn hundreds of goroutines that all
// compete for the same LLM endpoint and exhaust memory / file descriptors.
const llmMaxConcurrent = 30

var llmSemaphore = make(chan struct{}, llmMaxConcurrent)

// llmActiveMessages deduplicates incoming WhatsApp messages: WhatsApp may retransmit
// the same message ID, which would otherwise trigger two LLM calls and two replies.
// The value is stored while the message is being processed and deleted on completion.
var llmActiveMessages sync.Map

type llmMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type llmRequest struct {
	Model       string       `json:"model"`
	Messages    []llmMessage `json:"messages"`
	Temperature *float64     `json:"temperature,omitempty"`
	MaxTokens   *int         `json:"max_tokens,omitempty"`
}

type llmResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// claudeRequest is the native Anthropic API request format.
type claudeRequest struct {
	Model     string       `json:"model"`
	MaxTokens int          `json:"max_tokens"`
	System    string       `json:"system,omitempty"`
	Messages  []llmMessage `json:"messages"`
	Temperature *float64   `json:"temperature,omitempty"`
}

// claudeResponse is the native Anthropic API response format.
type claudeResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// isClaudeNative returns true when the agent should use the Anthropic native API
// (identified by provider="claude" or api_url containing "anthropic.com").
func isClaudeNative(agent *domainChatStorage.DeviceAgent) bool {
	if strings.EqualFold(agent.Provider, "claude") {
		return true
	}
	return strings.Contains(agent.APIURL, "anthropic.com")
}

// agentResponse is the structured JSON format the LLM returns when StructuredOutput is enabled.
type agentResponse struct {
	Answer     string   `json:"answer"`
	Confidence float64  `json:"confidence"`
	Action     string   `json:"action"`    // "send_text" | "send_image" | "send_file"
	MediaURL   string   `json:"media_url"` // public URL for image/file, empty for text
	Citations  []string `json:"citations"`
}

// jsonSystemSuffix is appended to the system prompt when structured output is enabled.
const jsonSystemSuffix = `

IMPORTANT: You MUST respond ONLY with a valid JSON object — no markdown, no extra text:
{"answer":"<your response>","confidence":<0.0-1.0>,"action":"send_text","media_url":null,"citations":[]}
To send an image: set "action":"send_image" and "media_url":"<public image URL>".
To send a file: set "action":"send_file" and "media_url":"<public file URL>".`

// handleLLMAgent checks if the device has an LLM agent configured and auto-replies.
func handleLLMAgent(ctx context.Context, evt *events.Message, client *whatsmeow.Client, chatStorageRepo domainChatStorage.IChatStorageRepository) {
	if client == nil || chatStorageRepo == nil {
		return
	}
	if client.Store == nil || client.Store.ID == nil {
		return
	}

	// Always skip outgoing messages and broadcasts
	if evt.Info.IsFromMe {
		return
	}
	if evt.Info.IsIncomingBroadcast() {
		return
	}

	// Skip protocol messages
	if protocolMessage := evt.Message.GetProtocolMessage(); protocolMessage != nil {
		return
	}

	// Extract text from message
	userText := extractTextFromEvent(evt)
	if userText == "" {
		return
	}

	deviceID := client.Store.ID.ToNonAD().String()

	// Load agent config first so we can check AllowGroups
	agent, err := chatStorageRepo.GetDeviceAgent(deviceID)
	if err != nil {
		log.Warnf("LLM agent: failed to load config for device %s: %v", deviceID, err)
		return
	}
	if agent == nil || !agent.Enabled {
		return
	}

	// Check group/server filters — skip unless agent explicitly allows groups
	isGroup := utils.IsGroupJID(evt.Info.Chat.String())
	if isGroup && !agent.AllowGroups {
		return
	}
	if !isGroup && evt.Info.Chat.Server != types.DefaultUserServer {
		return
	}

	// Dedup: if this message ID is already being processed (WA retransmit), skip it.
	msgKey := deviceID + ":" + evt.Info.ID
	if _, alreadyProcessing := llmActiveMessages.LoadOrStore(msgKey, struct{}{}); alreadyProcessing {
		log.Debugf("LLM agent: duplicate message %s on device %s — skipping", evt.Info.ID, deviceID)
		return
	}

	go func() {
		defer llmActiveMessages.Delete(msgKey)

		// Acquire semaphore slot — blocks if llmMaxConcurrent goroutines are already running.
		llmSemaphore <- struct{}{}
		defer func() { <-llmSemaphore }()

		replyCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		messages := buildLLMMessages(replyCtx, chatStorageRepo, deviceID, evt.Info.Chat.String(), agent, userText)

		responseText, err := callLLMAPI(replyCtx, agent, messages)
		if err != nil {
			log.Errorf("LLM agent: error calling LLM for device %s: %v", deviceID, err)
			return
		}

		recipientJID := utils.FormatJID(evt.Info.Sender.String())

		msgID, err := sendAgentAction(replyCtx, client, agent, recipientJID, responseText)
		if err != nil {
			log.Errorf("LLM agent: failed to send reply for device %s: %v", deviceID, err)
			return
		}

		if chatStorageRepo != nil {
			senderJID := ""
			if client.Store.ID != nil {
				senderJID = client.Store.ID.String()
			}
			// Store the text answer (not the raw JSON) for history
			storedText := responseText
			if agent.StructuredOutput {
				if ar, ok := parseAgentResponse(responseText); ok {
					storedText = ar.Answer
				}
			}
			if err := chatStorageRepo.StoreSentMessageWithContext(
				replyCtx,
				msgID,
				senderJID,
				recipientJID.String(),
				storedText,
				time.Now(),
			); err != nil {
				log.Warnf("LLM agent: failed to store reply message: %v", err)
			}
		}

		log.Infof("LLM agent: replied to %s on device %s", evt.Info.Sender.String(), deviceID)
	}()
}

// sendAgentAction routes the LLM response to the correct WhatsApp send method.
// When StructuredOutput is enabled it parses the JSON; otherwise sends plain text.
// Returns the sent message ID.
func sendAgentAction(ctx context.Context, client *whatsmeow.Client, agent *domainChatStorage.DeviceAgent, recipientJID types.JID, responseText string) (string, error) {
	if !agent.StructuredOutput {
		resp, err := client.SendMessage(ctx, recipientJID, &waE2E.Message{Conversation: proto.String(responseText)})
		if err != nil {
			return "", err
		}
		return resp.ID, nil
	}

	ar, ok := parseAgentResponse(responseText)
	if !ok {
		// Fallback: send raw text if JSON parse fails
		log.Warnf("LLM agent: failed to parse structured JSON response, falling back to raw text")
		resp, err := client.SendMessage(ctx, recipientJID, &waE2E.Message{Conversation: proto.String(responseText)})
		if err != nil {
			return "", err
		}
		return resp.ID, nil
	}

	log.Infof("LLM agent: structured action=%s confidence=%.2f", ar.Action, ar.Confidence)

	switch ar.Action {
	case "send_image":
		if ar.MediaURL != "" {
			msgID, err := sendAgentImage(ctx, client, recipientJID, ar.MediaURL, ar.Answer)
			if err != nil {
				log.Warnf("LLM agent: failed to send image (%v), falling back to text", err)
				resp, err2 := client.SendMessage(ctx, recipientJID, &waE2E.Message{Conversation: proto.String(ar.Answer)})
				if err2 != nil {
					return "", err2
				}
				return resp.ID, nil
			}
			return msgID, nil
		}
	case "send_file":
		if ar.MediaURL != "" {
			msgID, err := sendAgentFile(ctx, client, recipientJID, ar.MediaURL, ar.Answer)
			if err != nil {
				log.Warnf("LLM agent: failed to send file (%v), falling back to text", err)
				resp, err2 := client.SendMessage(ctx, recipientJID, &waE2E.Message{Conversation: proto.String(ar.Answer)})
				if err2 != nil {
					return "", err2
				}
				return resp.ID, nil
			}
			return msgID, nil
		}
	}

	// Default: send_text (or unknown action, or missing media_url)
	resp, err := client.SendMessage(ctx, recipientJID, &waE2E.Message{Conversation: proto.String(ar.Answer)})
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// sendAgentImage downloads imageURL, uploads to WhatsApp, and sends an ImageMessage.
func sendAgentImage(ctx context.Context, client *whatsmeow.Client, recipient types.JID, imageURL, caption string) (string, error) {
	data, _, err := downloadURL(ctx, imageURL)
	if err != nil {
		return "", fmt.Errorf("download image: %w", err)
	}

	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaImage)
	if err != nil {
		return "", fmt.Errorf("upload image: %w", err)
	}

	mimeType := http.DetectContentType(data)
	msg := &waE2E.Message{ImageMessage: &waE2E.ImageMessage{
		URL:           proto.String(uploaded.URL),
		DirectPath:    proto.String(uploaded.DirectPath),
		MediaKey:      uploaded.MediaKey,
		Mimetype:      proto.String(mimeType),
		FileEncSHA256: uploaded.FileEncSHA256,
		FileSHA256:    uploaded.FileSHA256,
		FileLength:    proto.Uint64(uint64(len(data))),
		Caption:       proto.String(caption),
	}}

	resp, err := client.SendMessage(ctx, recipient, msg)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// sendAgentFile downloads fileURL, uploads to WhatsApp, and sends a DocumentMessage.
func sendAgentFile(ctx context.Context, client *whatsmeow.Client, recipient types.JID, fileURL, caption string) (string, error) {
	data, contentType, err := downloadURL(ctx, fileURL)
	if err != nil {
		return "", fmt.Errorf("download file: %w", err)
	}

	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaDocument)
	if err != nil {
		return "", fmt.Errorf("upload file: %w", err)
	}

	fileName := path.Base(fileURL)
	if idx := strings.Index(fileName, "?"); idx != -1 {
		fileName = fileName[:idx] // strip query string
	}
	if fileName == "" || fileName == "." {
		fileName = "file"
	}

	if contentType == "" {
		contentType = http.DetectContentType(data)
	}

	msg := &waE2E.Message{DocumentMessage: &waE2E.DocumentMessage{
		URL:           proto.String(uploaded.URL),
		DirectPath:    proto.String(uploaded.DirectPath),
		MediaKey:      uploaded.MediaKey,
		Mimetype:      proto.String(contentType),
		Title:         proto.String(fileName),
		FileName:      proto.String(fileName),
		FileEncSHA256: uploaded.FileEncSHA256,
		FileSHA256:    uploaded.FileSHA256,
		FileLength:    proto.Uint64(uint64(len(data))),
		Caption:       proto.String(caption),
	}}

	resp, err := client.SendMessage(ctx, recipient, msg)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// downloadURL fetches a URL and returns the body bytes and Content-Type.
func downloadURL(ctx context.Context, rawURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("HTTP %d fetching %s", resp.StatusCode, rawURL)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	ct := resp.Header.Get("Content-Type")
	return data, ct, nil
}

// parseAgentResponse tries to extract an agentResponse from the LLM output.
// It handles optional ```json ... ``` markdown fences.
func parseAgentResponse(raw string) (agentResponse, bool) {
	text := strings.TrimSpace(raw)

	// Strip markdown code fence if present
	if strings.HasPrefix(text, "```") {
		if end := strings.LastIndex(text, "```"); end > 3 {
			text = strings.TrimSpace(text[strings.Index(text, "\n")+1 : end])
		}
	}

	// Find the first '{' in case there is leading text
	if start := strings.Index(text, "{"); start > 0 {
		text = text[start:]
	}
	if end := strings.LastIndex(text, "}"); end >= 0 && end < len(text)-1 {
		text = text[:end+1]
	}

	var ar agentResponse
	if err := json.Unmarshal([]byte(text), &ar); err != nil {
		return agentResponse{}, false
	}
	if ar.Answer == "" {
		return agentResponse{}, false
	}
	if ar.Action == "" {
		ar.Action = "send_text"
	}
	return ar, true
}

// buildLLMMessages constructs the messages array for the LLM request.
// If agent.ContextMessages > 0, it fetches the last N messages from storage
// and prepends them as conversation history before the current user message.
func buildLLMMessages(ctx context.Context, repo domainChatStorage.IChatStorageRepository, deviceID, chatJID string, agent *domainChatStorage.DeviceAgent, currentText string) []llmMessage {
	messages := []llmMessage{}

	systemPrompt := agent.SystemPrompt
	if agent.StructuredOutput {
		systemPrompt += jsonSystemSuffix
	}

	if systemPrompt != "" {
		messages = append(messages, llmMessage{Role: "system", Content: systemPrompt})
	}

	if agent.ContextMessages > 0 {
		history, err := repo.GetMessages(&domainChatStorage.MessageFilter{
			DeviceID: deviceID,
			ChatJID:  chatJID,
			Limit:    agent.ContextMessages,
		})
		if err != nil {
			log.Warnf("LLM agent: failed to fetch message history: %v", err)
		} else {
			// GetMessages returns DESC (newest first) — reverse for chronological order
			for i := len(history) - 1; i >= 0; i-- {
				msg := history[i]
				if msg.Content == "" {
					continue
				}
				role := "user"
				if msg.IsFromMe {
					role = "assistant"
				}
				messages = append(messages, llmMessage{Role: role, Content: msg.Content})
			}
		}
	}

	messages = append(messages, llmMessage{Role: "user", Content: currentText})
	return messages
}

func extractTextFromEvent(evt *events.Message) string {
	innerMsg := utils.UnwrapMessage(evt.Message)

	if conv := innerMsg.GetConversation(); conv != "" {
		return conv
	}
	if ext := innerMsg.GetExtendedTextMessage(); ext != nil && ext.GetText() != "" {
		return ext.GetText()
	}
	// Handle edited messages
	if proto := innerMsg.GetProtocolMessage(); proto != nil {
		if edited := proto.GetEditedMessage(); edited != nil {
			if conv := edited.GetConversation(); conv != "" {
				return conv
			}
			if ext := edited.GetExtendedTextMessage(); ext != nil {
				return ext.GetText()
			}
		}
	}
	return ""
}

func callLLMAPI(ctx context.Context, agent *domainChatStorage.DeviceAgent, messages []llmMessage) (string, error) {
	if isClaudeNative(agent) {
		return callClaudeAPI(ctx, agent, messages)
	}
	return callOpenAICompatAPI(ctx, agent, messages)
}

// callOpenAICompatAPI handles OpenAI-compatible endpoints (OpenAI, Groq, Ollama, etc.).
func callOpenAICompatAPI(ctx context.Context, agent *domainChatStorage.DeviceAgent, messages []llmMessage) (string, error) {
	req := llmRequest{
		Model:    agent.Model,
		Messages: messages,
	}

	// Always send temperature — 0.0 is valid (deterministic mode).
	t := agent.Temperature
	req.Temperature = &t

	if agent.MaxTokens != 0 {
		m := agent.MaxTokens
		req.MaxTokens = &m
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	endpoint := strings.TrimRight(agent.APIURL, "/") + "/chat/completions"

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if agent.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+agent.APIKey)
	}

	resp, err := llmHTTPClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("LLM returned status %d: %s", resp.StatusCode, string(rawBody))
	}

	var llmResp llmResponse
	if err := json.Unmarshal(rawBody, &llmResp); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if len(llmResp.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	if llmResp.Usage.TotalTokens > 0 {
		log.Infof("LLM tokens: prompt=%d completion=%d total=%d",
			llmResp.Usage.PromptTokens, llmResp.Usage.CompletionTokens, llmResp.Usage.TotalTokens)
	}

	return strings.TrimSpace(llmResp.Choices[0].Message.Content), nil
}

// callClaudeAPI handles the native Anthropic Messages API.
func callClaudeAPI(ctx context.Context, agent *domainChatStorage.DeviceAgent, messages []llmMessage) (string, error) {
	// Separate system message from the conversation (Claude treats it as a top-level field).
	var systemPrompt string
	var userMessages []llmMessage
	for _, m := range messages {
		if m.Role == "system" {
			systemPrompt = m.Content
		} else {
			userMessages = append(userMessages, m)
		}
	}

	maxTokens := agent.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 1024 // Claude requires max_tokens; use a sensible default
	}

	req := claudeRequest{
		Model:     agent.Model,
		MaxTokens: maxTokens,
		System:    systemPrompt,
		Messages:  userMessages,
	}

	// Always send temperature — 0.0 is valid (deterministic mode).
	// Claude caps at 1.0; if the user configured above that, clamp it.
	temp := agent.Temperature
	if temp > 1.0 {
		temp = 1.0
		log.Warnf("LLM agent: Claude temperature capped from %.2f to 1.0", agent.Temperature)
	}
	req.Temperature = &temp

	reqBody, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("marshal claude request: %w", err)
	}

	endpoint := strings.TrimRight(agent.APIURL, "/") + "/messages"

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("create claude request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	if agent.APIKey != "" {
		httpReq.Header.Set("x-api-key", agent.APIKey)
	}

	resp, err := llmHTTPClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("http request (claude): %w", err)
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var claudeErr claudeResponse
		_ = json.Unmarshal(rawBody, &claudeErr)
		msg := fmt.Sprintf("Claude returned status %d", resp.StatusCode)
		if claudeErr.Error != nil && claudeErr.Error.Message != "" {
			msg = claudeErr.Error.Message
		}
		return "", fmt.Errorf("%s", msg)
	}

	var claudeResp claudeResponse
	if err := json.Unmarshal(rawBody, &claudeResp); err != nil {
		return "", fmt.Errorf("parse claude response: %w", err)
	}

	for _, block := range claudeResp.Content {
		if block.Type == "text" && block.Text != "" {
			log.Infof("LLM tokens (claude): input=%d output=%d",
				claudeResp.Usage.InputTokens, claudeResp.Usage.OutputTokens)
			return strings.TrimSpace(block.Text), nil
		}
	}

	return "", fmt.Errorf("Claude returned no text content")
}
