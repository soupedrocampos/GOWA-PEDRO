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
                groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b']
            };
            return models[provider] || [];
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
    },
    template: `
<div>
    <div v-if="deviceList.length === 0" class="ui placeholder segment" style="border-radius:10px; border:2px dashed #d1d5db">
        <div class="ui icon header" style="color:#9ca3af">
            <i class="mobile alternate icon"></i>
            Nenhum dispositivo encontrado
        </div>
        <p style="color:#6b7280; font-size:0.9rem">Acesse a aba <strong>Dashboard</strong> e crie um dispositivo na seção <em>Device setup</em> antes de configurar agentes.</p>
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
                    <i class="robot icon"></i> LLM Ativo
                </span>
                <span v-else-if="ag(dev.id || dev.device).agent && !ag(dev.id || dev.device).agent.enabled"
                      style="background:#f2711c; color:#fff; border-radius:12px; padding:3px 10px; font-size:0.78em; font-weight:600">
                    <i class="robot icon"></i> LLM Pausado
                </span>
                <span v-else style="background:#e0e0e0; color:#888; border-radius:12px; padding:3px 10px; font-size:0.78em">
                    Sem agente
                </span>

                <button class="ui mini primary button"
                        :class="{loading: ag(dev.id || dev.device).loading}"
                        @click="openModal(dev.id || dev.device)">
                    <i class="cog icon"></i> Configurar
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
                        Provedor LLM
                    </div>
                    <div class="ui four small buttons">
                        <button class="ui button"
                                v-for="p in ['ollama','openai','groq','custom']"
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
                            <label>API URL</label>
                            <input type="url"
                                   :value="ms(dev.id || dev.device).api_url"
                                   @input="setMsField(dev.id || dev.device, 'api_url', $event.target.value)"
                                   placeholder="http://localhost:11434/v1" />
                        </div>
                        <div class="field">
                            <label>Modelo</label>
                            <select v-if="ms(dev.id || dev.device).provider !== 'custom'"
                                    class="ui dropdown"
                                    :value="ms(dev.id || dev.device).model"
                                    @change="setMsField(dev.id || dev.device, 'model', $event.target.value)">
                                <option v-for="m in getModelsForProvider(ms(dev.id || dev.device).provider)" :key="m" :value="m">{{ m }}</option>
                            </select>
                            <input v-else type="text"
                                   :value="ms(dev.id || dev.device).model"
                                   @input="setMsField(dev.id || dev.device, 'model', $event.target.value)"
                                   placeholder="Digite o seu modelo customizado..." />
                        </div>
                    </div>
                    <div class="field" v-if="ms(dev.id || dev.device).provider !== 'ollama'">
                        <label>API Key</label>
                        <input type="password"
                               :value="ms(dev.id || dev.device).api_key"
                               @input="setMsField(dev.id || dev.device, 'api_key', $event.target.value)"
                               placeholder="sk-..." />
                    </div>
                    <div class="field">
                        <label>Prompt do sistema <span style="font-weight:normal; color:#888">(personalidade / instruções)</span></label>
                        <textarea rows="4"
                                  :value="ms(dev.id || dev.device).system_prompt"
                                  @input="setMsField(dev.id || dev.device, 'system_prompt', $event.target.value)"
                                  placeholder="Ex: Você é um assistente amigável da empresa ACME. Responda sempre em português de forma concisa e educada."></textarea>
                    </div>
                    <div class="field">
                        <div class="ui toggle checkbox">
                            <input type="checkbox"
                                   :checked="ms(dev.id || dev.device).enabled"
                                   @change="setMsField(dev.id || dev.device, 'enabled', $event.target.checked)" />
                            <label>Agente habilitado (responde automaticamente às mensagens recebidas)</label>
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
                    <i class="trash icon"></i> Remover
                </button>
                <button class="ui button" @click="closeModal(dev.id || dev.device)">Cancelar</button>
                <button class="ui teal basic button"
                        @click="testAgent(dev.id || dev.device)"
                        :class="{loading: ag(dev.id || dev.device).testing}"
                        :disabled="!ms(dev.id || dev.device).api_url || !ms(dev.id || dev.device).model">
                    <i class="flask icon"></i> Testar LLM
                </button>
                <button class="ui primary button"
                        @click="saveAgent(dev.id || dev.device)"
                        :class="{loading: ag(dev.id || dev.device).saving}"
                        :disabled="!ms(dev.id || dev.device).api_url || !ms(dev.id || dev.device).model">
                    <i class="save icon"></i> Salvar
                </button>
            </div>
        </div>

    </div>
</div>
    `
}
