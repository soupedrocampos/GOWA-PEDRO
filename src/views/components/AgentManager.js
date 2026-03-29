export default {
    name: 'AgentManager',
    props: {
        deviceList: {
            type: Array,
            default: () => []
        }
    },
    data() {
        return {
            // agentState: deviceId -> { agent, mode, loading, saving, testing, testResult, testMessage }
            agentState: {},
            // modal form state per device
            modalState: {},
            activeModalDevice: null,
        }
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
        ag(deviceId) {
            return this.agentState[deviceId] || { agent: null, mode: 'none', loading: false, saving: false, testing: false, testResult: null, testMessage: '' };
        },
        ms(deviceId) {
            return this.modalState[deviceId] || this.defaultModalState();
        },
        defaultModalState() {
            return { provider: 'ollama', api_url: 'http://localhost:11434/v1', api_key: '', model: 'llama3.2', system_prompt: '', enabled: true };
        },
        async loadAgent(deviceId) {
            this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), loading: true } };
            try {
                const res = await window.http.get(`/devices/${deviceId}/agent`);
                const agent = res.data.results || null;
                const mode = agent ? 'llm' : 'none';
                this.agentState = { ...this.agentState, [deviceId]: { agent, mode, loading: false, saving: false, testing: false, testResult: null, testMessage: '' } };
            } catch {
                this.agentState = { ...this.agentState, [deviceId]: { agent: null, mode: 'none', loading: false, saving: false, testing: false, testResult: null, testMessage: '' } };
            }
        },
        openModal(deviceId) {
            const state = this.ag(deviceId);
            const agent = state.agent;
            this.modalState = {
                ...this.modalState,
                [deviceId]: agent ? {
                    provider: agent.provider || 'ollama',
                    api_url: agent.api_url || 'http://localhost:11434/v1',
                    api_key: agent.api_key || '',
                    model: agent.model || 'llama3.2',
                    system_prompt: agent.system_prompt || '',
                    enabled: agent.enabled !== false,
                } : this.defaultModalState()
            };
            this.activeModalDevice = deviceId;
            this.$nextTick(() => {
                window.$(`#agentModal_${deviceId}`).modal({
                    closable: false,
                    onHidden: () => { this.activeModalDevice = null; }
                }).modal('show');
            });
        },
        closeModal(deviceId) {
            window.$(`#agentModal_${deviceId}`).modal('hide');
        },
        setMsField(deviceId, field, value) {
            const current = this.ms(deviceId);
            this.modalState = { ...this.modalState, [deviceId]: { ...current, [field]: value } };
        },
        applyProviderPreset(deviceId, provider) {
            const presets = {
                ollama: { api_url: 'http://localhost:11434/v1', api_key: '', model: 'llama3.2' },
                openai: { api_url: 'https://api.openai.com/v1', api_key: '', model: 'gpt-4o-mini' },
                groq: { api_url: 'https://api.groq.com/openai/v1', api_key: '', model: 'llama-3.1-8b-instant' },
                gemini: { api_url: 'https://generativelanguage.googleapis.com/v1beta/openai/', api_key: '', model: 'gemini-1.5-flash' },
                claude: { api_url: 'https://api.anthropic.com/v1', api_key: '', model: 'claude-3-5-sonnet-20241022' },
                custom: { api_url: '', api_key: '', model: '' },
            };
            const preset = presets[provider] || presets.custom;
            const current = this.ms(deviceId);
            this.modalState = { ...this.modalState, [deviceId]: { ...current, provider, ...preset } };
        },
        getModelsForProvider(provider) {
            const models = {
                ollama: ['llama3.2', 'llama3.1', 'llama3', 'mistral', 'gemma2', 'qwen2.5', 'phi3', 'deepseek-r1', 'llava'],
                openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini', 'o3-mini'],
                groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b'],
                gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.0-pro'],
                claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
            };
            return models[provider] || [];
        },
        getModelDescription(modelName) {
            if (!modelName) return 'Selecione um modelo para ver os detalhes.';
            const desc = {
                'gpt-4o': 'Mais rápido e inteligente (OpenAI). Custo: ~ $5 / 1M tokens (In) | $15 (Out)',
                'gpt-4o-mini': 'Versão menor e mais barata (OpenAI). Custo: ~ $0.15 / 1M tokens (In) | $0.60 (Out)',
                'gpt-4-turbo': 'Poderoso para raciocínio complexo. Custo: ~ $10 / 1M tokens (In) | $30 (Out)',
                'gpt-4': 'Legado. Forte em raciocínio, porém mais caro. Custo: ~ $30 / 1M tokens (In) | $60 (Out)',
                'gpt-3.5-turbo': 'Rápido, mas superado pelo gpt-4o-mini. Custo: ~ $0.50 / 1M tokens (In) | $1.50 (Out)',
                'o1-preview': 'Foco em raciocínio avançado. Custo: ~ $15 / 1M tokens (In) | $60 (Out)',
                'o1-mini': 'Raciocínio avançado rápido/barato. Custo: ~ $3 / 1M tokens (In) | $12 (Out)',
                'o3-mini': 'Raciocínio rápido (Math/Code). Custo: ~ $1.10 / 1M tokens (In) | $4.40 (Out)',
                'llama-3.3-70b-versatile': 'Equilíbrio e versatilidade 70B (Groq). Custo: ~$0.59 / 1M tokens',
                'llama-3.1-8b-instant': 'Super rápido para tarefas simples (Groq). Custo: ~$0.05 / 1M tokens',
                'mixtral-8x7b-32768': 'Alta eficiência com arquitetura mista (Groq). Custo: ~$0.24 / 1M tokens',
                'gemma2-9b-it': 'Ótima qualidade em modelo leve (Groq). Custo: ~$0.20 / 1M tokens',
                'deepseek-r1-distill-llama-70b': 'Alto raciocínio DeepSeek+Llama (Groq). Custo: ~$0.75 / 1M tokens',
                'gemini-1.5-flash': 'Rápido e barato. Contexto de até 1 Milhão (Google). Custo: ~ $0.075 / 1M tokens (In)',
                'gemini-1.5-pro': 'Lida com raciocínio complexo. Contexto enorme (Google). Custo: ~ $3.50 / 1M tokens (In)',
                'gemini-2.0-flash': 'Flash-V2. Excelente balanceamento (Google). Custo: ~ $0.10 / 1M tokens (In)',
                'gemini-2.0-pro': 'Trabalho analítico avançado e raciocínio pesado (Google). Custo: ~ $5.00 / 1M tokens',
                'claude-3-5-sonnet-20241022': 'Inteligência top com excelente velocidade. Ótimo em Código (Anthropic). Custo: ~ $3 / 1M tokens (In) | $15 (Out)',
                'claude-3-5-haiku-20241022': 'O mais rápido da Anthropic. Custo: ~ $0.25 / 1M tokens (In) | $1.25 (Out)',
                'claude-3-opus-20240229': 'Poderoso para tarefas complexas. Custo: ~ $15 / 1M tokens (In) | $75 (Out)',
                'llama3.2': 'Llama 3.2 local (Ollama). Custo: Zero',
                'llama3.1': 'Llama 3.1 local (Ollama). Custo: Zero',
                'deepseek-r1': 'DeepSeek R1 com raciocínio ChainOfThought (Ollama). Custo: Zero'
            };
            return desc[modelName] || 'Local / Custom model. Consulte as tabelas do provedor para obter preços atualizados.';
        },
        async saveAgent(deviceId) {
            const form = this.ms(deviceId);
            if (!form.api_url.trim()) { showErrorInfo('Informe a API URL'); return; }
            if (!form.model.trim()) { showErrorInfo('Informe o modelo'); return; }

            this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), saving: true, testResult: null } };
            try {
                await window.http.post(`/devices/${deviceId}/agent`, {
                    provider: form.provider,
                    api_url: form.api_url.trim(),
                    api_key: form.api_key.trim(),
                    model: form.model.trim(),
                    system_prompt: form.system_prompt,
                    enabled: form.enabled,
                });
                showSuccessInfo('Agente LLM salvo!');
                await this.loadAgent(deviceId);
                this.closeModal(deviceId);
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Falha ao salvar agente');
                this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), saving: false } };
            }
        },
        async removeAgent(deviceId) {
            if (!confirm('Remover agente LLM deste dispositivo?')) return;
            this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), saving: true } };
            try {
                await window.http.delete(`/devices/${deviceId}/agent`);
                showSuccessInfo('Agente removido');
                await this.loadAgent(deviceId);
                this.closeModal(deviceId);
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Falha ao remover agente');
                this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), saving: false } };
            }
        },
        async testAgent(deviceId) {
            const form = this.ms(deviceId);
            if (!form.api_url.trim()) { showErrorInfo('Informe a API URL antes de testar'); return; }
            if (!form.model.trim()) { showErrorInfo('Informe o modelo antes de testar'); return; }

            this.agentState = { ...this.agentState, [deviceId]: { ...this.ag(deviceId), testing: true, testResult: null, testMessage: '' } };
            try {
                const res = await window.http.post(`/devices/${deviceId}/agent/test`, {
                    api_url: form.api_url.trim(),
                    api_key: form.api_key.trim(),
                    model: form.model.trim(),
                }, { timeout: 35000 });
                const code = res.data?.code;
                const msg = res.data?.message || '';
                this.agentState = { ...this.agentState, [deviceId]: {
                    ...this.ag(deviceId),
                    testing: false,
                    testResult: code === 'SUCCESS' ? 'ok' : 'error',
                    testMessage: msg,
                }};
            } catch (e) {
                this.agentState = { ...this.agentState, [deviceId]: {
                    ...this.ag(deviceId),
                    testing: false,
                    testResult: 'error',
                    testMessage: e.response?.data?.message || 'Falha ao contatar o LLM.',
                }};
            }
        },
        t(key) { return window.i18n ? window.i18n.t(key) : key; }
    },
    template: `
<div>
    <div v-if="deviceList.length === 0" class="ui placeholder segment" style="border-radius:10px; border:2px dashed #d1d5db">
        <div class="ui icon header" style="color:#9ca3af">
            <i class="mobile alternate icon"></i>
            {{ t('agent.nodevices') }}
        </div>
        <p style="color:#6b7280; font-size:0.9rem">{{ t('agent.nodevices.hint') }}</p>
    </div>

    <div v-for="dev in deviceList" :key="dev.id || dev.device"
         style="border:1px solid #e0e0e0; border-radius:8px; padding:14px 16px; margin-bottom:12px; background:#fafafa">

        <!-- Device header -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px">
            <div style="display:flex; align-items:center; gap:10px">
                <i class="mobile alternate icon" style="font-size:1.3em; color:#555"></i>
                <div>
                    <div style="font-weight:600">{{ dev.id || dev.device }}</div>
                    <div style="font-size:0.82em; color:#888; margin-top:2px">
                        <span :style="{color: dev.state === 'logged_in' ? '#21ba45' : '#aaa'}">
                            ● {{ dev.state || 'unknown' }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Status badges -->
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                <!-- LLM badge -->
                <span v-if="ag(dev.id || dev.device).agent && ag(dev.id || dev.device).agent.enabled"
                      style="background:#21ba45; color:#fff; border-radius:12px; padding:3px 10px; font-size:0.78em; font-weight:600">
                    <i class="robot icon"></i> {{ t('agent.status.active') }}
                </span>
                <span v-else-if="ag(dev.id || dev.device).agent && !ag(dev.id || dev.device).agent.enabled"
                      style="background:#f2711c; color:#fff; border-radius:12px; padding:3px 10px; font-size:0.78em; font-weight:600">
                    <i class="robot icon"></i> {{ t('agent.status.paused') }}
                </span>
                <span v-else style="background:#e0e0e0; color:#888; border-radius:12px; padding:3px 10px; font-size:0.78em">
                    {{ t('agent.status.none') }}
                </span>

                <button class="ui mini primary button"
                        :class="{loading: ag(dev.id || dev.device).loading}"
                        @click="openModal(dev.id || dev.device)">
                    <i class="cog icon"></i> {{ t('agent.btn.configure') }}
                </button>
            </div>
        </div>

        <!-- Agent summary (when active) -->
        <div v-if="ag(dev.id || dev.device).agent" style="margin-top:10px; font-size:0.82em; color:#555; background:#f0f4f8; border-radius:6px; padding:8px 12px">
            <i class="microchip icon"></i>
            <strong>{{ ag(dev.id || dev.device).agent.provider }}</strong>
            · {{ ag(dev.id || dev.device).agent.model }}
            <span style="margin-left:8px; color:#888">{{ ag(dev.id || dev.device).agent.api_url }}</span>
        </div>

        <!-- Modal de configuração -->
        <div :id="'agentModal_' + (dev.id || dev.device)" class="ui small modal">
            <i class="close icon"></i>
            <div class="header">
                <i class="robot icon"></i> Agente IA — {{ dev.id || dev.device }}
            </div>
            <div class="content" style="padding-bottom:0">

                <!-- Provider selector -->
                <div style="margin-bottom:14px">
                    <div style="font-size:0.82em; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px">
                        {{ t('agent.provider.label') }}
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px;">
                        <button class="ui small button"
                                v-for="p in ['ollama','openai','groq','gemini','claude','custom']"
                                :key="p"
                                :class="{primary: ms(dev.id || dev.device).provider === p}"
                                @click="applyProviderPreset(dev.id || dev.device, p)"
                                style="text-transform:capitalize">
                            {{ p }}
                        </button>
                    </div>
                </div>

                <!-- Form -->
                <div class="ui form">
                    <div class="two fields">
                        <div class="field">
                            <label>{{ t('agent.apiurl.label') }}</label>
                            <input type="url"
                                   :value="ms(dev.id || dev.device).api_url"
                                   @input="setMsField(dev.id || dev.device, 'api_url', $event.target.value)"
                                   placeholder="http://localhost:11434/v1" />
                        </div>
                        <div class="field">
                            <label>{{ t('agent.model.label') }}</label>
                            <select v-if="ms(dev.id || dev.device).provider !== 'custom'"
                                    style="width: 100%; border: 1px solid rgba(34,36,38,.15); border-radius: .285rem; padding: 0.62em; outline: none; background: #fff;"
                                    :value="ms(dev.id || dev.device).model"
                                    @change="setMsField(dev.id || dev.device, 'model', $event.target.value)">
                                <option v-for="m in getModelsForProvider(ms(dev.id || dev.device).provider)" :key="m" :value="m">{{ m }}</option>
                            </select>
                            <input v-else type="text"
                                   :value="ms(dev.id || dev.device).model"
                                   @input="setMsField(dev.id || dev.device, 'model', $event.target.value)"
                                   :placeholder="t('agent.model.custom.placeholder')" />
                                   
                            <!-- Balloon for description -->
                            <div style="margin-top: 6px; font-size: 0.85em; color: #555; background: #fdfdfd; border: 1px solid #eee; padding: 6px 10px; border-radius: 4px; border-left: 3px solid #21ba45; line-height: 1.4;">
                                <i class="info circle icon" style="color: #21ba45;"></i> {{ getModelDescription(ms(dev.id || dev.device).model) }}
                            </div>
                        </div>
                    </div>
                    <div class="field" v-if="ms(dev.id || dev.device).provider !== 'ollama'">
                        <label>{{ t('agent.apikey.label') }}</label>
                        <input type="password"
                               :value="ms(dev.id || dev.device).api_key"
                               @input="setMsField(dev.id || dev.device, 'api_key', $event.target.value)"
                               placeholder="sk-..." />
                    </div>
                    <div class="field">
                        <label>{{ t('agent.systemprompt.label') }} <span style="font-weight:normal; color:#888">{{ t('agent.systemprompt.sub') }}</span></label>
                        <textarea rows="4"
                                  :value="ms(dev.id || dev.device).system_prompt"
                                  @input="setMsField(dev.id || dev.device, 'system_prompt', $event.target.value)"
                                  :placeholder="t('agent.systemprompt.placeholder')"></textarea>
                    </div>
                    <div class="field">
                        <div class="ui toggle checkbox">
                            <input type="checkbox"
                                   :checked="ms(dev.id || dev.device).enabled"
                                   @change="setMsField(dev.id || dev.device, 'enabled', $event.target.checked)" />
                            <label>{{ t('agent.enabled.label') }}</label>
                        </div>
                    </div>

                    <!-- Test result -->
                    <div v-if="ag(dev.id || dev.device).testResult === 'ok'" class="ui positive message" style="margin-top:8px">
                        <i class="check circle icon"></i> {{ ag(dev.id || dev.device).testMessage }}
                    </div>
                    <div v-if="ag(dev.id || dev.device).testResult === 'error'" class="ui negative message" style="margin-top:8px">
                        <i class="times circle icon"></i> {{ ag(dev.id || dev.device).testMessage }}
                    </div>
                </div>
            </div>
            <div class="actions">
                <button class="ui red basic button" v-if="ag(dev.id || dev.device).agent"
                        @click="removeAgent(dev.id || dev.device)"
                        :class="{loading: ag(dev.id || dev.device).saving}" style="float:left">
                    <i class="trash icon"></i> {{ t('agent.btn.remove') }}
                </button>
                <button class="ui button" @click="closeModal(dev.id || dev.device)">{{ t('agent.btn.cancel') }}</button>
                <button class="ui teal basic button"
                        @click="testAgent(dev.id || dev.device)"
                        :class="{loading: ag(dev.id || dev.device).testing}"
                        :disabled="!ms(dev.id || dev.device).api_url || !ms(dev.id || dev.device).model">
                    <i class="flask icon"></i> {{ t('agent.btn.test') }}
                </button>
                <button class="ui primary button"
                        @click="saveAgent(dev.id || dev.device)"
                        :class="{loading: ag(dev.id || dev.device).saving}"
                        :disabled="!ms(dev.id || dev.device).api_url || !ms(dev.id || dev.device).model">
                    <i class="save icon"></i> {{ t('agent.btn.save') }}
                </button>
            </div>
        </div>

    </div>
</div>
    `
}
