export default {
    name: 'AgentManager',
    props: {
        deviceList: { type: Array, default: () => [] }
    },
    data() {
        return {
            agentState:      {},   // deviceId → { agent, loading, saving, testing, testResult, testMessage }
            selectedDevice:  null, // highlighted device card
            configuringDevice: null, // device whose config panel is open
            panelForm: this.blankForm(),
            panelTemplates: [],       // templates loaded for the panel's selected provider
            loadingTemplates: false,
            selectedTemplateId: null, // null = custom
        };
    },
    computed: {
        sortedDeviceList() {
            if (!this.selectedDevice) return this.deviceList;
            const sel = this.deviceList.find(d => (d.id || d.device) === this.selectedDevice);
            const rest = this.deviceList.filter(d => (d.id || d.device) !== this.selectedDevice);
            return sel ? [sel, ...rest] : this.deviceList;
        },
        providerColors() {
            return {
                ollama: '#21ba45', openai: '#10a37f', groq: '#f2711c',
                grok: '#000000', gemini: '#4285f4', claude: '#d97706', custom: '#a333c8',
            };
        },
        providerLabel() {
            return {
                ollama: 'Meta / Llama', openai: 'ChatGPT', groq: 'Groq',
                grok: 'Grok (xAI)', gemini: 'Gemini', claude: 'Claude', custom: 'Custom',
            };
        },
        providerEmoji() {
            return {
                ollama: '🦙', openai: '🤖', groq: '⚡',
                grok: '🔥', gemini: '♊', claude: '🧠', custom: '⚙️',
            };
        },
        panelProviderColor() {
            return this.providerColors[this.panelForm.provider] || '#888';
        },
        availableProviders() {
            return ['ollama','openai','groq','grok','gemini','claude','custom'];
        },

    },
    watch: {
        deviceList: {
            immediate: true,
            handler(list) {
                if (Array.isArray(list)) {
                    list.forEach(dev => {
                        const id = dev.id || dev.device;
                        if (!this.agentState[id]) this.loadAgent(id);
                    });
                }
            }
        }
    },
    methods: {
        blankForm() {
            return {
                provider: 'ollama',
                api_url: 'http://localhost:11434/v1',
                api_key: '',
                model: 'llama3.2',
                system_prompt: '',
                enabled: true,
                temperature: 0.7,
                max_tokens: 0,
                context_messages: 10,
                allow_groups: false,
                structured_output: false,
            };
        },
        ag(deviceId) {
            return this.agentState[deviceId] || { agent: null, loading: false, saving: false, testing: false, testResult: null, testMessage: '' };
        },
        async loadAgent(deviceId) {
            this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), loading: true } };
            try {
                const res = await window.http.get(`/devices/${deviceId}/agent`);
                const agent = res.data.results || null;
                this.agentState = { ...this.agentState, [deviceId]: { agent, loading: false, saving: false, testing: false, testResult: null, testMessage: '' } };
            } catch {
                this.agentState = { ...this.agentState, [deviceId]: { agent: null, loading: false, saving: false, testing: false, testResult: null, testMessage: '' } };
            }
        },

        // ── Device card click (highlight / deselect)
        selectDevice(deviceId) {
            this.selectedDevice = this.selectedDevice === deviceId ? null : deviceId;
        },

        // ── Open inline config panel for a device
        async openConfig(deviceId) {
            this.configuringDevice = deviceId;
            this.selectedTemplateId = null;
            const ag = this.ag(deviceId);
            if (ag.agent) {
                // Pre-fill from existing agent
                // api_key is NOT pre-filled — GET returns only api_key_masked for safety.
                // Leave blank = keep existing key on the server.
                const a = ag.agent;
                this.panelForm = {
                    provider: a.provider || 'ollama',
                    api_url: a.api_url || '',
                    api_key: '',  // intentionally blank; backend preserves existing key when empty
                    _api_key_set: a.api_key_set || false,
                    _api_key_masked: a.api_key_masked || '',
                    model: a.model || '',
                    system_prompt: a.system_prompt || '',
                    enabled: a.enabled !== false,
                    temperature: a.temperature ?? 0.7,
                    max_tokens: a.max_tokens ?? 0,
                    context_messages: a.context_messages ?? 10,
                    allow_groups: a.allow_groups ?? false,
                    structured_output: a.structured_output ?? false,
                };
            } else {
                this.panelForm = this.blankForm();
            }
            await this.loadTemplatesForProvider(this.panelForm.provider);
            // scroll panel into view
            this.$nextTick(() => {
                const el = document.getElementById('agent-config-panel');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        },
        closeConfig() {
            this.configuringDevice = null;
            this.selectedTemplateId = null;
            this.panelTemplates = [];
        },

        // ── Provider preset in panel
        async applyProviderPreset(provider) {
            const presets = {
                ollama:  { api_url: 'http://localhost:11434/v1', model: 'llama3.2',                  api_key: '' },
                openai:  { api_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini',              api_key: '' },
                groq:    { api_url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', api_key: '' },
                grok:    { api_url: 'https://api.x.ai/v1', model: 'grok-3-mini',                   api_key: '' },
                gemini:  { api_url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', api_key: '' },
                claude:  { api_url: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5-20251001', api_key: '' },
                custom:  { api_url: '', model: '', api_key: '' },
            };
            const p = presets[provider] || {};
            this.panelForm.provider = provider;
            if (p.api_url) this.panelForm.api_url = p.api_url;
            if (p.model)   this.panelForm.model   = p.model;
            this.panelForm.api_key = '';
            this.selectedTemplateId = null;
            await this.loadTemplatesForProvider(provider);
        },

        async loadTemplatesForProvider(provider) {
            this.loadingTemplates = true;
            try {
                const res = await window.http.get(`/agent-templates?provider=${provider}`);
                this.panelTemplates = res.data.results || [];
            } catch {
                this.panelTemplates = [];
            } finally {
                this.loadingTemplates = false;
            }
        },

        // ── Apply a template to the panel form
        applyTemplate(tpl) {
            this.selectedTemplateId = tpl.id;
            this.panelForm = {
                provider:         tpl.provider,
                api_url:          tpl.api_url,
                api_key:          tpl.api_key || '',
                model:            tpl.model,
                system_prompt:    tpl.system_prompt || '',
                enabled:          true,
                temperature:      tpl.temperature ?? 0.7,
                max_tokens:       tpl.max_tokens ?? 0,
                context_messages: tpl.context_messages ?? 10,
                allow_groups:     tpl.allow_groups ?? false,
                structured_output: tpl.structured_output ?? false,
            };
        },
        clearTemplate() {
            this.selectedTemplateId = null;
        },

        // ── Save / Remove / Test
        async saveAgent() {
            const deviceId = this.configuringDevice;
            const form = this.panelForm;
            if (!form.api_url.trim()) { showErrorInfo('Please enter the API URL'); return; }
            if (!form.model.trim())   { showErrorInfo('Please enter the model'); return; }

            this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), saving: true, testResult: null } };
            try {
                await window.http.post(`/devices/${deviceId}/agent`, {
                    provider:         form.provider,
                    api_url:          form.api_url.trim(),
                    api_key:          form.api_key.trim(),
                    model:            form.model.trim(),
                    system_prompt:    form.system_prompt,
                    enabled:          form.enabled,
                    temperature:      parseFloat(form.temperature) || 0.7,
                    max_tokens:       parseInt(form.max_tokens) || 0,
                    context_messages: parseInt(form.context_messages) || 0,
                    allow_groups:     form.allow_groups,
                    structured_output: form.structured_output,
                });
                showSuccessInfo('Agent saved!');
                await this.loadAgent(deviceId);
                this.closeConfig();
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Failed to save agent');
                this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), saving: false } };
            }
        },
        async removeAgent() {
            const deviceId = this.configuringDevice;
            if (!confirm('Remove LLM agent from this device?')) return;
            this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), saving: true } };
            try {
                await window.http.delete(`/devices/${deviceId}/agent`);
                showSuccessInfo('Agent removed');
                await this.loadAgent(deviceId);
                this.closeConfig();
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Failed to remove');
                this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), saving: false } };
            }
        },
        async testAgent() {
            const deviceId = this.configuringDevice;
            const form = this.panelForm;
            if (!form.api_url.trim()) { showErrorInfo('Enter the API URL before testing'); return; }
            if (!form.model.trim())   { showErrorInfo('Enter the model before testing'); return; }

            this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), testing: true, testResult: null, testMessage: '' } };
            try {
                const res = await window.http.post(`/devices/${deviceId}/agent/test`, {
                    provider: form.provider,
                    api_url:  form.api_url.trim(),
                    api_key:  form.api_key.trim(),
                    model:    form.model.trim(),
                }, { timeout: 35000 });
                const code = res.data?.code;
                const msg  = res.data?.message || '';
                this.agentState = { ...this.agentState, [deviceId]: {
                    ...this.ag(deviceId), testing: false,
                    testResult: code === 'SUCCESS' ? 'ok' : 'error',
                    testMessage: msg,
                }};
            } catch (e) {
                this.agentState = { ...this.agentState, [deviceId]: {
                    ...this.ag(deviceId), testing: false,
                    testResult: 'error',
                    testMessage: e.response?.data?.message || 'Failed to contact the LLM.',
                }};
            }
        },
        getModelsForProvider(provider) {
            const models = {
                ollama:  ['llama3.2','llama3.1','llama3','llama4-scout','mistral','gemma2','qwen2.5','phi3','deepseek-r1','llava','llama-guard-4-12b'],
                openai:  ['gpt-4.1','gpt-4.1-mini','gpt-4o','gpt-4o-mini','gpt-4-turbo','o1-preview','o1-mini','o3-mini','o3'],
                groq:    ['llama-3.3-70b-versatile','llama-3.1-8b-instant','llama4-scout-17b-16e-instruct','llama4-maverick-17b-128e-instruct','llama-guard-4-12b','mixtral-8x7b-32768','gemma2-9b-it','deepseek-r1-distill-llama-70b','compound-beta','compound-beta-mini'],
                grok:    ['grok-3','grok-3-mini','grok-3-fast','grok-3-mini-fast','grok-2-1212','grok-2-vision-1212'],
                gemini:  ['gemini-2.5-pro','gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.0-flash','gemini-2.0-pro','gemini-1.5-flash','gemini-1.5-pro'],
                claude:  ['claude-opus-4-6','claude-sonnet-4-6','claude-haiku-4-5-20251001','claude-3-5-sonnet-20241022','claude-3-5-haiku-20241022','claude-3-opus-20240229'],
            };
            return models[provider] || [];
        },
        getModelDescription(modelName) {
            if (!modelName) return 'Selecione um modelo para ver detalhes.';
            const desc = {
                // OpenAI / ChatGPT
                'gpt-4.1':                    '⚡ Mais rápido e inteligente (OpenAI). Custo ~$2/1M in',
                'gpt-4.1-mini':               '💰 Menor e bem barato (OpenAI). ~$0.40/1M in | $1.60 out',
                'gpt-4o':                     '🧠 Equilíbrio poder+velocidade (OpenAI). ~$5/1M in',
                'gpt-4o-mini':                '💰 Rápido e barato (OpenAI). ~$0.15/1M in',
                'gpt-4-turbo':                '🔬 Raciocínio complexo (OpenAI). ~$10/1M in',
                'o1-preview':                 '🔬 Raciocínio avançado. ~$15/1M in | $60 out',
                'o1-mini':                    '⚡ Raciocínio rápido. ~$3/1M in | $12 out',
                'o3-mini':                    '🔢 Math/Código. ~$1.10/1M in | $4.40 out',
                'o3':                         '🧠 OpenAI mais poderoso. ~$10/1M in | $40 out',
                // Groq
                'llama-3.3-70b-versatile':      '⚖️ Equilíbrio 70B via Groq. ~$0.59/1M',
                'llama-3.1-8b-instant':         '⚡ Ultrarápido tarefas simples (Groq). ~$0.05/1M',
                'llama4-scout-17b-16e-instruct':'🦙 Llama 4 Scout — Multimodal, contexto longo. Groq',
                'llama4-maverick-17b-128e-instruct':'🦙 Llama 4 Maverick — Alta capacidade. Groq',
                'mixtral-8x7b-32768':           '🔀 Arquitetura MoE eficiente (Groq). ~$0.24/1M',
                'gemma2-9b-it':                 '💡 Google Gemma leve (Groq). ~$0.20/1M',
                'deepseek-r1-distill-llama-70b':'🔬 Raciocínio DeepSeek+Llama (Groq). ~$0.75/1M',
                'llama-guard-4-12b':            '🛡️ Moderação de conteúdo (Meta). Groq',
                'compound-beta':                '🔧 Agente com busca web + execução de código. Groq',
                'compound-beta-mini':           '🔧 Compound menor e mais barato. Groq',
                // Grok / xAI
                'grok-3':                       '🔥 Grok 3 (xAI) — Raciocínio pesado. Dados X/Twitter',
                'grok-3-mini':                  '⚡ Grok 3 Mini — Rápido e eficiente. xAI',
                'grok-3-fast':                  '🚄 Grok 3 Fast — Ultra velocidade. xAI',
                'grok-3-mini-fast':             '🚀 Grok 3 Mini Fast — Mais barato+rápido. xAI',
                'grok-2-1212':                  '🔥 Grok 2 — Contexto 2M tokens! xAI',
                'grok-2-vision-1212':           '🖼️ Grok 2 Vision — Imagem + Texto. xAI',
                // Gemini
                'gemini-2.5-pro':               '♊ Gemini 2.5 Pro — 1M tokens contexto. ~$1.25-5/1M',
                'gemini-2.5-flash':             '⚡ Gemini 2.5 Flash — Custo-benefício. ~$0.15/1M in',
                'gemini-2.5-flash-lite':        '💰 Gemini Flash Lite — O mais barato. ~$0.10/1M in',
                'gemini-2.0-flash':             '⚡ Flash-V2 — Melhor equilíbrio (Google). ~$0.10/1M',
                'gemini-2.0-pro':               '🧠 Raciocínio pesado (Google). ~$5/1M in',
                'gemini-1.5-flash':             '💰 Rápido + barato, 1M ctx. ~$0.075/1M in',
                'gemini-1.5-pro':               '🔬 Contexto enorme (Google). ~$3.50/1M in',
                // Claude
                'claude-opus-4-6':              '🧠 Mais poderoso Anthropic. ~$15/1M in | $75 out',
                'claude-sonnet-4-6':            '⚖️ Inteligência + velocidade (Anthropic). ~$3/1M in',
                'claude-haiku-4-5-20251001':    '⚡ Mais rápido Anthropic. ~$0.25/1M in | $1.25 out',
                'claude-3-5-sonnet-20241022':   '⚖️ Claude 3.5 Sonnet — Excelente código. ~$3/1M in',
                'claude-3-5-haiku-20241022':    '⚡ Claude 3.5 Haiku — Rápido e barato. ~$0.80/1M in',
                'claude-3-opus-20240229':       '🧠 Claude 3 Opus — Raciocínio profundo. ~$15/1M in',
                // Ollama (local)
                'llama3.2':  '🦙 Llama 3.2 local (Meta/Ollama). Grátis',
                'llama3.1':  '🦙 Llama 3.1 local (Meta/Ollama). Grátis',
                'llama4-scout': '🦙 Llama 4 Scout local — Multimodal. Grátis',
                'deepseek-r1': '🔬 DeepSeek R1 raciocínio (Ollama). Grátis',
                'llava':     '🖼️ LLaVA visão+texto (Ollama). Grátis',
                'llama-guard-4-12b': '🛡️ Moderação de conteúdo Meta. Grátis via Ollama',
            };
            return desc[modelName] || 'Modelo local/customizado. Veja preços do provedor.';
        },

        providerColor(p) {
            return this.providerColors[p] || '#888';
        },
        t(key) { return window.i18n ? window.i18n.t(key) : key; },
    },
    template: `
<div>
    <!-- Empty state -->
    <div v-if="deviceList.length === 0" class="ui placeholder segment" style="border-radius:10px; border:2px dashed #d1d5db">
        <div class="ui icon header" style="color:#9ca3af">
            <i class="mobile alternate icon"></i>
            {{ t('agent.nodevices') }}
        </div>
        <p style="color:#6b7280; font-size:0.9rem">{{ t('agent.nodevices.hint') }}</p>
    </div>

    <!-- Device cards -->
    <div v-for="dev in sortedDeviceList" :key="dev.id || dev.device"
         :style="{
             border: selectedDevice === (dev.id || dev.device) ? '2px solid #21ba45' : '1px solid #e0e0e0',
             borderRadius: '8px',
             padding: '14px 16px',
             marginBottom: '10px',
             background: selectedDevice === (dev.id || dev.device) ? '#f0fdf4' : '#fafafa',
             cursor: 'pointer',
             transition: 'border-color .15s, background .15s'
         }"
         @click.self="selectDevice(dev.id || dev.device)">

        <!-- Device header row -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px"
             @click="selectDevice(dev.id || dev.device)">
            <div style="display:flex; align-items:center; gap:10px">
                <i class="mobile alternate icon"
                   :style="{fontSize:'1.3em', color: selectedDevice===(dev.id||dev.device) ? '#21ba45' : '#555'}"></i>
                <div>
                    <div style="font-weight:600; display:flex; align-items:center; gap:6px">
                        {{ dev.id || dev.device }}
                        <span v-if="selectedDevice === (dev.id || dev.device)"
                              style="background:#21ba45;color:#fff;border-radius:8px;padding:1px 7px;font-size:.72em;font-weight:700">
                            ✓ {{ t('agent.device.selected') || 'Selected' }}
                        </span>
                    </div>
                    <div style="font-size:.82em; color:#888; margin-top:2px">
                        <span :style="{color: dev.state==='logged_in' ? '#21ba45' : '#aaa'}">
                            ● {{ dev.state || 'unknown' }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Status + Configure button -->
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap" @click.stop>
                <span v-if="ag(dev.id||dev.device).agent && ag(dev.id||dev.device).agent.enabled"
                      style="background:#21ba45;color:#fff;border-radius:12px;padding:3px 10px;font-size:.78em;font-weight:600">
                    <i class="robot icon"></i> {{ t('agent.status.active') }}
                </span>
                <span v-else-if="ag(dev.id||dev.device).agent && !ag(dev.id||dev.device).agent.enabled"
                      style="background:#f2711c;color:#fff;border-radius:12px;padding:3px 10px;font-size:.78em;font-weight:600">
                    <i class="robot icon"></i> {{ t('agent.status.paused') }}
                </span>
                <span v-else style="background:#e0e0e0;color:#888;border-radius:12px;padding:3px 10px;font-size:.78em">
                    {{ t('agent.status.none') }}
                </span>

                <button class="ui mini button"
                        :class="{
                            loading: ag(dev.id||dev.device).loading,
                            green:   configuringDevice === (dev.id||dev.device),
                            primary: configuringDevice !== (dev.id||dev.device)
                        }"
                        @click.stop="configuringDevice === (dev.id||dev.device) ? closeConfig() : openConfig(dev.id||dev.device)">
                    <i :class="configuringDevice === (dev.id||dev.device) ? 'times icon' : 'cog icon'"></i>
                    {{ configuringDevice === (dev.id||dev.device) ? t('agent.btn.close')||'Close' : t('agent.btn.configure') }}
                </button>
            </div>
        </div>

        <!-- Agent summary -->
        <div v-if="ag(dev.id||dev.device).agent" style="margin-top:10px;font-size:.82em;color:#555;background:#f0f4f8;border-radius:6px;padding:8px 12px" @click.stop>
            <i class="microchip icon"></i>
            <strong>{{ ag(dev.id||dev.device).agent.provider }}</strong>
            · {{ ag(dev.id||dev.device).agent.model }}
            <span style="margin-left:8px;color:#888">{{ ag(dev.id||dev.device).agent.api_url }}</span>
        </div>
    </div>

    <!-- ═══════════════════════════════════════════════════
         INLINE CONFIGURATION PANEL
         ═══════════════════════════════════════════════════ -->
    <div v-if="configuringDevice" id="agent-config-panel"
         style="margin-top:20px; background:#fff; border:2px solid #6366f1; border-radius:14px; overflow:hidden; box-shadow:0 4px 20px rgba(99,102,241,.15)">

        <!-- Panel header -->
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6); padding:14px 20px; display:flex; align-items:center; justify-content:space-between">
            <div style="color:#fff">
                <div style="font-weight:700; font-size:1rem">
                    <i class="robot icon"></i> Configure Agent
                </div>
                <div style="font-size:.83em; opacity:.85; margin-top:2px">{{ configuringDevice }}</div>
            </div>
            <button class="ui mini inverted button" @click="closeConfig" style="background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.3)">
                <i class="times icon"></i> Close
            </button>
        </div>

        <div style="padding:20px">

            <!-- ① Provider selector -->
            <div style="margin-bottom:18px">
                <div style="font-size:.8em; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px">
                    1 — Select Provider
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:5px">
                    <button v-for="p in availableProviders" :key="p"
                            class="ui small button"
                            :style="panelForm.provider===p
                                ? {background: providerColor(p), color:'#fff', fontWeight:'700', boxShadow: '0 4px 10px rgba(0,0,0,0.15)'}
                                : {background: '#f3f4f6', color: '#4b5563'}"
                            @click="applyProviderPreset(p)"
                            style="border-radius:12px; border:none">
                        {{ (providerEmoji[p] || '') + ' ' + (providerLabel[p] || p) }}
                    </button>
                </div>
            </div>

            <!-- ② Template cards for selected provider -->
            <div style="margin-bottom:20px">
                <div style="font-size:.8em; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px">
                    2 — Choose a Template <span style="font-weight:400; text-transform:none">(or configure manually below)</span>
                </div>

                <div v-if="loadingTemplates" class="ui active inline loader" style="margin:10px 0"></div>

                <div v-else-if="panelTemplates.length === 0" style="color:#9ca3af; font-size:.85em; font-style:italic; padding:10px 0">
                    No templates for <strong>{{ panelForm.provider }}</strong>.
                    Go to the <strong>Templates</strong> tab to create some.
                </div>

                <div v-else style="display:flex; flex-wrap:wrap; gap:10px">
                    <!-- Template cards -->
                    <div v-for="tpl in panelTemplates" :key="tpl.id"
                         @click="applyTemplate(tpl)"
                         :style="{
                             border: selectedTemplateId===tpl.id ? '2px solid '+providerColor(tpl.provider) : '1px solid #e5e7eb',
                             borderRadius: '10px',
                             padding: '12px 14px',
                             cursor: 'pointer',
                             minWidth: '200px',
                             maxWidth: '260px',
                             background: selectedTemplateId===tpl.id ? '#f0f9ff' : '#fafafa',
                             transition: 'border-color .15s, background .15s',
                             position: 'relative',
                         }">
                        <div v-if="selectedTemplateId===tpl.id"
                             style="position:absolute;top:8px;right:8px;background:#21ba45;color:#fff;border-radius:10px;padding:1px 7px;font-size:.7em;font-weight:700">
                            ✓ Selected
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px">
                            <span :style="{background: providerColor(tpl.provider), color:'#fff', borderRadius:'8px', padding:'1px 7px', fontSize:'.72em', fontWeight:'700', textTransform:'capitalize'}">
                                {{ tpl.provider }}
                            </span>
                            <span v-if="tpl.structured_output" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;border-radius:6px;padding:0 5px;font-size:.7em;font-weight:600">JSON</span>
                        </div>
                        <div style="font-weight:700; font-size:.9rem; color:#1f2937">{{ tpl.name }}</div>
                        <div v-if="tpl.description" style="font-size:.78em; color:#6b7280; margin-top:2px">{{ tpl.description }}</div>
                        <div style="font-size:.75em; color:#6366f1; font-family:monospace; margin-top:4px">{{ tpl.model }}</div>
                    </div>

                    <!-- Custom card -->
                    <div @click="clearTemplate()"
                         :style="{
                             border: selectedTemplateId===null ? '2px solid #6366f1' : '1px dashed #d1d5db',
                             borderRadius: '10px',
                             padding: '12px 14px',
                             cursor: 'pointer',
                             minWidth: '160px',
                             background: selectedTemplateId===null ? '#faf5ff' : '#fafafa',
                             display: 'flex',
                             alignItems: 'center',
                             gap: '8px',
                             color: selectedTemplateId===null ? '#6366f1' : '#9ca3af',
                             fontWeight: '600',
                             fontSize: '.88rem',
                             transition: 'border-color .15s, background .15s',
                         }">
                        <i class="pencil alternate icon"></i>
                        Custom
                    </div>
                </div>
            </div>

            <!-- ③ Form -->
            <div style="border-top:1px solid #e5e7eb; padding-top:18px">
                <div style="font-size:.8em; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:.06em; margin-bottom:14px">
                    3 — Configuration
                    <span v-if="selectedTemplateId" style="font-weight:400; text-transform:none; color:#6366f1; margin-left:6px">(from template — edit as needed)</span>
                    <span v-else style="font-weight:400; text-transform:none; color:#9ca3af; margin-left:6px">(custom)</span>
                </div>

                <div class="ui form">
                    <div class="two fields">
                        <div class="field">
                            <label>API URL</label>
                            <input type="url" v-model="panelForm.api_url" placeholder="http://localhost:11434/v1" />
                        </div>
                        <div class="field">
                            <label>Model</label>
                            <select v-if="panelForm.provider !== 'custom'"
                                    style="width:100%;border:1px solid rgba(34,36,38,.15);border-radius:.285rem;padding:.62em;outline:none;background:#fff"
                                    v-model="panelForm.model">
                                <option v-for="m in getModelsForProvider(panelForm.provider)" :key="m" :value="m">{{ m }}</option>
                            </select>
                            <input v-else type="text" v-model="panelForm.model" placeholder="model-name" />
                            <div style="margin-top:5px;font-size:.82em;color:#555;background:#fdfdfd;border:1px solid #eee;padding:5px 9px;border-radius:4px;border-left:3px solid #21ba45;line-height:1.4">
                                <i class="info circle icon" style="color:#21ba45"></i> {{ getModelDescription(panelForm.model) }}
                            </div>
                        </div>
                    </div>
                    <div class="field" v-if="panelForm.provider !== 'ollama'">
                        <label>API Key</label>
                        <input type="password" v-model="panelForm.api_key"
                            :placeholder="panelForm._api_key_set ? '●●●● (leave blank to keep: ' + panelForm._api_key_masked + ')' : 'sk-...'" />
                        <div v-if="panelForm._api_key_set && !panelForm.api_key" style="font-size:0.78rem;color:#21ba45;margin-top:3px">
                            <i class="lock icon"></i> Key configured: {{ panelForm._api_key_masked }}
                        </div>
                    </div>
                    <div class="field">
                        <label>System Prompt <span style="font-weight:normal;color:#888">(optional)</span></label>
                        <textarea rows="4" v-model="panelForm.system_prompt" placeholder="You are a helpful assistant..."></textarea>
                    </div>
                    <div class="three fields">
                        <div class="field">
                            <label>History <span style="font-weight:normal;color:#888">(0=stateless)</span></label>
                            <input type="number" min="0" max="50" v-model="panelForm.context_messages" />
                        </div>
                        <div class="field">
                            <label>Temperature</label>
                            <input type="number" min="0" max="2" step="0.1" v-model="panelForm.temperature" />
                        </div>
                        <div class="field">
                            <label>Max Tokens <span style="font-weight:normal;color:#888">(0=no limit)</span></label>
                            <input type="number" min="0" v-model="panelForm.max_tokens" />
                        </div>
                    </div>
                    <div class="three fields">
                        <div class="field">
                            <div class="ui toggle checkbox">
                                <input type="checkbox" v-model="panelForm.enabled" />
                                <label>Enabled</label>
                            </div>
                        </div>
                        <div class="field">
                            <div class="ui toggle checkbox">
                                <input type="checkbox" v-model="panelForm.allow_groups" />
                                <label>Reply in groups</label>
                            </div>
                        </div>
                        <div class="field">
                            <div class="ui toggle checkbox">
                                <input type="checkbox" v-model="panelForm.structured_output" />
                                <label>Structured output (JSON)</label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Test result -->
            <div v-if="ag(configuringDevice).testResult === 'ok'" class="ui positive message" style="margin-top:10px">
                <i class="check circle icon"></i> {{ ag(configuringDevice).testMessage }}
            </div>
            <div v-if="ag(configuringDevice).testResult === 'error'" class="ui negative message" style="margin-top:10px">
                <i class="times circle icon"></i> {{ ag(configuringDevice).testMessage }}
            </div>

            <!-- Action buttons -->
            <div style="display:flex; gap:8px; margin-top:20px; padding-top:15px; border-top:1px solid #eee">
                <button class="ui teal button" :class="{loading: ag(configuringDevice).testing}" @click="testAgent">
                    <i class="plug icon"></i> {{ t('agent.btn.test') || 'Test Connection' }}
                </button>
                <div style="flex:1"></div>
                <button class="ui primary button" :class="{loading: ag(configuringDevice).saving}" @click="saveAgent">
                    <i class="save icon"></i> {{ t('agent.btn.save') || 'Save Agent' }}
                </button>
                <button v-if="ag(configuringDevice).agent" class="ui red button" @click="removeAgent">
                    <i class="trash icon"></i> Remove
                </button>
                <button class="ui button" @click="closeConfig">
                    {{ t('agent.btn.cancel') || 'Cancel' }}
                </button>
            </div>
        </div>
    </div>
</div>
`
};
