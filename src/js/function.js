export function scan_qr(callback){
    var options = {
        barcodeFormats: { QRCode: true },
        beepOnSuccess: true,
        vibrateOnSuccess: true,
        detectorSize: 0.6
    };

    cordova.plugins.mlkit.barcodeScanner.scan(
        options,
        function(result){
            if(result.cancelled){
                callback(null, "Scan dibatalkan");
                return;
            }
            callback(result.text, null);
        },
        function(error){
            callback(null, error);
        }
    );
}

// Parser EMV QRIS sederhana (format Tag-Length-Value)
export function parse_qris(payload){
    var data = {};
    var i = 0;

    while(i < payload.length - 4){
        var tag = payload.substr(i, 2);
        var len = parseInt(payload.substr(i + 2, 2), 10);

        if(isNaN(len)){ break; }

        var value = payload.substr(i + 4, len);
        data[tag] = value;
        i += 4 + len;
    }

    return {
        merchantName: data["59"] || "Merchant",
        merchantCity: data["60"] || "-",
        amount: data["54"] ? parseFloat(data["54"]) : null, // null = nominal belum ditentukan (QRIS statis)
        raw: payload
    };
}

export function lookup_qr(qrCode, callback){
    var token = localStorage.getItem("token");
    var base_url = "https://dogipay.renoaries.my.id/api";

    fetch(base_url + "/lookup-qr/" + encodeURIComponent(qrCode), {
        method: "GET",
        headers: { "Authorization": "Bearer " + token }
    })
    .then(function(response){
        return response.json().then(function(data){
            return { status: response.status, body: data };
        });
    })
    .then(function(result){ callback(result.status, result.body); })
    .catch(function(){ callback(0, { message: "Tidak dapat terhubung ke server" }); });
}

export function transfer_saldo(receiverPhone, amount, pin, callback){
    var token = localStorage.getItem("token");
    var base_url = "https://dogipay.renoaries.my.id/api";

    fetch(base_url + "/transfer", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ receiverPhone: receiverPhone, amount: amount, pin: pin })
    })
    .then(function(response){
        return response.json().then(function(data){
            return { status: response.status, body: data };
        });
    })
    .then(function(result){ callback(result.status, result.body); })
    .catch(function(){ callback(0, { message: "Tidak dapat terhubung ke server" }); });
}


// ═══════════════════════════════════════════
//  TRANSFER / GENERATE QR
// ═══════════════════════════════════════════

import qrcode from 'qrcode-generator';

let _trxStep       = 1;
let _trxNominal    = '';
let _trxCatatan    = '';
let _trxTimer      = null;
let _trxSeconds    = 180;

export function trxFormatRp(n) {
    if (!n) return 'Rp 0';
    return 'Rp ' + Number(n).toLocaleString('id-ID');
}

export function trxSetNominal(v) {
    _trxNominal = v;
    const input = document.getElementById('trx-input-nominal');
    if (input) input.value = v;
}

export function trxOnNominalInput(e) {
    _trxNominal = e.target.value;
}

export function trxOnCatatanInput(e) {
    _trxCatatan = e.target.value;
}

export function trxGoToStep(n, $f7) {
    _trxStep = n;

    const stepIds = ['trx-step-1', 'trx-step-2'];
    stepIds.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (el) el.style.display = (idx + 1 === n) ? '' : 'none';
    });

    const titles = { 1: 'Minta Transfer', 2: 'QR Code Transfer' };
    const titleEl = document.getElementById('trx-title');
    if (titleEl) titleEl.textContent = titles[n] || 'Transfer';

    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById('trx-dot-' + i);
        if (!dot) continue;
        dot.classList.remove('active', 'done');
        if (i < n) {
            dot.classList.add('done');
            dot.textContent = '✓';
        } else if (i === n) {
            dot.classList.add('active');
            dot.textContent = String(i);
        } else {
            dot.textContent = String(i);
        }
    }
    for (let i = 1; i <= 2; i++) {
        const line = document.getElementById('trx-line-' + i);
        if (line) line.classList.toggle('done', i < n);
    }
}

export function trxRenderQR() {
    const canvas = document.getElementById('trx-qr-canvas');
    if (!canvas) {
        console.error('[TRX] canvas trx-qr-canvas tidak ditemukan');
        return;
    }

    const ctx  = canvas.getContext('2d');
    const size = 200;
    ctx.clearRect(0, 0, size, size);

    // ── Ambil phone dari localStorage ──
    let userPhone = '';
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        userPhone  = user ? user.phone : '';
    } catch(e) {
        console.error('[TRX] Gagal parse user dari localStorage', e);
    }

    const qrData = `DOGIPAY|CLOSEPAY|PHONE:${userPhone}|NOM:${_trxNominal}|CAT:${_trxCatatan}|TS:${Date.now()}`;
    console.log('[TRX] Generate QR data:', qrData);

    try {
        const qr = qrcode(0, 'M');
        qr.addData(qrData);
        qr.make();

        const moduleCount = qr.getModuleCount();
        const cellSize    = size / moduleCount;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#1a1a2e';

        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(
                        Math.round(col * cellSize),
                        Math.round(row * cellSize),
                        Math.ceil(cellSize),
                        Math.ceil(cellSize)
                    );
                }
            }
        }
        console.log('[TRX] QR berhasil dirender, phone:', userPhone);
    } catch(err) {
        console.error('[TRX] Error render QR:', err);
    }
}

