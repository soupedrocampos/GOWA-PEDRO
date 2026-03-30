package rest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	domainChatStorage "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/chatstorage"
	"github.com/aldinokemal/go-whatsapp-web-multidevice/pkg/utils"
	"github.com/gofiber/fiber/v2"
)

type DeviceAgentHandler struct {
	repo domainChatStorage.IChatStorageRepository
}

func InitRestDeviceAgent(app fiber.Router, repo domainChatStorage.IChatStorageRepository) {
	h := &DeviceAgentHandler{repo: repo}
	app.Get("/devices/:device_id/agent", h.GetAgent)
	app.Post("/devices/:device_id/agent", h.UpsertAgent)
	app.Delete("/devices/:device_id/agent", h.DeleteAgent)
	app.Post("/devices/:device_id/agent/test", h.TestAgent)
}

// deviceAgentResponse is the safe GET payload — api_key is masked.
type deviceAgentResponse struct {
	DeviceID        string  `json:"device_id"`
	Provider        string  `json:"provider"`
	APIURL          string  `json:"api_url"`
	APIKeySet       bool    `json:"api_key_set"`
	APIKeyMasked    string  `json:"api_key_masked,omitempty"`
	Model           string  `json:"model"`
	SystemPrompt    string  `json:"system_prompt"`
	Enabled         bool    `json:"enabled"`
	Temperature     float64 `json:"temperature"`
	MaxTokens       int     `json:"max_tokens"`
	ContextMessages int     `json:"context_messages"`
	AllowGroups     bool    `json:"allow_groups"`
	StructuredOutput bool   `json:"structured_output"`
}

func maskAPIKey(key string) string {
	if len(key) <= 8 {
		return "****"
	}
	return key[:4] + strings.Repeat("*", len(key)-8) + key[len(key)-4:]
}

func toAgentResponse(agent *domainChatStorage.DeviceAgent) deviceAgentResponse {
	r := deviceAgentResponse{
		DeviceID:        agent.DeviceID,
		Provider:        agent.Provider,
		APIURL:          agent.APIURL,
		APIKeySet:       agent.APIKey != "",
		Model:           agent.Model,
		SystemPrompt:    agent.SystemPrompt,
		Enabled:         agent.Enabled,
		Temperature:     agent.Temperature,
		MaxTokens:       agent.MaxTokens,
		ContextMessages: agent.ContextMessages,
		AllowGroups:     agent.AllowGroups,
		StructuredOutput: agent.StructuredOutput,
	}
	if agent.APIKey != "" {
		r.APIKeyMasked = maskAPIKey(agent.APIKey)
	}
	return r
}

func (h *DeviceAgentHandler) GetAgent(c *fiber.Ctx) error {
	deviceID := c.Params("device_id")
	agent, err := h.repo.GetDeviceAgent(deviceID)
	utils.PanicIfNeeded(err)

	if agent == nil {
		return c.JSON(utils.ResponseData{
			Status:  200,
			Code:    "SUCCESS",
			Message: "No agent configured",
			Results: nil,
		})
	}

	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Device agent",
		Results: toAgentResponse(agent),
	})
}

