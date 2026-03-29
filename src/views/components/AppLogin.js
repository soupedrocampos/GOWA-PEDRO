export default {
    name: 'AppLogin',
    props: {
        loggedIn: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            login_link: '',
            login_duration_sec: 0,
            countdown_timer: null,
        }
    },
    methods: {
        async openModal() {
            try {
                if (this.loggedIn) throw Error('You are already logged in.');

                await this.submitApi();
                $('#modalLogin').modal({
                    onApprove: function () {
                        return false;
                    },
                    onHidden: () => {
                        this.stopCountdown();
                    }
                }).modal('show');
            } catch (err) {
                showErrorInfo(err)
            }
        },
        async submitApi() {
            try {
                // Stop existing countdown before making new request
                this.stopCountdown();
                
                let response = await window.http.get(`app/login`)
                let results = response.data.results;
                this.login_link = results.qr_link;
                this.login_duration_sec = results.qr_duration;
                
                // Start countdown after successful API call
                this.startCountdown();
            } catch (error) {
                if (error.response) {
                    throw Error(error.response.data.message)
                }
                throw Error(error.message)
            }
        },
        startCountdown() {
            // Clear any existing timer
            this.stopCountdown();
            
            this.countdown_timer = setInterval(() => {
                if (this.login_duration_sec > 0) {
                    this.login_duration_sec--;
                } else {
                    // Auto refresh when countdown reaches 0
                    this.autoRefresh();
                }
            }, 1000);
        },
        stopCountdown() {
            if (this.countdown_timer) {
                clearInterval(this.countdown_timer);
                this.countdown_timer = null;
            }
        },
        async autoRefresh() {
            try {
                console.log('QR Code expired, auto refreshing...');
                await this.submitApi();
            } catch (error) {
                console.error('Auto refresh failed:', error);
                this.stopCountdown();
                showErrorInfo(error);
            }
        },
        t(key) { return window.i18n ? window.i18n.t(key) : key; }
    },
    beforeUnmount() {
        // Clean up timer when component is destroyed
        this.stopCountdown();
    },
    template: `
    <div class="green card" @click="openModal" style="cursor: pointer">
        <div class="content">
            <a class="ui teal right ribbon label">App</a>
            <div class="header">Login</div>
            <div class="description">
                Escaneie o QR Code para conectar o dispositivo.
            </div>
        </div>
    </div>
    
    <!--  Modal Login  -->
    <div class="ui small modal" id="modalLogin">
        <i class="close icon"></i>
        <div class="header">
            Login WhatsApp
        </div>
        <div class="image content">
            <div class="ui medium image">
                <img :src="login_link" alt="qrCodeLogin">
            </div>
            <div class="description">
                <div class="ui header">Aponte a câmera para conectar</div>
                <p>Abra Configurações &gt; Dispositivos conectados &gt; Conectar dispositivo</p>
                <div style="padding-top: 50px;">
                    <i v-if="login_duration_sec > 0">QR Code expira em {{ login_duration_sec }} segundos (atualizando automaticamente)</i>
                    <i v-else class="ui active inline">Atualizando QR Code...</i>
                </div>
            </div>
        </div>
        <div class="actions">
            <div class="ui cancel button">
                <i class="times icon"></i> Fechar
            </div>
            <div class="ui approve positive right labeled icon button" @click="submitApi">
                Atualizar QR Code
                <i class="refresh icon"></i>
            </div>
        </div>
    </div>
    `
}