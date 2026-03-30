package rest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	domainChatStorage "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/chatstorage"
	"github.com/aldinokemal/go-whatsapp-web-multidevice/pkg/utils"
	"github.com/gofiber/fiber/v2"
)

type DeviceWebhookHandler struct {
	repo domainChatStorage.IChatStorageRepository
}

func InitRestDeviceWebhook(app fiber.Router, repo domainChatStorage.IChatStorageRepository) {
	h := &DeviceWebhookHandler{repo: repo}
	app.Get("/devices/:device_id/webhook", h.GetWebhook)
	app.Post("/devices/:device_id/webhook", h.UpsertWebhook)
	app.Delete("/devices/:device_id/webhook", h.DeleteWebhook)
	app.Post("/devices/:device_id/webhook/test", h.TestWebhook)
}

func (h *DeviceWebhookHandler) GetWebhook(c *fiber.Ctx) error {
	deviceID := c.Params("device_id")
	wh, err := h.repo.GetDeviceWebhook(deviceID)
	utils.PanicIfNeeded(err)

	if wh == nil {
		return c.JSON(utils.ResponseData{
			Status:  200,
			Code:    "SUCCESS",
			Message: "No webhook configured",
			Results: nil,
		})
	}

	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Device webhook",
		Results: wh,
	})
}

func (h *DeviceWebhookHandler) UpsertWebhook(c *fiber.Ctx) error {
	deviceID := c.Params("device_id")

	var req struct {
		URL     string `json:"url"`
		Enabled *bool  `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "Invalid request body",
		})
	}

	if req.URL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "url is required",
		})
	}

	if _, err := url.ParseRequestURI(req.URL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "url is not a valid URL",
		})
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	wh := &domainChatStorage.DeviceWebhook{
		DeviceID: deviceID,
		URL:      req.URL,
		Enabled:  enabled,
	}

	utils.PanicIfNeeded(h.repo.UpsertDeviceWebhook(wh))

	saved, err := h.repo.GetDeviceWebhook(deviceID)
	utils.PanicIfNeeded(err)

	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Device webhook saved",
		Results: saved,
	})
}

func (h *DeviceWebhookHandler) DeleteWebhook(c *fiber.Ctx) error {
	deviceID := c.Params("device_id")
	utils.PanicIfNeeded(h.repo.DeleteDeviceWebhook(deviceID))

	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Device webhook removed",
		Results: nil,
	})
}

func (h *DeviceWebhookHandler) TestWebhook(c *fiber.Ctx) error {
	deviceID := c.Params("device_id")

	// Accept optional URL override in body; otherwise use saved webhook URL
	var req struct {
		URL string `json:"url"`
	}
	_ = c.BodyParser(&req)

	targetURL := req.URL
	if targetURL == "" {
		wh, err := h.repo.GetDeviceWebhook(deviceID)
		utils.PanicIfNeeded(err)
		if wh == nil || wh.URL == "" {
			return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
				Status:  400,
				Code:    "BAD_REQUEST",
				Message: "No webhook configured for this device",
			})
		}
		targetURL = wh.URL
	}

	if _, err := url.ParseRequestURI(targetURL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: "Invalid webhook URL",
		})
	}

	payload := map[string]any{
		"event":     "webhook.test",
		"device_id": deviceID,
		"payload": map[string]any{
			"message":   "GOWA webhook test",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		},
	}

	body, _ := json.Marshal(payload)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(body))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(utils.ResponseData{
			Status:  500,
			Code:    "ERROR",
			Message: fmt.Sprintf("Failed to create request: %v", err),
		})
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return c.JSON(utils.ResponseData{
			Status:  200,
			Code:    "WEBHOOK_UNREACHABLE",
			Message: fmt.Sprintf("Webhook did not respond: %v", err),
		})
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return c.JSON(utils.ResponseData{
			Status:  200,
			Code:    "SUCCESS",
			Message: fmt.Sprintf("Webhook responded with status %d", resp.StatusCode),
		})
	}

	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "WEBHOOK_ERROR",
		Message: fmt.Sprintf("Webhook responded with error status %d", resp.StatusCode),
	})
}