func (h *DeviceAgentHandler) UpsertAgent(c *fiber.Ctx) error {
	deviceID := c.Params("device_id")

	var req struct {
		Provider        string   `json:"provider"`
		APIURL          string   `json:"api_url"`
		APIKey          string   `json:"api_key"`
		Model           string   `json:"model"`
		SystemPrompt    string   `json:"system_prompt"`
		Enabled         *bool    `json:"enabled"`
		Temperature     *float64 `json:"temperature"`
		MaxTokens       *int     `json:"max_tokens"`
		ContextMessages  *int     `json:"context_messages"`
		AllowGroups      *bool    `json:"allow_groups"`
		StructuredOutput *bool    `json:"structured_output"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "Invalid request body",
		})
	}

	if req.APIURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "api_url is required",
		})
	}
	if _, err := url.ParseRequestURI(req.APIURL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "api_url is not a valid URL",
		})
	}
	if req.Model == "" {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "model is required",
		})
	}
	if req.Provider == "" {
		req.Provider = "custom"
	}

	// Preserve existing API key when the request sends an empty string
	// (frontend no longer has the plain key after the GET response was masked).
	resolvedAPIKey := req.APIKey
	if resolvedAPIKey == "" {
		existing, _ := h.repo.GetDeviceAgent(deviceID)
		if existing != nil {
			resolvedAPIKey = existing.APIKey
		}
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	temperature := 0.7
	if req.Temperature != nil {
		temperature = *req.Temperature
	}

	maxTokens := 0
	if req.MaxTokens != nil {
		maxTokens = *req.MaxTokens
	}

	contextMessages := 10
	if req.ContextMessages != nil {
		contextMessages = *req.ContextMessages
	}

	allowGroups := false
	if req.AllowGroups != nil {
		allowGroups = *req.AllowGroups
	}

	structuredOutput := false
	if req.StructuredOutput != nil {
		structuredOutput = *req.StructuredOutput
	}

	agent := &domainChatStorage.DeviceAgent{
		DeviceID:        deviceID,
		Provider:        req.Provider,
		APIURL:          req.APIURL,
		APIKey:          resolvedAPIKey,
		Model:           req.Model,
		SystemPrompt:    req.SystemPrompt,
		Enabled:         enabled,
		Temperature:     temperature,
		MaxTokens:       maxTokens,
		ContextMessages: contextMessages,
		AllowGroups:      allowGroups,
		StructuredOutput: structuredOutput,
	}

	utils.PanicIfNeeded(h.repo.UpsertDeviceAgent(agent))

	saved, err := h.repo.GetDeviceAgent(deviceID)
	utils.PanicIfNeeded(err)

	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Device agent saved",
		Results: toAgentResponse(saved),
	})
}

func (h *DeviceAgentHandler) DeleteAgent(c *fiber.Ctx) error {
	deviceID := c.Params("device_id")
	utils.PanicIfNeeded(h.repo.DeleteDeviceAgent(deviceID))

	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Device agent removed",
		Results: nil,
	})
}

func (h *DeviceAgentHandler) TestAgent(c *fiber.Ctx) error {
	deviceID := c.Params("device_id")

	var req struct {
		APIURL   string `json:"api_url"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
		Provider string `json:"provider"`
	}
	_ = c.BodyParser(&req)

	// Fall back to saved config when fields are not provided
	provider := req.Provider
	apiURL := req.APIURL
	apiKey := req.APIKey
	model := req.Model

	if apiURL == "" {
		agent, err := h.repo.GetDeviceAgent(deviceID)
		utils.PanicIfNeeded(err)
		if agent == nil {
			return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
				Status:  400,
				Code:    "BAD_REQUEST",
				Message: "No agent configured for this device",
			})
		}
		provider = agent.Provider
		apiURL = agent.APIURL
		apiKey = agent.APIKey
		model = agent.Model
	}

	if _, err := url.ParseRequestURI(apiURL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "Invalid api_url",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	testPrompt := "Respond with exactly the word OK and nothing else."

	claudeNative := strings.EqualFold(provider, "claude") || strings.Contains(apiURL, "anthropic.com")

	var (
		httpReq  *http.Request
		endpoint string
	)

	if claudeNative {
		type claudeMsg struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}
		type claudeReq struct {
			Model     string      `json:"model"`
			MaxTokens int         `json:"max_tokens"`
			Messages  []claudeMsg `json:"messages"`
		}
		payload := claudeReq{
			Model:     model,
			MaxTokens: 64,
			Messages:  []claudeMsg{{Role: "user", Content: testPrompt}},
		}
		body, _ := json.Marshal(payload)
		endpoint = strings.TrimRight(apiURL, "/") + "/messages"
		var err error
		httpReq, err = http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return c.JSON(utils.ResponseData{Status: 200, Code: "ERROR", Message: fmt.Sprintf("Failed to create request: %v", err)})
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("anthropic-version", "2023-06-01")
		if apiKey != "" {
			httpReq.Header.Set("x-api-key", apiKey)
		}
	} else {
		type llmMsg struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}
		type llmReq struct {
			Model    string   `json:"model"`
			Messages []llmMsg `json:"messages"`
		}
		payload := llmReq{
			Model:    model,
			Messages: []llmMsg{{Role: "user", Content: testPrompt}},
		}
		body, _ := json.Marshal(payload)
		endpoint = strings.TrimRight(apiURL, "/") + "/chat/completions"
		var err error
		httpReq, err = http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return c.JSON(utils.ResponseData{Status: 200, Code: "ERROR", Message: fmt.Sprintf("Failed to create request: %v", err)})
		}
		httpReq.Header.Set("Content-Type", "application/json")
		if apiKey != "" {
			httpReq.Header.Set("Authorization", "Bearer "+apiKey)
		}
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return c.JSON(utils.ResponseData{
			Status:  200,
			Code:    "LLM_UNREACHABLE",
			Message: fmt.Sprintf("LLM did not respond: %v", err),
		})
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		type errBody struct {
			Error *struct{ Message string `json:"message"` } `json:"error"`
		}
		var eb errBody
		_ = json.Unmarshal(rawBody, &eb)
		msg := fmt.Sprintf("LLM returned status %d", resp.StatusCode)
		if eb.Error != nil && eb.Error.Message != "" {
			msg = eb.Error.Message
		}
		return c.JSON(utils.ResponseData{Status: 200, Code: "LLM_ERROR", Message: msg})
	}

	// Parse response — Claude and OpenAI-compat have different shapes
	var replyText string
	if claudeNative {
		type claudeResp struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		}
		var cr claudeResp
		if err := json.Unmarshal(rawBody, &cr); err != nil {
			return c.JSON(utils.ResponseData{Status: 200, Code: "LLM_ERROR", Message: "Failed to parse Claude response"})
		}
		for _, block := range cr.Content {
			if block.Type == "text" {
				replyText = strings.TrimSpace(block.Text)
				break
			}
		}
	} else {
		type openAIResp struct {
			Choices []struct {
				Message struct{ Content string `json:"content"` } `json:"message"`
			} `json:"choices"`
		}
		var or openAIResp
		if err := json.Unmarshal(rawBody, &or); err != nil {
			return c.JSON(utils.ResponseData{Status: 200, Code: "LLM_ERROR", Message: "Failed to parse LLM response"})
		}
		if len(or.Choices) == 0 {
			return c.JSON(utils.ResponseData{Status: 200, Code: "LLM_ERROR", Message: "LLM returned no choices"})
		}
		replyText = strings.TrimSpace(or.Choices[0].Message.Content)
	}

	if replyText == "" {
		return c.JSON(utils.ResponseData{Status: 200, Code: "LLM_ERROR", Message: "LLM returned empty response"})
	}

	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: fmt.Sprintf("LLM responded: %s", replyText),
	})
}
