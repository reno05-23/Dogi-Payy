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

      // ← TAMBAHKAN INI
      const token = localStorage.getItem('token');
      if (token && typeof EventSource !== 'undefined') {
        const API_BASE = (window.location.hostname === 'localhost' && window.location.port === '3000')
        ? 'http://localhost:3000'
        : 'https://dogipay.renoaries.my.id';
        const url = `${API_BASE}/api/topup-events?token=${encodeURIComponent(token)}`;
        console.log('[SSE] App init connecting:', url);

        const es = new EventSource(url);
        es.addEventListener('connected', e => console.log('[SSE] Connected!', e.data));
        es.addEventListener('topup_success', e => {
          console.log('[SSE] topup_success:', e.data);
          const data = JSON.parse(e.data);
          
          // Update localStorage
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          user.saldo = data.saldoAfter;
          localStorage.setItem('user', JSON.stringify(user));
          
          // Update DOM langsung tanpa perlu F7 lifecycle
          const saldoEl = document.querySelector('[data-name="beranda"] .font22.font-weight-bold');
          if (saldoEl) {
            saldoEl.textContent = 'Rp ' + Number(data.saldoAfter).toLocaleString('id-ID');
            console.log('[SSE] Saldo DOM updated:', data.saldoAfter);
          } else {
            console.warn('[SSE] Saldo element not found');
          }
          
          // Broadcast untuk komponen lain
          window.dispatchEvent(new CustomEvent('dogipay-saldo-update', { detail: data }));
        });
       es.onerror = () => {
        console.warn('[SSE] Disconnected, reconnecting in 5s...');
        es.close();
        setTimeout(() => {
          // Reconnect SSE tanpa reload halaman
          const newEs = new EventSource(url);
          window._dogipaySSE = newEs;
        }, 5000);
      };
      }
    },
  },
});