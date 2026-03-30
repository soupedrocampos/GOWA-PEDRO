export default {
    name: 'AgentTemplates',
    props: {
        compact: { type: Boolean, default: false },
    },
    data() {
        return {
            templates: [],
            loading: false,
            saving: false,
            showForm: false,
            editingId: null,
            form: this.blankForm(),
            filterProvider: '',
            providers: ['ollama', 'openai', 'groq', 'grok', 'gemini', 'claude', 'custom'],
            providerLabels: {
                ollama: '🦙 Meta / Llama', openai: '🤖 ChatGPT', groq: '⚡ Groq',
                grok: '🔥 Grok (xAI)', gemini: '♊ Gemini', claude: '🧠 Claude', custom: '⚙️ Custom',
            },
            providerPresets: {
                ollama:  { api_url: 'http://localhost:11434/v1', model: 'llama3.2',               api_key: '' },
                openai:  { api_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini',           api_key: '' },
                groq:    { api_url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', api_key: '' },
                grok:    { api_url: 'https://api.x.ai/v1', model: 'grok-3-mini',                api_key: '' },
                gemini:  { api_url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', api_key: '' },
                claude:  { api_url: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5-20251001', api_key: '' },
                custom:  { api_url: '', model: '',               api_key: '' },
            },
        };
    },
    computed: {
        filteredTemplates() {
            if (!this.filterProvider) return this.templates;
            return this.templates.filter(t => t.provider === this.filterProvider);
        },
        providerColors() {
            return {
                ollama: '#21ba45', openai: '#10a37f', groq: '#f2711c',
                grok: '#000000', gemini: '#4285f4', claude: '#d97706', custom: '#a333c8',
            };
        },
    },
    mounted() {
        this.load();
    },
    methods: {
        blankForm() {
            return {
                name: '', description: '', provider: 'ollama',
                api_url: 'http://localhost:11434/v1', api_key: '', model: 'llama3.2',
                system_prompt: '', temperature: 0.7, max_tokens: 0,
                context_messages: 10, allow_groups: false, structured_output: false,
            };
        },
        providerLabel(p) {
            return this.providerLabels[p] || p;
        },
        getModelsForProvider(provider) {
            const models = {
                ollama:  [
                    { id: 'llama3.2',           label: 'Llama 3.2 (3B)' },
                    { id: 'llama3.1',           label: 'Llama 3.1 (8B)' },
                    { id: 'llama4-scout',       label: 'Llama 4 Scout (Multimodal)' },
                    { id: 'mistral',            label: 'Mistral 7B' },
                    { id: 'gemma2',             label: 'Gemma 2 (9B)' },
                    { id: 'qwen2.5',            label: 'Qwen 2.5' },
                    { id: 'deepseek-r1',        label: 'DeepSeek R1 (Raciocínio)' },
                    { id: 'llava',              label: 'LLaVA (Visão)' },
                    { id: 'phi3',               label: 'Phi-3 Mini' },
                ],
                openai:  [
                    { id: 'gpt-4.1',        label: 'GPT-4.1 ★ Recomendado' },
                    { id: 'gpt-4.1-mini',   label: 'GPT-4.1 Mini 💰' },
                    { id: 'gpt-4o',         label: 'GPT-4o' },
                    { id: 'gpt-4o-mini',    label: 'GPT-4o Mini' },
                    { id: 'o3-mini',        label: 'o3-mini (Math/Code)' },
                    { id: 'o3',             label: 'o3 (Máximo)' },
                ],
                groq:    [
                    { id: 'llama-3.3-70b-versatile',          label: 'Llama 3.3 70B ★' },
                    { id: 'llama4-scout-17b-16e-instruct',     label: 'Llama 4 Scout' },
                    { id: 'llama-3.1-8b-instant',              label: 'Llama 3.1 8B ⚡' },
                    { id: 'deepseek-r1-distill-llama-70b',     label: 'DeepSeek R1 70B' },
                    { id: 'mixtral-8x7b-32768',                label: 'Mixtral 8x7B' },
                    { id: 'compound-beta',                     label: 'Compound Beta (Agente)' },
                ],
                grok:    [
                    { id: 'grok-3',             label: 'Grok 3 ★' },
                    { id: 'grok-3-mini',        label: 'Grok 3 Mini ★' },
                    { id: 'grok-3-fast',        label: 'Grok 3 Fast ⚡' },
                    { id: 'grok-3-mini-fast',   label: 'Grok 3 Mini Fast 💰' },
                    { id: 'grok-2-1212',        label: 'Grok 2 (2M ctx)' },
                ],
                gemini:  [
                    { id: 'gemini-2.5-pro',         label: 'Gemini 2.5 Pro ★ (1M ctx)' },
                    { id: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash ★' },
                    { id: 'gemini-2.5-flash-lite',   label: 'Gemini 2.5 Flash Lite 💰' },
                    { id: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash' },
                    { id: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash' },
                    { id: 'gemini-1.5-pro',          label: 'Gemini 1.5 Pro' },
                ],
                claude:  [
                    { id: 'claude-opus-4-6',            label: 'Claude Opus 4 ★' },
                    { id: 'claude-sonnet-4-6',           label: 'Claude Sonnet 4 ★' },
                    { id: 'claude-haiku-4-5-20251001',   label: 'Claude Haiku 4 ⚡' },
                    { id: 'claude-3-5-sonnet-20241022',  label: 'Claude 3.5 Sonnet' },
                    { id: 'claude-3-5-haiku-20241022',   label: 'Claude 3.5 Haiku 💰' },
                ],
            };
            return models[provider] || [];
        },
        async load() {
            this.loading = true;
            try {
                const res = await window.http.get('/agent-templates');
                this.templates = res.data.results || [];
            } catch {
                this.templates = [];
            } finally {
                this.loading = false;
            }
        },
        openNew() {
            this.editingId = null;
            this.form = this.blankForm();
            this.showForm = true;
            this.$nextTick(() => {
                const el = this.$el.querySelector('.tpl-form-anchor');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        },
        openEdit(tpl) {
            this.editingId = tpl.id;
            this.form = {
                name: tpl.name,
                description: tpl.description || '',
                provider: tpl.provider,
                api_url: tpl.api_url,
                api_key: tpl.api_key || '',
                model: tpl.model,
                system_prompt: tpl.system_prompt || '',
                temperature: tpl.temperature ?? 0.7,
                max_tokens: tpl.max_tokens ?? 0,
                context_messages: tpl.context_messages ?? 10,
                allow_groups: tpl.allow_groups ?? false,
                structured_output: tpl.structured_output ?? false,
            };
            this.showForm = true;
            this.$nextTick(() => {
                const el = this.$el.querySelector('.tpl-form-anchor');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        },
        cancelForm() {
            this.showForm = false;
            this.editingId = null;
        },
        applyProviderPreset(provider) {
            this.form.provider = provider;
            const p = this.providerPresets[provider] || {};
            if (p.api_url) this.form.api_url = p.api_url;
            if (p.model)   this.form.model   = p.model;
        },
        async save() {
            if (!this.form.name.trim())    { showErrorInfo('Name is required'); return; }
            if (!this.form.api_url.trim()) { showErrorInfo('API URL is required'); return; }
            if (!this.form.model.trim())   { showErrorInfo('Model is required'); return; }

            this.saving = true;
            const payload = {
                name:             this.form.name.trim(),
                description:      this.form.description,
                provider:         this.form.provider,
                api_url:          this.form.api_url.trim(),
                api_key:          this.form.api_key.trim(),
                model:            this.form.model.trim(),
                system_prompt:    this.form.system_prompt,
                temperature:      parseFloat(this.form.temperature) || 0.7,
                max_tokens:       parseInt(this.form.max_tokens) || 0,
                context_messages: parseInt(this.form.context_messages) || 10,
                allow_groups:     this.form.allow_groups,
                structured_output: this.form.structured_output,
            };
            try {
                if (this.editingId) {
                    await window.http.put(`/agent-templates/${this.editingId}`, payload);
                    showSuccessInfo('Template updated!');
                } else {
                    await window.http.post('/agent-templates', payload);
                    showSuccessInfo('Template created!');
                }
                this.showForm = false;
                this.editingId = null;
                await this.load();
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Failed to save template');
            } finally {
                this.saving = false;
            }
        },
        async remove(tpl) {
            if (!confirm(`Delete template "${tpl.name}"?`)) return;
            try {
                await window.http.delete(`/agent-templates/${tpl.id}`);
                showSuccessInfo('Template deleted');
                await this.load();
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Failed to delete');
            }
        },
        providerColor(p) {
            return this.providerColors[p] || '#888';
        },
    },
    template: `
<div>

    <!-- ─── COMPACT SIDEBAR MODE ─────────────────────────────────── -->
    <template v-if="compact">

        <!-- Sidebar intro -->
        <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%); border-radius:12px; padding:14px 16px; margin-bottom:14px; color:#fff">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px">
                <i class="layer group icon" style="font-size:1.1em; margin:0"></i>
                <span style="font-weight:700; font-size:0.95rem">Modelos de Agente</span>
            </div>
            <p style="margin:0; font-size:0.78rem; opacity:.9; line-height:1.4">
                Biblioteca reutilizável de configurações LLM. Ao configurar um dispositivo,
                escolha um modelo abaixo para pré-preencher os campos automaticamente.
            </p>
        </div>

        <!-- Provider filter pills (compact) -->
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px">
            <button class="ui mini button"
                    :style="filterProvider==='' ? {background:'#4b5563',color:'#fff',borderRadius:'16px',fontSize:'0.72em'} : {borderRadius:'16px',fontSize:'0.72em'}"
                    @click="filterProvider=''">Todos</button>
            <button v-for="p in providers" :key="p" class="ui mini button"
                    :style="filterProvider===p ? {background: providerColor(p), color:'#fff', borderRadius:'16px',fontSize:'0.72em'} : {borderRadius:'16px',fontSize:'0.72em'}"
                    @click="filterProvider = filterProvider===p ? '' : p"
                    >{{ providerLabel(p) }}</button>
        </div>

        <!-- New template anchor -->
        <div class="tpl-form-anchor"></div>

        <!-- Inline form (compact) -->
        <div v-if="showForm" style="background:#fff; border:2px solid #6366f1; border-radius:10px; padding:14px; margin-bottom:12px">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px">
                <span style="font-weight:700; color:#4f46e5; font-size:0.9rem">{{ editingId ? 'Editar Modelo' : 'Novo Modelo' }}</span>
                <button class="ui mini button" @click="cancelForm"><i class="times icon"></i></button>
            </div>

            <!-- Provider -->
            <div style="margin-bottom:10px">
                <div style="font-size:0.72em; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px">Provedor</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px">
                    <button v-for="p in providers" :key="p" class="ui mini button"
                            :style="form.provider===p
                                ? {background: providerColor(p), color:'#fff', fontWeight:'700', borderRadius:'10px', border:'none'}
                                : {background:'#f3f4f6', color:'#4b5563', borderRadius:'10px', border:'none'}"
                            @click="applyProviderPreset(p)">{{ providerLabel(p) }}</button>
                </div>
            </div>

            <div class="ui form" style="font-size:0.85em">
                <div class="field" style="margin-bottom:8px">
                    <label style="font-size:0.85em">Nome *</label>
                    <input type="text" v-model="form.name" placeholder="Ex: Atendimento PT" style="padding:6px 8px" />
                </div>
                <div class="field" style="margin-bottom:8px">
                    <label style="font-size:0.85em">Descrição</label>
                    <input type="text" v-model="form.description" placeholder="Breve descrição" style="padding:6px 8px" />
                </div>
                <div class="two fields" style="margin-bottom:8px">
                    <div class="field">
                        <label style="font-size:0.85em">API URL *</label>
                        <input type="url" v-model="form.api_url" style="padding:6px 8px" />
                    </div>
                    <div class="field">
                        <label style="font-size:0.85em">Modelo *</label>
                        <select v-if="form.provider !== 'custom'"
                                style="width:100%;border:1px solid rgba(34,36,38,.15);border-radius:.285rem;padding:6px 8px;outline:none;background:#fff;font-size:0.9em"
                                v-model="form.model">
                            <option v-for="m in getModelsForProvider(form.provider)" :key="m.id" :value="m.id">{{ m.label }}</option>
                        </select>
                        <input v-else type="text" v-model="form.model" style="padding:6px 8px" placeholder="model-name" />
                    </div>
                </div>
                <div class="field" v-if="form.provider !== 'ollama'" style="margin-bottom:8px">
                    <label style="font-size:0.85em">API Key</label>
                    <input type="password" v-model="form.api_key" placeholder="sk-..." style="padding:6px 8px" />
                </div>
                <div class="field" style="margin-bottom:8px">
                    <label style="font-size:0.85em">System Prompt</label>
                    <textarea rows="3" v-model="form.system_prompt" placeholder="Você é um assistente..." style="padding:6px 8px; font-size:0.9em"></textarea>
                </div>
                <div class="three fields" style="margin-bottom:8px">
                    <div class="field">
                        <label style="font-size:0.8em">Histórico</label>
                        <input type="number" min="0" max="50" v-model="form.context_messages" style="padding:6px 8px" />
                    </div>
                    <div class="field">
                        <label style="font-size:0.8em">Temp.</label>
                        <input type="number" min="0" max="2" step="0.1" v-model="form.temperature" style="padding:6px 8px" />
                    </div>
                    <div class="field">
                        <label style="font-size:0.8em">Max Tokens</label>
                        <input type="number" min="0" v-model="form.max_tokens" style="padding:6px 8px" />
                    </div>
                </div>
                <div style="display:flex; gap:12px; margin-bottom:10px">
                    <label style="display:flex; align-items:center; gap:5px; font-size:0.82em; cursor:pointer">
                        <input type="checkbox" v-model="form.allow_groups" /> Grupos
                    </label>
                    <label style="display:flex; align-items:center; gap:5px; font-size:0.82em; cursor:pointer">
                        <input type="checkbox" v-model="form.structured_output" /> JSON
                    </label>
                </div>
            </div>

            <div style="display:flex; gap:6px">
                <button class="ui mini primary button" :class="{loading: saving}" @click="save">
                    <i class="save icon"></i> {{ editingId ? 'Atualizar' : 'Criar' }}
                </button>
                <button class="ui mini button" @click="cancelForm">Cancelar</button>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="ui active inline loader" style="margin:20px auto; display:block; text-align:center"></div>

        <!-- Empty state (compact) -->
        <div v-else-if="filteredTemplates.length === 0 && !showForm"
             style="text-align:center; padding:20px; color:#9ca3af; border:2px dashed #e5e7eb; border-radius:10px; font-size:0.85rem">
            <i class="layer group icon" style="display:block; font-size:1.8em; margin-bottom:8px; color:#d1d5db"></i>
            Nenhum modelo ainda.
        </div>

        <!-- Compact template list -->
        <div v-else style="display:flex; flex-direction:column; gap:8px">
            <div v-for="tpl in filteredTemplates" :key="tpl.id"
                 style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,.05); transition:box-shadow .15s"
                 @mouseenter="$event.currentTarget.style.boxShadow='0 3px 10px rgba(0,0,0,.10)'"
                 @mouseleave="$event.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,.05)'">

                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:6px">
                    <div style="flex:1; min-width:0">
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; flex-wrap:wrap">
                            <span :style="{background: providerColor(tpl.provider), color:'#fff', borderRadius:'10px', padding:'1px 8px', fontSize:'0.7em', fontWeight:'700', textTransform:'capitalize', whiteSpace:'nowrap'}">
                                {{ tpl.provider }}
                            </span>
                            <span v-if="tpl.structured_output"
                                  style="background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; border-radius:6px; padding:0px 5px; font-size:0.68em; font-weight:600">
                                JSON
                            </span>
                            <span v-if="tpl.allow_groups"
                                  style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; border-radius:6px; padding:0px 5px; font-size:0.68em; font-weight:600">
                                grupos
                            </span>
                        </div>
                        <div style="font-weight:700; font-size:0.88rem; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">{{ tpl.name }}</div>
                        <div v-if="tpl.description" style="font-size:0.76em; color:#6b7280; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">{{ tpl.description }}</div>
                        <div style="font-size:0.74em; color:#9ca3af; margin-top:4px">
                            <span style="font-family:monospace; color:#6366f1">{{ tpl.model }}</span>
                            <span style="margin-left:6px">T={{ tpl.temperature }}</span>
                            <span v-if="tpl.context_messages > 0" style="margin-left:4px">hist={{ tpl.context_messages }}</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:4px; flex-shrink:0; margin-top:2px">
                        <button class="ui mini icon button" @click="openEdit(tpl)" title="Editar">
                            <i class="pencil icon"></i>
                        </button>
                        <button class="ui mini icon red button" @click="remove(tpl)" title="Excluir">
                            <i class="trash icon"></i>
                        </button>
                    </div>
                </div>

                <div v-if="tpl.system_prompt" style="margin-top:7px; padding-top:7px; border-top:1px solid #f3f4f6; font-size:0.74em; color:#9ca3af; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                    "{{ tpl.system_prompt }}"
                </div>
            </div>
        </div>

        <!-- Add button (bottom) -->
        <div style="margin-top:12px">
            <button class="ui fluid mini primary button" @click="openNew" :disabled="showForm"
                    style="border-radius:8px">
                <i class="plus icon"></i> Novo Modelo
            </button>
        </div>

    </template>

    <!-- ─── FULL PAGE MODE ────────────────────────────────────────── -->
    <template v-else>

        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; flex-wrap:wrap; gap:10px">
            <div>
                <h3 style="margin:0; font-size:1.1rem; font-weight:700; color:#1f2937">
                    <i class="layer group icon" style="color:#6366f1"></i> Modelos de Agente
                </h3>
                <p style="margin:4px 0 0; color:#6b7280; font-size:0.85rem">
                    Biblioteca reutilizável de configurações de LLM. Personalize a inteligência de cada número.
                </p>
            </div>
        </div>

        <!-- Provider filter pills -->
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px">
            <button class="ui tiny button"
                    :style="filterProvider==='' ? {background:'#4b5563', color:'#fff', borderRadius:'20px'} : {borderRadius:'20px'}"
                    @click="filterProvider=''">All</button>
            <button v-for="p in providers" :key="p" class="ui tiny button"
                    :style="filterProvider===p ? {background: providerColor(p), color:'#fff', borderRadius:'20px'} : {borderRadius:'20px'}"
                    @click="filterProvider = filterProvider===p ? '' : p"
                    >{{ providerLabel(p) }}</button>
        </div>

        <!-- FORM (inline) -->
        <div class="tpl-form-anchor"></div>
        <div v-if="showForm" style="background:#fff; border:2px solid #6366f1; border-radius:12px; padding:20px; margin-bottom:20px">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px">
                <h4 style="margin:0; color:#4f46e5">{{ editingId ? 'Edit Template' : 'New Template' }}</h4>
                <button class="ui mini button" @click="cancelForm"><i class="times icon"></i> Cancel</button>
            </div>

            <!-- Provider selector -->
            <div style="margin-bottom:14px">
                <div style="font-size:0.8em; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px">Provider</div>
                <div style="display:flex; flex-wrap:wrap; gap:5px">
                    <button v-for="p in providers" :key="p" class="ui small button"
                            :style="form.provider===p
                                ? {background: providerColor(p), color:'#fff', fontWeight:'700', boxShadow: '0 4px 10px rgba(0,0,0,0.1)'}
                                : {background: '#f3f4f6', color: '#4b5563'}"
                            @click="applyProviderPreset(p)"
                            style="border-radius:12px; border:none">{{ providerLabel(p) }}</button>
                </div>
            </div>

            <div class="ui form">
                <div class="two fields">
                    <div class="field">
                        <label>Template Name *</label>
                        <input type="text" v-model="form.name" placeholder="e.g. Support Agent PT" />
                    </div>
                    <div class="field">
                        <label>Description</label>
                        <input type="text" v-model="form.description" placeholder="Short description" />
                    </div>
                </div>
                <div class="two fields">
                    <div class="field">
                        <label>API URL *</label>
                        <input type="url" v-model="form.api_url" placeholder="http://localhost:11434/v1" />
                    </div>
                    <div class="field">
                        <label>Modelo *</label>
                        <select v-if="form.provider !== 'custom'"
                                style="width:100%;border:1px solid rgba(34,36,38,.15);border-radius:.285rem;padding:.62em;outline:none;background:#fff"
                                v-model="form.model">
                            <option v-for="m in getModelsForProvider(form.provider)" :key="m.id" :value="m.id">{{ m.label }}</option>
                        </select>
                        <input v-else type="text" v-model="form.model" placeholder="model-name" />
                    </div>
                </div>
                <div class="field" v-if="form.provider !== 'ollama'">
                    <label>API Key</label>
                    <input type="password" v-model="form.api_key" placeholder="sk-..." />
                </div>
                <div class="field">
                    <label>System Prompt</label>
                    <textarea rows="4" v-model="form.system_prompt" placeholder="You are a helpful assistant..."></textarea>
                </div>
                <div class="three fields">
                    <div class="field">
                        <label>History (msgs) <span style="font-weight:normal;color:#888">(0=stateless)</span></label>
                        <input type="number" min="0" max="50" v-model="form.context_messages" />
                    </div>
                    <div class="field">
                        <label>Temperature</label>
                        <input type="number" min="0" max="2" step="0.1" v-model="form.temperature" />
                    </div>
                    <div class="field">
                        <label>Max Tokens <span style="font-weight:normal;color:#888">(0=no limit)</span></label>
                        <input type="number" min="0" v-model="form.max_tokens" />
                    </div>
                </div>
                <div class="three fields">
                    <div class="field">
                        <div class="ui toggle checkbox">
                            <input type="checkbox" v-model="form.allow_groups" />
                            <label>Reply in groups</label>
                        </div>
                    </div>
                    <div class="field">
                        <div class="ui toggle checkbox">
                            <input type="checkbox" v-model="form.structured_output" />
                            <label>Structured output (JSON)</label>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:8px; margin-top:20px; padding-top:15px; border-top:1px solid #eee">
                <button class="ui primary button" :class="{loading: saving}" @click="save">
                    <i class="save icon"></i> {{ editingId ? 'Update Template' : 'Create Template' }}
                </button>
                <button class="ui button" @click="cancelForm">Cancel</button>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="ui active centered inline loader" style="margin:30px auto;display:block"></div>

        <!-- Template cards grid -->
        <div v-else style="display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px">

            <!-- Create New Card -->
            <div v-if="!showForm" @click="openNew"
                 style="background:#f9fafb; border:2px dashed #d1d5db; border-radius:12px; padding:24px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; color:#6b7280; transition:all 0.2s; min-height:190px"
                 onmouseover="this.style.background='#f3f4f6'; this.style.borderColor='#6366f1'; this.style.color='#4f46e5'"
                 onmouseout="this.style.background='#f9fafb'; this.style.borderColor='#d1d5db'; this.style.color='#6b7280'">
                <i class="plus circle icon" style="font-size:2.5em; margin-bottom:12px"></i>
                <div style="font-weight:700; font-size:1.05rem">Criar Novo Modelo</div>
                <div style="font-size:0.85em; text-align:center; opacity:0.8; margin-top:4px">Configure do zero ou escolha um provedor</div>
            </div>

            <div v-for="tpl in filteredTemplates" :key="tpl.id"
                 style="background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:20px; position:relative; box-shadow:0 2px 6px rgba(0,0,0,.04); transition: box-shadow .15s; display:flex; flex-direction:column; min-height:190px"
                 @mouseenter="$event.currentTarget.style.boxShadow='0 6px 16px rgba(0,0,0,.1)'"
                 @mouseleave="$event.currentTarget.style.boxShadow='0 2px 6px rgba(0,0,0,.04)'">

                <!-- Provider badge -->
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px">
                    <span :style="{background: providerColor(tpl.provider), color:'#fff', borderRadius:'12px', padding:'2px 10px', fontSize:'0.75em', fontWeight:'700', textTransform:'capitalize'}">
                        {{ tpl.provider }}
                    </span>
                    <span v-if="tpl.structured_output"
                          style="background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; border-radius:8px; padding:1px 7px; font-size:0.72em; font-weight:600">
                        JSON
                    </span>
                    <span v-if="tpl.allow_groups"
                          style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; border-radius:8px; padding:1px 7px; font-size:0.72em; font-weight:600">
                        grupos
                    </span>
                </div>

                <div style="font-weight:700; font-size:1rem; color:#1f2937; margin-bottom:4px">{{ tpl.name }}</div>
                <div v-if="tpl.description" style="font-size:0.82em; color:#6b7280; margin-bottom:8px">{{ tpl.description }}</div>

                <div style="font-size:0.8em; color:#374151; background:#f9fafb; border-radius:6px; padding:6px 10px; margin-bottom:10px">
                    <span style="font-family:monospace; color:#6366f1">{{ tpl.model }}</span>
                    <span style="margin-left:8px; color:#9ca3af">T={{ tpl.temperature }}</span>
                    <span v-if="tpl.context_messages > 0" style="margin-left:6px; color:#9ca3af">hist={{ tpl.context_messages }}</span>
                </div>

                <div v-if="tpl.system_prompt" style="font-size:0.78em; color:#6b7280; font-style:italic; margin-bottom:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%">
                    "{{ tpl.system_prompt }}"
                </div>

                <div style="display:flex; gap:6px">
                    <button class="ui mini button" @click="openEdit(tpl)">
                        <i class="pencil icon"></i> Editar
                    </button>
                    <button class="ui mini red button" @click="remove(tpl)">
                        <i class="trash icon"></i> Remover
                    </button>
                </div>
            </div>
        </div>

    </template>
</div>
`
};
