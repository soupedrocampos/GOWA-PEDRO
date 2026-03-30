package chatstorage

import (
	"database/sql"
	"time"

	domainChatStorage "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/chatstorage"
)

func (r *SQLiteRepository) GetDeviceWebhook(deviceID string) (*domainChatStorage.DeviceWebhook, error) {
	row := r.db.QueryRow(`
		SELECT device_id, url, enabled, created_at, updated_at
		FROM device_webhooks
		WHERE device_id = ?
	`, deviceID)

	wh := &domainChatStorage.DeviceWebhook{}
	err := row.Scan(&wh.DeviceID, &wh.URL, &wh.Enabled, &wh.CreatedAt, &wh.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return wh, nil
}

func (r *SQLiteRepository) UpsertDeviceWebhook(webhook *domainChatStorage.DeviceWebhook) error {
	now := time.Now()
	webhook.UpdatedAt = now

	result, err := r.db.Exec(`
		UPDATE device_webhooks SET url = ?, enabled = ?, updated_at = ?
		WHERE device_id = ?
	`, webhook.URL, webhook.Enabled, webhook.UpdatedAt, webhook.DeviceID)
	if err != nil {
		return err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		webhook.CreatedAt = now
		_, err = r.db.Exec(`
			INSERT INTO device_webhooks (device_id, url, enabled, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`, webhook.DeviceID, webhook.URL, webhook.Enabled, webhook.CreatedAt, webhook.UpdatedAt)
	}
	return err
}

func (r *SQLiteRepository) DeleteDeviceWebhook(deviceID string) error {
	_, err := r.db.Exec(`DELETE FROM device_webhooks WHERE device_id = ?`, deviceID)
	return err
}
