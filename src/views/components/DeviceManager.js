export default {
    name: 'DeviceManager',
    props: {
        wsBasePath: {
            type: String,
            default: ''
        }
    },
    data() {
        return {
            deviceList: [],
            selectedDeviceId: '',
            deviceIdInput: '',
            isCreatingDevice: false,
            deviceToDelete: { id: '', jid: '', state: '' },
            isDeleting: false,
            // webhookState: deviceId -> { url, enabled, saving, testing, testResult, testMessage, dirty }
            webhookState: {},
        }
    },
    computed: {
        selectedDevice() {
            if (!this.selectedDeviceId) return null;
            return this.deviceList.find(d => (d.id || d.device) === this.selectedDeviceId) || null;
        },
        isSelectedDeviceLoggedIn() {
            return this.selectedDevice?.state === 'logged_in';
        }
    },
    methods: {
        async fetchDevices() {
            try {
                const res = await window.http.get(`/devices`);
                this.deviceList = res.data.results || [];
                if (!this.selectedDeviceId && this.deviceList.length > 0) {
                    const first = this.deviceList[0].id || this.deviceList[0].device;
                    this.setDeviceContext(first);
                }
                this.$emit('devices-updated', this.deviceList);
                this.deviceList.forEach(dev => this.loadWebhook(dev.id || dev.device));
            } catch (err) {
                console.error(err);
            }
        },
        async loadWebhook(deviceId) {
            try {
                const res = await window.http.get(`/devices/${deviceId}/webhook`);
                const wh = res.data.results || null;
                this.webhookState = {
                    ...this.webhookState,
                    [deviceId]: {
                        url: wh ? wh.url : '',
                        enabled: wh ? wh.enabled : true,
                        saved: wh ? wh.url : '',
                        saving: false,
                        testing: false,
                        testResult: null,
                        testMessage: '',
                    }
                };
            } catch {
                this.webhookState = {
                    ...this.webhookState,
                    [deviceId]: { url: '', enabled: true, saved: '', saving: false, testing: false, testResult: null, testMessage: '' }
                };
            }
        },
        wh(deviceId) {
            return this.webhookState[deviceId] || { url: '', enabled: true, saved: '', saving: false, testing: false, testResult: null, testMessage: '' };
        },
        setWhField(deviceId, field, value) {
            const current = this.wh(deviceId);
            this.webhookState = { ...this.webhookState, [deviceId]: { ...current, [field]: value, testResult: null, testMessage: '' } };
        },
        async saveWebhook(deviceId) {
            const state = this.wh(deviceId);
            if (!state.url.trim()) {
                showErrorInfo('Cole a URL do webhook n8n antes de salvar');
                return;
            }
            this.webhookState = { ...this.webhookState, [deviceId]: { ...state, saving: true, testResult: null } };
            try {
                await window.http.post(`/devices/${deviceId}/webhook`, {
                    url: state.url.trim(),
                    enabled: state.enabled,
                });
                showSuccessInfo('Webhook salvo!');
                await this.loadWebhook(deviceId);
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Falha ao salvar webhook');
                this.webhookState = { ...this.webhookState, [deviceId]: { ...this.wh(deviceId), saving: false } };
            }
        },
        async removeWebhook(deviceId) {
            if (!confirm('Remover webhook deste dispositivo?')) return;
            const state = this.wh(deviceId);
            this.webhookState = { ...this.webhookState, [deviceId]: { ...state, saving: true } };
            try {
                await window.http.delete(`/devices/${deviceId}/webhook`);
                showSuccessInfo('Webhook removido');
                await this.loadWebhook(deviceId);
            } catch (e) {
                showErrorInfo(e.response?.data?.message || 'Falha ao remover webhook');
                this.webhookState = { ...this.webhookState, [deviceId]: { ...this.wh(deviceId), saving: false } };
            }
        },
        async testWebhook(deviceId) {
            const state = this.wh(deviceId);
            if (!state.url.trim()) {
                showErrorInfo('Cole a URL antes de testar');
                return;
            }
            this.webhookState = { ...this.webhookState, [deviceId]: { ...state, testing: true, testResult: null, testMessage: '' } };
            try {
                const res = await window.http.post(
                    `/devices/${deviceId}/webhook/test`,
                    { url: state.url.trim() },
                    { timeout: 15000 }
                );
                const code = res.data?.code;
                const msg = res.data?.message || '';
                this.webhookState = { ...this.webhookState, [deviceId]: {
                    ...this.wh(deviceId),
                    testing: false,
                    testResult: code === 'SUCCESS' ? 'ok' : 'error',
                    testMessage: msg,
                }};
            } catch (e) {
                this.webhookState = { ...this.webhookState, [deviceId]: {
                    ...this.wh(deviceId),
                    testing: false,
                    testResult: 'error',
                    testMessage: e.response?.data?.message || 'Falha ao contatar o webhook.',
                }};
            }
        },
        setDeviceContext(id) {
            if (!id) { showErrorInfo('Device ID is required'); return; }
            this.selectedDeviceId = id;
            this.$emit('device-selected', id);
            showSuccessInfo(`Using device ${id}`);
        },
        async createDevice() {
            try {
                this.isCreatingDevice = true;
                const payload = this.deviceIdInput ? { device_id: this.deviceIdInput } : {};
                const res = await window.http.post('/devices', payload);
                const deviceID = res.data?.results?.id || res.data?.results?.device_id || this.deviceIdInput;
                this.setDeviceContext(deviceID);
                this.deviceIdInput = '';
            } catch (err) {
                showErrorInfo(err.response?.data?.message || err.message || 'Failed to create device');
            } finally {
                this.isCreatingDevice = false;
                await this.fetchDevices();
            }
        },
        useDeviceFromInput() {
            if (!this.deviceIdInput) { showErrorInfo('Enter a device_id or create one first.'); return; }
            this.setDeviceContext(this.deviceIdInput);
        },
        openDeleteModal(deviceId, jid) {
            const device = this.deviceList.find(d => (d.id || d.device) === deviceId);
            this.deviceToDelete = { id: deviceId, jid: jid || '', state: device?.state || '' };
            $('#deleteDeviceModal').modal({
                closable: false,
                onApprove: () => { this.executeDelete(); return false; },
                onDeny: () => { this.resetDeleteState(); }
            }).modal('show');
        },
        resetDeleteState() {
            this.deviceToDelete = { id: '', jid: '', state: '' };
            this.isDeleting = false;
        },
        async executeDelete() {
            const deviceId = this.deviceToDelete.id;
            if (!deviceId) return;
            try {
                this.isDeleting = true;
                window.http.get(`/app/logout`, { headers: { 'X-Device-Id': encodeURIComponent(deviceId) } }).catch(() => {});
                await window.http.delete(`/devices/${encodeURIComponent(deviceId)}`);
                showSuccessInfo(`Device ${deviceId} deleted successfully`);
                $('#deleteDeviceModal').modal('hide');
                if (this.selectedDeviceId === deviceId) {
                    this.selectedDeviceId = '';
                    this.$emit('device-selected', '');
                }
                await this.fetchDevices();
                this.resetDeleteState();
            } catch (err) {
                showErrorInfo(err.response?.data?.message || err.message || 'Failed to delete device');
                this.isDeleting = false;
            }
        },
        refresh() { this.fetchDevices(); },
        updateDeviceList(devices) {
            if (Array.isArray(devices)) {
                this.deviceList = devices;
                this.$emit('devices-updated', devices);
            }
        },
        t(key) { return window.i18n ? window.i18n.t(key) : key; }
    },
    mounted() {
        this.fetchDevices();
    },
    template: `
    <div style="position: relative;">
        <div>
            <div class="ui segment">
                <i class="question circle outline icon"
                   title="How to log in:\n- Step 1: Create a device to get device_id.\n- Step 2: Send X-Device-Id: device_id on REST calls.\n- Step 3: Open Login card to pair (QR or code).\n- WebSocket URL ends in /ws?device_id=<device_id>"
                   style="position: absolute; top: 10px; right: 10px; font-size: 1.4em; color: #888; cursor: pointer; z-index: 10;">
                </i>
                
                <div class="ui horizontal divider" style="margin-top: 5px; margin-bottom: 20px;">
                    Device setup
                </div>
                <div style="text-align: center; color: #888; margin-bottom: 15px; font-size: 0.9em;">
                    {{ t('device.setup.subtitle') }}
                </div>
                <div class="ui form">
                    <div class="two fields">
                        <div class="field">
                            <label>{{ t('device.setup.field.deviceid') }}</label>
                            <input type="text" v-model="deviceIdInput" :placeholder="t('device.setup.placeholder')">
                        </div>
                        <div class="field">
                            <label>&nbsp;</label>
                            <div class="ui buttons">
                                <button class="ui primary button" :class="{loading: isCreatingDevice}" @click="createDevice">
                                    {{ t('device.setup.btn.create') }}
                                </button>
                                <div class="or"></div>
                                <button class="ui button" @click="useDeviceFromInput">{{ t('device.setup.btn.use') }}</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="ui divider"></div>

                <!-- Device List -->
                <div v-if="deviceList.length">
                    <div v-for="dev in deviceList" :key="dev.id || dev.device"
                         style="border:1px solid #e0e0e0; border-radius:8px; padding:12px 14px; margin-bottom:10px; background:#fafafa">

                        <!-- Row 1: device info + action buttons -->
                        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px">
                            <div style="display:flex; align-items:center; gap:10px">
                                <i class="mobile alternate icon" style="font-size:1.3em; color:#555"></i>
                                <div>
                                    <div style="font-weight:600; font-size:1em">{{ dev.id || dev.device }}</div>
                                    <div style="font-size:0.82em; color:#888; margin-top:2px">
                                        <span :style="{color: dev.state === 'logged_in' ? '#21ba45' : '#aaa'}">
                                            ● {{ dev.state || $t('device.state.unknown') }}
                                        </span>
                                        <span v-if="dev.jid" style="margin-left:8px">JID: {{ dev.jid }}</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex; gap:6px; align-items:center">
                                <button class="ui mini button"
                                        :class="{active: selectedDeviceId === (dev.id || dev.device)}"
                                        @click="setDeviceContext(dev.id || dev.device)">
                                    {{ selectedDeviceId === (dev.id || dev.device) ? $t('device.btn.selected') : $t('device.btn.use') }}
                                </button>
                                <button class="ui mini red icon button"
                                        @click="openDeleteModal(dev.id || dev.device, dev.jid)"
                                        :class="{loading: isDeleting && deviceToDelete.id === (dev.id || dev.device)}"
                                        :title="$t('device.btn.delete')">
                                    <i class="trash icon" style="margin:0"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Row 2: Webhook inline -->
                        <div style="margin-top:10px">
                            <div style="font-size:0.78em; font-weight:600; color:#555; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.04em">
                                <i class="plug icon"></i> {{ $t('device.webhook.label') }}
                                <span v-if="wh(dev.id || dev.device).saved"
                                      style="margin-left:6px; font-weight:normal; text-transform:none"
                                      :style="{color: wh(dev.id || dev.device).enabled ? '#21ba45' : '#f2711c'}">
                                    ● {{ wh(dev.id || dev.device).enabled ? $t('device.webhook.active') : $t('device.webhook.inactive') }}
                                </span>
                            </div>
                            <div style="display:flex; gap:6px; align-items:center">
                                <input
                                    type="url"
                                    :value="wh(dev.id || dev.device).url"
                                    @input="setWhField(dev.id || dev.device, 'url', $event.target.value)"
                                    :placeholder="$t('device.webhook.placeholder')"
                                    style="flex:1; padding:7px 10px; border:1px solid #ddd; border-radius:5px; font-size:0.88em; outline:none"
                                    :style="{borderColor: wh(dev.id || dev.device).saved ? (wh(dev.id || dev.device).enabled ? '#21ba45' : '#f2711c') : '#ddd'}"
                                />
                                <button class="ui mini teal icon button"
                                        :class="{loading: wh(dev.id || dev.device).testing}"
                                        :disabled="!wh(dev.id || dev.device).url"
                                        @click="testWebhook(dev.id || dev.device)"
                                        :title="$t('device.webhook.test.title')">
                                    <i class="paper plane icon" style="margin:0; color: white;"></i>
                                </button>
                                <button class="ui mini primary icon button"
                                        :class="{loading: wh(dev.id || dev.device).saving}"
                                        :disabled="!wh(dev.id || dev.device).url"
                                        @click="saveWebhook(dev.id || dev.device)"
                                        :title="$t('device.webhook.save.title')">
                                    <i class="save icon" style="margin:0"></i>
                                </button>
                                <button class="ui mini red basic icon button"
                                        v-if="wh(dev.id || dev.device).saved"
                                        :class="{loading: wh(dev.id || dev.device).saving}"
                                        @click="removeWebhook(dev.id || dev.device)"
                                        :title="$t('device.webhook.remove.title')">
                                    <i class="times icon" style="margin:0"></i>
                                </button>
                            </div>
                            <!-- Feedback de teste -->
                            <div v-if="wh(dev.id || dev.device).testResult === 'ok'"
                                 style="margin-top:5px; font-size:0.82em; color:#21ba45">
                                <i class="check circle icon"></i> {{ wh(dev.id || dev.device).testMessage || $t('device.webhook.test.success') }}
                            </div>
                            <div v-if="wh(dev.id || dev.device).testResult === 'error'"
                                 style="margin-top:5px; font-size:0.82em; color:#db2828">
                                <i class="times circle icon"></i> {{ wh(dev.id || dev.device).testMessage || 'Falha ao contatar o webhook.' }}
                            </div>
                        </div>

                    </div>
                </div>
                <div class="ui message" v-else>
                    {{ t('device.setup.nodevices') }}
                </div>
            </div>
        </div>

        <!-- Delete Device Confirmation Modal -->
        <div class="ui small modal" id="deleteDeviceModal">
            <div class="header">
                <i class="trash alternate icon"></i>
                Confirm Delete Device
            </div>
            <div class="content">
                <p>Are you sure you want to delete this device?</p>
                <div class="ui segment">
                    <p><strong>Device ID:</strong> <code>{{ deviceToDelete.id }}</code></p>
                    <p v-if="deviceToDelete.jid"><strong>JID:</strong> <code>{{ deviceToDelete.jid }}</code></p>
                </div>
                <div class="ui warning message">
                    <div class="header">Warning</div>
                    <p>This action will permanently delete the device and all associated data including chats and messages. This cannot be undone.</p>
                </div>
            </div>
            <div class="actions">
                <button class="ui cancel button">Cancel</button>
                <button class="ui red approve button" :class="{loading: isDeleting}">
                    <i class="trash icon"></i>
                    Delete Device
                </button>
            </div>
        </div>
    </div>
    `
}
