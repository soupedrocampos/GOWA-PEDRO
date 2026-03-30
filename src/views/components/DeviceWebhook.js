export default {
    name: 'DeviceWebhook',
    props: {
        deviceId: {
            type: String,
            required: true,
        },
    },
    data() {
        return {
            webhook: null,
            urlInput: '',
            enabled: true,
            loading: false,
            saving: false,
            testing: false,
            testResult: null, // 'ok' | 'error' | null
            testMessage: '',
        }
    },
    computed: {
        hasWebhook() {
            return this.webhook !== null
        },
        statusLabel() {
            if (!this.hasWebhook) return 'Não configurado'
            return this.webhook.enabled ? 'Ativo' : 'Desativado'
        },
        statusColor() {
            if (!this.hasWebhook) return 'grey'
            return this.webhook.enabled ? 'green' : 'orange'
        },
        cardColor() {
            if (!this.hasWebhook) return 'card'
            return this.webhook.enabled ? 'green card' : 'orange card'
        },
    },
    watch: {
        deviceId: {
            immediate: true,
            handler(val) {
                if (val) this.load()
            },
        },
    },
    methods: {
        openModal() {
            this.testResult = null
            this.testMessage = ''
            this.$nextTick(() => {
                window.$('#modalDeviceWebhook_' + this.deviceId).modal('show')
            })
        },
        closeModal() {
            window.$('#modalDeviceWebhook_' + this.deviceId).modal('hide')
        },
        async load() {
            if (!this.deviceId) return
            this.loading = true
            try {
                const res = await window.http.get(`/devices/${this.deviceId}/webhook`)
                this.webhook = res.data.results || null
                if (this.webhook) {
                    this.urlInput = this.webhook.url
                    this.enabled = this.webhook.enabled
                } else {
                    this.urlInput = ''
                    this.enabled = true
                }
            } catch (e) {
                this.webhook = null
            } finally {
                this.loading = false
            }
        },
        async save() {
            if (!this.urlInput.trim()) {
                showErrorInfo('URL do webhook é obrigatória')
                return
            }
            this.saving = true
            this.testResult = null
            try {
                await window.http.post(`/devices/${this.deviceId}/webhook`, {
                    url: this.urlInput.trim(),
                    enabled: this.enabled,
                })
                await this.load()
                showSuccessInfo('Webhook salvo com sucesso!')
                this.closeModal()
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Falha ao salvar webhook')
            } finally {
                this.saving = false
            }
        },
        async remove() {
            if (!confirm('Remover webhook deste dispositivo?')) return
            this.saving = true
            try {
                await window.http.delete(`/devices/${this.deviceId}/webhook`)
                this.webhook = null
                this.urlInput = ''
                this.enabled = true
                showSuccessInfo('Webhook removido')
                this.closeModal()
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Falha ao remover webhook')
            } finally {
                this.saving = false
            }
        },
        async testWebhook() {
            if (!this.urlInput.trim()) {
                showErrorInfo('Informe a URL antes de testar')
                return
            }
            this.testing = true
            this.testResult = null
            this.testMessage = ''
            try {
                // Server-side test avoids CORS issues — GOWA makes the request to n8n
                const res = await window.http.post(
                    `/devices/${this.deviceId}/webhook/test`,
                    { url: this.urlInput.trim() },
                    { timeout: 15000 }
                )
                const code = res.data?.code
                if (code === 'SUCCESS') {
                    this.testResult = 'ok'
                    this.testMessage = res.data?.message || 'Webhook respondeu com sucesso!'
                } else {
                    this.testResult = 'error'
                    this.testMessage = res.data?.message || 'Webhook não respondeu corretamente.'
                }
            } catch (e) {
                this.testResult = 'error'
                this.testMessage = e.response?.data?.message || 'Falha ao contatar o webhook.'
            } finally {
                this.testing = false
            }
        },
    },
    template: `
<div>
    <!-- Card trigger -->
    <div :class="cardColor" @click="openModal" style="cursor: pointer">
        <div class="content">
            <a class="ui teal right ribbon label">Integração</a>
            <div class="header">
                <i class="plug icon"></i> Webhook n8n
            </div>
            <div class="description" style="margin-top: 6px">
                <span v-if="loading"><i class="spinner loading icon"></i> Carregando...</span>
                <span v-else-if="hasWebhook && webhook.enabled" style="color:#21ba45">
                    <i class="check circle icon"></i> Ativo
                    <div style="font-size:0.8em; color:#555; margin-top:4px; word-break:break-all">[[ webhook.url ]]</div>
                </span>
                <span v-else-if="hasWebhook && !webhook.enabled" style="color:#f2711c">
                    <i class="pause circle icon"></i> Desativado
                    <div style="font-size:0.8em; color:#555; margin-top:4px; word-break:break-all">[[ webhook.url ]]</div>
                </span>
                <span v-else style="color:#aaa">
                    <i class="unlink icon"></i> Nenhum webhook configurado.<br>
                    <small>Clique para configurar o fluxo n8n deste número.</small>
                </span>
            </div>
        </div>
    </div>

    <!-- Modal -->
    <div :id="'modalDeviceWebhook_' + deviceId" class="ui small modal">
        <i class="close icon"></i>
        <div class="header">
            <i class="plug icon"></i> Webhook n8n — [[ deviceId ]]
        </div>
        <div class="content">
            <div v-if="loading" class="ui active centered inline loader"></div>
            <div v-else>
                <!-- Current status -->
                <div v-if="hasWebhook" class="ui message" :class="webhook.enabled ? 'positive' : 'warning'" style="margin-bottom:1em">
                    <div class="header">Webhook [[ webhook.enabled ? 'ativo' : 'desativado' ]]</div>
                    <p style="word-break:break-all; font-size:0.9em">[[ webhook.url ]]</p>
                </div>

                <!-- Form -->
                <div class="ui form">
                    <div class="field">
                        <label>URL do Webhook n8n</label>
                        <input type="url" v-model="urlInput" placeholder="https://n8n.seudominio.com/webhook/abc123" />
                        <div style="margin-top:4px; font-size:0.82em; color:#666">
                            Cole aqui a URL de Webhook do seu fluxo n8n. Cada mensagem recebida neste número será enviada para este endpoint.
                        </div>
                    </div>
                    <div class="field">
                        <div class="ui toggle checkbox" style="margin-top:4px">
                            <input type="checkbox" v-model="enabled">
                            <label>Habilitado</label>
                        </div>
                    </div>

                    <!-- Test result -->
                    <div v-if="testResult === 'ok'" class="ui positive message" style="margin-top:8px">
                        <i class="check circle icon"></i> [[ testMessage || 'Webhook respondeu com sucesso!' ]]
                    </div>
                    <div v-if="testResult === 'error'" class="ui negative message" style="margin-top:8px">
                        <i class="times circle icon"></i> [[ testMessage || 'Falha ao contatar o webhook. Verifique a URL e se o fluxo n8n está ativo.' ]]
                    </div>
                </div>
            </div>
        </div>
        <div class="actions">
            <button class="ui red button" v-if="hasWebhook" @click="remove" :class="{loading: saving}" style="float:left">
                <i class="trash icon"></i> Remover
            </button>
            <button class="ui button" @click="closeModal">Cancelar</button>
            <button class="ui teal button" @click="testWebhook" :class="{loading: testing}" :disabled="!urlInput">
                <i class="plug icon"></i> Testar
            </button>
            <button class="ui primary button" @click="save" :class="{loading: saving}" :disabled="!urlInput">
                <i class="save icon"></i> Salvar
            </button>
        </div>
    </div>
</div>
    `,
}
