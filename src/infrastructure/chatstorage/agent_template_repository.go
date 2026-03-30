package chatstorage

import (
	"database/sql"
	"time"

	domainChatStorage "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/chatstorage"
)

func (r *SQLiteRepository) ListAgentTemplates(provider string) ([]*domainChatStorage.AgentTemplate, error) {
	query := `
		SELECT id, name, description, provider, api_url, api_key, model, system_prompt,
		       temperature, max_tokens, context_messages, allow_groups, structured_output,
		       created_at, updated_at
		FROM agent_templates`
	args := []any{}
	if provider != "" {
		query += ` WHERE provider = ?`
		args = append(args, provider)
	}
	query += ` ORDER BY name ASC`

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []*domainChatStorage.AgentTemplate
	for rows.Next() {
		t := &domainChatStorage.AgentTemplate{}
		if err := rows.Scan(
			&t.ID, &t.Name, &t.Description, &t.Provider, &t.APIURL, &t.APIKey, &t.Model, &t.SystemPrompt,
			&t.Temperature, &t.MaxTokens, &t.ContextMessages, &t.AllowGroups, &t.StructuredOutput,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}
	return templates, rows.Err()
}

func (r *SQLiteRepository) GetAgentTemplate(id int64) (*domainChatStorage.AgentTemplate, error) {
	row := r.db.QueryRow(`
		SELECT id, name, description, provider, api_url, api_key, model, system_prompt,
		       temperature, max_tokens, context_messages, allow_groups, structured_output,
		       created_at, updated_at
		FROM agent_templates WHERE id = ?`, id)

	t := &domainChatStorage.AgentTemplate{}
	err := row.Scan(
		&t.ID, &t.Name, &t.Description, &t.Provider, &t.APIURL, &t.APIKey, &t.Model, &t.SystemPrompt,
		&t.Temperature, &t.MaxTokens, &t.ContextMessages, &t.AllowGroups, &t.StructuredOutput,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return t, err
}

func (r *SQLiteRepository) CreateAgentTemplate(t *domainChatStorage.AgentTemplate) error {
	now := time.Now()
	t.CreatedAt = now
	t.UpdatedAt = now
	result, err := r.db.Exec(`
		INSERT INTO agent_templates
		  (name, description, provider, api_url, api_key, model, system_prompt,
		   temperature, max_tokens, context_messages, allow_groups, structured_output,
		   created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.Name, t.Description, t.Provider, t.APIURL, t.APIKey, t.Model, t.SystemPrompt,
		t.Temperature, t.MaxTokens, t.ContextMessages, t.AllowGroups, t.StructuredOutput,
		t.CreatedAt, t.UpdatedAt,
	)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err == nil {
		t.ID = id
	}
	return err
}

func (r *SQLiteRepository) UpdateAgentTemplate(t *domainChatStorage.AgentTemplate) error {
	t.UpdatedAt = time.Now()
	_, err := r.db.Exec(`
		UPDATE agent_templates
		SET name = ?, description = ?, provider = ?, api_url = ?, api_key = ?, model = ?,
		    system_prompt = ?, temperature = ?, max_tokens = ?, context_messages = ?,
		    allow_groups = ?, structured_output = ?, updated_at = ?
		WHERE id = ?`,
		t.Name, t.Description, t.Provider, t.APIURL, t.APIKey, t.Model,
		t.SystemPrompt, t.Temperature, t.MaxTokens, t.ContextMessages,
		t.AllowGroups, t.StructuredOutput, t.UpdatedAt, t.ID,
	)
	return err
}

func (r *SQLiteRepository) DeleteAgentTemplate(id int64) error {
	_, err := r.db.Exec(`DELETE FROM agent_templates WHERE id = ?`, id)
	return err
}