export function trxStopTimer() {
    if (_trxTimer) {
        clearInterval(_trxTimer);
        _trxTimer = null;
    }
}

export function trxStartTimer($f7) {
    trxStopTimer();
    _trxSeconds = 180;
    _trxUpdateTimerUI();
    _trxTimer = setInterval(() => {
        _trxSeconds--;
        if (_trxSeconds <= 0) {
            _trxSeconds = 180;
            trxRenderQR();
            $f7.toast.create({
                text: '🔄 QR Code diperbarui otomatis',
                position: 'bottom',
                closeTimeout: 1500,
            }).open();
        }
        _trxUpdateTimerUI();
    }, 1000);
}

function _trxUpdateTimerUI() {
    const m   = Math.floor(_trxSeconds / 60);
    const s   = _trxSeconds % 60;
    const pct = _trxSeconds / 180;

    const fill = document.getElementById('trx-refresh-fill');
    if (fill) fill.style.width = (pct * 100) + '%';

    const rl = document.getElementById('trx-refresh-label');
    if (rl) rl.textContent = `Auto-refresh ${m}:${s.toString().padStart(2, '0')}`;
}

export function trxBuatQR($f7) {
    if (!_trxNominal || parseInt(_trxNominal) < 1000) {
        $f7.toast.create({
            text: '⚠️ Masukkan nominal minimal Rp 1.000',
            position: 'bottom',
            closeTimeout: 2000,
        }).open();
        return;
    }

    const catatanField = document.getElementById('trx-catatan-field');
    if (catatanField) _trxCatatan = catatanField.value;

    document.getElementById('trx-qr-nominal').textContent  = trxFormatRp(_trxNominal);
    document.getElementById('trx-qr-catatan').textContent  = _trxCatatan || '';
    document.getElementById('trx-detail-nominal').textContent = trxFormatRp(_trxNominal);
    document.getElementById('trx-detail-catatan').textContent = _trxCatatan || '-';

    trxGoToStep(2, $f7);
    setTimeout(() => {
        trxRenderQR();
        trxStartTimer($f7);
    }, 50);
}

export function trxBagikanQR($f7) {
    const text = `🔗 Minta Transfer via Dogi Pay\nNominal: ${trxFormatRp(_trxNominal)}\nNo. Rek: 9012345678\nScan QR via menu QRIS`;
    if (navigator.share) {
        navigator.share({ title: 'Transfer Dogi Pay', text });
    } else {
        navigator.clipboard && navigator.clipboard.writeText(text);
        $f7.toast.create({ text: '✓ Info transfer disalin!', position: 'bottom', closeTimeout: 2000 }).open();
    }
}

export function trxBatalkan($f7) {
    $f7.dialog.confirm(
        'QR Code akan dibatalkan dan permintaan transfer ini akan dihapus. Lanjutkan?',
        'Batalkan Permintaan',
        () => { trxStopTimer(); trxResetForm($f7); }
    );
}

export function trxResetForm($f7) {
    trxStopTimer();
    _trxNominal = '';
    _trxCatatan = '';

    const input = document.getElementById('trx-input-nominal');
    if (input) input.value = '';
    const catatanField = document.getElementById('trx-catatan-field');
    if (catatanField) catatanField.value = '';

    trxGoToStep(1, $f7);
}

export function trxHandleBack($f7) {
    if (_trxStep === 2) {
        trxBatalkan($f7);
    } else {
        $f7.views.main.router.back();
    }
}

// IKI FUNGSI ANYAR GAE STEP 3 TRANSFER
export function trxGoToSuccess($f7, data) {
    trxStopTimer();
    trxGoToStep(3, $f7);

    // Update step dot 3 jadi done
    const dot3 = document.getElementById('trx-dot-3');
    if (dot3) {
        dot3.classList.add('done', 'active');
        dot3.textContent = '✓';
    }

    // Tampilkan step 3 — kita perlu tambah div-nya di template
    const step3 = document.getElementById('trx-step-3');
    if (step3) {
        step3.style.display = '';
        // Isi detail
        const el = step3.querySelector('#trx-success-nama');
        if (el) el.textContent = data.senderName || '-';
        const elNominal = step3.querySelector('#trx-success-nominal');
        if (elNominal) elNominal.textContent = 'Rp ' + Number(data.amount).toLocaleString('id-ID');
    }
}