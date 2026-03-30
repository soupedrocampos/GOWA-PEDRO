package rest

import (
	"strconv"

	domainChatStorage "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/chatstorage"
	"github.com/aldinokemal/go-whatsapp-web-multidevice/pkg/utils"
	"github.com/gofiber/fiber/v2"
)

type AgentTemplateHandler struct {
	repo domainChatStorage.IChatStorageRepository
}

func InitRestAgentTemplate(app fiber.Router, repo domainChatStorage.IChatStorageRepository) {
	h := &AgentTemplateHandler{repo: repo}
	app.Get("/agent-templates", h.List)
	app.Post("/agent-templates", h.Create)
	app.Put("/agent-templates/:id", h.Update)
	app.Delete("/agent-templates/:id", h.Delete)
}

func (h *AgentTemplateHandler) List(c *fiber.Ctx) error {
	provider := c.Query("provider")
	templates, err := h.repo.ListAgentTemplates(provider)
	utils.PanicIfNeeded(err)

	if templates == nil {
		templates = []*domainChatStorage.AgentTemplate{}
	}
	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Agent templates",
		Results: templates,
	})
}

func (h *AgentTemplateHandler) Create(c *fiber.Ctx) error {
	var req struct {
		Name             string   `json:"name"`
		Description      string   `json:"description"`
		Provider         string   `json:"provider"`
		APIURL           string   `json:"api_url"`
		APIKey           string   `json:"api_key"`
		Model            string   `json:"model"`
		SystemPrompt     string   `json:"system_prompt"`
		Temperature      *float64 `json:"temperature"`
		MaxTokens        *int     `json:"max_tokens"`
		ContextMessages  *int     `json:"context_messages"`
		AllowGroups      *bool    `json:"allow_groups"`
		StructuredOutput *bool    `json:"structured_output"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{Status: 400, Code: "BAD_REQUEST", Message: "Invalid body"})
	}
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{Status: 400, Code: "BAD_REQUEST", Message: "name is required"})
	}
	if req.APIURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{Status: 400, Code: "BAD_REQUEST", Message: "api_url is required"})
	}
	if req.Model == "" {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{Status: 400, Code: "BAD_REQUEST", Message: "model is required"})
	}
	if req.Provider == "" {
		req.Provider = "custom"
	}

	t := &domainChatStorage.AgentTemplate{
		Name:         req.Name,
		Description:  req.Description,
		Provider:     req.Provider,
		APIURL:       req.APIURL,
		APIKey:       req.APIKey,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
	}
	if req.Temperature != nil {
		t.Temperature = *req.Temperature
	} else {
		t.Temperature = 0.7
	}
	if req.MaxTokens != nil {
		t.MaxTokens = *req.MaxTokens
	}
	if req.ContextMessages != nil {
		t.ContextMessages = *req.ContextMessages
	} else {
		t.ContextMessages = 10
	}
	if req.AllowGroups != nil {
		t.AllowGroups = *req.AllowGroups
	}
	if req.StructuredOutput != nil {
		t.StructuredOutput = *req.StructuredOutput
	}

	utils.PanicIfNeeded(h.repo.CreateAgentTemplate(t))
	return c.JSON(utils.ResponseData{Status: 200, Code: "SUCCESS", Message: "Template created", Results: t})
}

func (h *AgentTemplateHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{Status: 400, Code: "BAD_REQUEST", Message: "Invalid id"})
	}

	existing, err := h.repo.GetAgentTemplate(id)
	utils.PanicIfNeeded(err)
	if existing == nil {
		return c.Status(fiber.StatusNotFound).JSON(utils.ResponseData{Status: 404, Code: "NOT_FOUND", Message: "Template not found"})
	}

	var req struct {
		Name             string   `json:"name"`
		Description      string   `json:"description"`
		Provider         string   `json:"provider"`
		APIURL           string   `json:"api_url"`
		APIKey           string   `json:"api_key"`
		Model            string   `json:"model"`
		SystemPrompt     string   `json:"system_prompt"`
		Temperature      *float64 `json:"temperature"`
		MaxTokens        *int     `json:"max_tokens"`
		ContextMessages  *int     `json:"context_messages"`
		AllowGroups      *bool    `json:"allow_groups"`
		StructuredOutput *bool    `json:"structured_output"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{Status: 400, Code: "BAD_REQUEST", Message: "Invalid body"})
	}

	if req.Name != "" {
		existing.Name = req.Name
	}
	existing.Description = req.Description
	if req.Provider != "" {
		existing.Provider = req.Provider
	}
	if req.APIURL != "" {
		existing.APIURL = req.APIURL
	}
	existing.APIKey = req.APIKey
	if req.Model != "" {
		existing.Model = req.Model
	}
	existing.SystemPrompt = req.SystemPrompt
	if req.Temperature != nil {
		existing.Temperature = *req.Temperature
	}
	if req.MaxTokens != nil {
		existing.MaxTokens = *req.MaxTokens
	}
	if req.ContextMessages != nil {
		existing.ContextMessages = *req.ContextMessages
	}
	if req.AllowGroups != nil {
		existing.AllowGroups = *req.AllowGroups
	}
	if req.StructuredOutput != nil {
		existing.StructuredOutput = *req.StructuredOutput
	}

	utils.PanicIfNeeded(h.repo.UpdateAgentTemplate(existing))
	return c.JSON(utils.ResponseData{Status: 200, Code: "SUCCESS", Message: "Template updated", Results: existing})
}

func (h *AgentTemplateHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{Status: 400, Code: "BAD_REQUEST", Message: "Invalid id"})
	}
	utils.PanicIfNeeded(h.repo.DeleteAgentTemplate(id))
	return c.JSON(utils.ResponseData{Status: 200, Code: "SUCCESS", Message: "Template deleted"})
}
