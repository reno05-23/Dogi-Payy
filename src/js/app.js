import $ from 'dom7';
import Framework7, { getDevice } from './framework7-custom.js';

// Import F7 Styles
import '../css/framework7-custom.less';

// Import Icons and App Custom Styles
import '../css/icons.css';
import '../css/custom.css';
import '../css/app.less';
// Import Cordova APIs
import cordovaApp from './cordova-app.js';

// Import Routes
import routes from './routes.js';
// Import Store
import store from './store.js';

// Import main app component
import App from '../app.f7';

var device = getDevice();
var app = new Framework7({
  name: 'Dogi Pay', // App name
  theme: 'auto', // Automatic theme detection


  el: '#app', // App root element
  component: App, // App main component
  // App store
  store: store,
  // App routes
  routes: routes,



  // Input settings
  input: {
    scrollIntoViewOnFocus: device.cordova,
    scrollIntoViewCentered: device.cordova,
  },
  // Cordova Statusbar settings
  statusbar: {
    iosOverlaysWebView: true,
    androidOverlaysWebView: false,
  },
  on: {
    init: function () {
      var f7 = this;
      if (f7.device.cordova) {
        cordovaApp.init(f7);
      }

      // SSE dengan fallback manual untuk Cordova
      function startSSE() {
        const token = localStorage.getItem('token');
        if (!token) return;

        const API_BASE = (window.location.hostname === 'localhost' && window.location.port === '3000')
          ? 'http://localhost:3000'
          : 'https://dogipay.renoaries.my.id';

        const url = `${API_BASE}/api/topup-events?token=${encodeURIComponent(token)}`;
        console.log('[SSE] Connecting:', url);

        // Coba EventSource dulu (browser/Vite)
        if (typeof EventSource !== 'undefined') {
          const es = new EventSource(url);
          window._dogipaySSE = es;

          es.addEventListener('connected', e => {
            console.log('[SSE] Connected via EventSource!', e.data);
          });

          es.addEventListener('topup_success', e => {
            console.log('[SSE] topup_success:', e.data);
            handleTopupSuccess(JSON.parse(e.data));
          });

          es.onerror = () => {
            console.warn('[SSE] EventSource error, retry in 5s...');
            es.close();
            setTimeout(startSSE, 5000);
          };

        } else {
          // Fallback: manual fetch stream untuk Cordova WebView
          console.log('[SSE] EventSource tidak ada, pakai fetch stream...');
          fetchSSE(url);
        }
      }

      function fetchSSE(url) {
        const controller = new AbortController();
        window._sseAbort = controller;

        fetch(url, { signal: controller.signal })
          .then(res => {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            function read() {
              reader.read().then(({ done, value }) => {
                if (done) {
                  console.warn('[SSE] Stream ended, retry in 5s...');
                  setTimeout(startSSE, 5000);
                  return;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // simpan baris tidak lengkap

                let eventType = 'message';
                let eventData = '';

                lines.forEach(line => {
                  if (line.startsWith('event:')) {
                    eventType = line.replace('event:', '').trim();
                  } else if (line.startsWith('data:')) {
                    eventData = line.replace('data:', '').trim();
                  } else if (line === '') {
                    // Event selesai
                    if (eventData) {
                      console.log(`[SSE] event: ${eventType}`, eventData);
                      if (eventType === 'topup_success') {
                        try {
                          handleTopupSuccess(JSON.parse(eventData));
                        } catch (e) {
                          console.error('[SSE] Parse error:', e);
                        }
                      } else if (eventType === 'connected') {
                        console.log('[SSE] Connected via fetch stream!');
                      }
                      eventType = 'message';
                      eventData = '';
                    }
                  }
                });

                read(); // lanjut baca
              }).catch(err => {
                console.warn('[SSE] Read error, retry in 5s...', err);
                setTimeout(startSSE, 5000);
              });
            }

            read();
          })
          .catch(err => {
            console.warn('[SSE] Fetch error, retry in 5s...', err);
            setTimeout(startSSE, 5000);
          });
      }

      function handleTopupSuccess(data) {
        // Update localStorage
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        user.saldo = data.saldoAfter;
        localStorage.setItem('user', JSON.stringify(user));

        // Update DOM langsung
        const saldoEl = document.querySelector('[data-name="beranda"] .font22.font-weight-bold');
        if (saldoEl) {
          saldoEl.textContent = 'Rp ' + Number(data.saldoAfter).toLocaleString('id-ID');
          console.log('[SSE] Saldo DOM updated:', data.saldoAfter);
        } else {
          console.warn('[SSE] Saldo element not found');
        }

        // Broadcast ke komponen lain
        window.dispatchEvent(new CustomEvent('dogipay-saldo-update', { detail: data }));
      }

      // Start SSE setelah app init
      // Delay sedikit agar login state sudah ready
      window.startSSE = startSSE;

      const token = localStorage.getItem('token');
      if (token) {
        setTimeout(startSSE, 500);
      }
    },
  },
});