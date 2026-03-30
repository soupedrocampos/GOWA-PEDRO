package chatstorage

import (
	"database/sql"
	"time"

	domainChatStorage "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/chatstorage"
)

func (r *SQLiteRepository) GetDeviceAgent(deviceID string) (*domainChatStorage.DeviceAgent, error) {
	row := r.db.QueryRow(`
		SELECT device_id, provider, api_url, api_key, model, system_prompt, enabled,
		       temperature, max_tokens, context_messages, allow_groups, structured_output,
		       created_at, updated_at
		FROM device_agents
		WHERE device_id = ?
	`, deviceID)

	a := &domainChatStorage.DeviceAgent{}
	err := row.Scan(
		&a.DeviceID, &a.Provider, &a.APIURL, &a.APIKey, &a.Model, &a.SystemPrompt, &a.Enabled,
		&a.Temperature, &a.MaxTokens, &a.ContextMessages, &a.AllowGroups, &a.StructuredOutput,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return a, nil
}

func (r *SQLiteRepository) UpsertDeviceAgent(agent *domainChatStorage.DeviceAgent) error {
	now := time.Now()
	agent.UpdatedAt = now

	result, err := r.db.Exec(`
		UPDATE device_agents
		SET provider = ?, api_url = ?, api_key = ?, model = ?, system_prompt = ?, enabled = ?,
		    temperature = ?, max_tokens = ?, context_messages = ?, allow_groups = ?, structured_output = ?,
		    updated_at = ?
		WHERE device_id = ?
	`, agent.Provider, agent.APIURL, agent.APIKey, agent.Model, agent.SystemPrompt, agent.Enabled,
		agent.Temperature, agent.MaxTokens, agent.ContextMessages, agent.AllowGroups, agent.StructuredOutput,
		agent.UpdatedAt, agent.DeviceID)
	if err != nil {
		return err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		agent.CreatedAt = now
		_, err = r.db.Exec(`
			INSERT INTO device_agents
			  (device_id, provider, api_url, api_key, model, system_prompt, enabled,
			   temperature, max_tokens, context_messages, allow_groups, structured_output,
			   created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, agent.DeviceID, agent.Provider, agent.APIURL, agent.APIKey, agent.Model, agent.SystemPrompt, agent.Enabled,
			agent.Temperature, agent.MaxTokens, agent.ContextMessages, agent.AllowGroups, agent.StructuredOutput,
			agent.CreatedAt, agent.UpdatedAt)
	}
	return err
}

func (r *SQLiteRepository) DeleteDeviceAgent(deviceID string) error {
	_, err := r.db.Exec(`DELETE FROM device_agents WHERE device_id = ?`, deviceID)
	return err
}
