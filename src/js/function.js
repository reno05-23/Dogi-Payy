import { Html5Qrcode } from "html5-qrcode";
import qrcode from 'qrcode-generator';

let html5QrCode;

// /////////////////////////////////////////////
//                 FUNGSI SCAN QR
// ////////////////////////////////////////////

export function scan_qr(callback) {
    html5QrCode = new Html5Qrcode("kamera-reader");

    const config = {
        fps: 10,
        aspectRatio: window.innerHeight / window.innerWidth
    };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            html5QrCode.stop().then(() => {
                callback(decodedText, null);
            }).catch((err) => {
                console.error("Gagal mematikan kamera", err);
                callback(decodedText, null);
            });
        },
        () => { }
    ).catch(() => {
        callback(null, "Gagal mengakses kamera. Pastikan izin kamera diberikan.");
    });
}

export function stop_scan() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Error stopping", err));
    }
}

export function parse_qris(payload) {
    var data = {};
    var i = 0;

    while (i < payload.length - 4) {
        var tag = payload.substr(i, 2);
        var len = parseInt(payload.substr(i + 2, 2), 10);

        if (isNaN(len)) break;

        var value = payload.substr(i + 4, len);
        data[tag] = value;
        i += 4 + len;
    }

    return {
        merchantName: data["59"] || "Merchant",
        merchantCity: data["60"] || "-",
        amount: data["54"] ? parseFloat(data["54"]) : null,
        raw: payload
    };
}

export function lookup_qr(qrCode, callback) {
    var token = localStorage.getItem("token");
    var base_url = "https://dogipay.renoaries.my.id/api";

    fetch(base_url + "/lookup-qr/" + encodeURIComponent(qrCode), {
        method: "GET",
        headers: { "Authorization": "Bearer " + token }
    })
        .then(response => response.json().then(data => ({ status: response.status, body: data })))
        .then(result => callback(result.status, result.body))
        .catch(() => callback(0, { message: "Tidak dapat terhubung ke server" }));
}

export function transfer_saldo(receiverPhone, amount, catatan, callback) {
    var token = localStorage.getItem("token");
    var base_url = "https://dogipay.renoaries.my.id/api";

    fetch(base_url + "/transfer", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ receiverPhone, amount, catatan })
    })
        .then(response => response.json().then(data => ({ status: response.status, body: data })))
        .then(result => callback(result.status, result.body))
        .catch(() => callback(0, { message: "Tidak dapat terhubung ke server" }));
}


// ── State Transfer / Generate QR ──

let _trxStep = 1;
let _trxNominal = '';
let _trxCatatan = '';
let _trxTimer = null;
let _trxSeconds = 180;

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

    ['trx-step-1', 'trx-step-2'].forEach((id, idx) => {
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
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const size = 200;
    ctx.clearRect(0, 0, size, size);

    let userPhone = '';
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        userPhone = user ? user.phone : '';
    } catch (e) {
        console.error('[TRX] Gagal parse user dari localStorage', e);
    }

    const qrData = `DOGIPAY|CLOSEPAY|PHONE:${userPhone}|NOM:${_trxNominal}|CAT:${_trxCatatan}|TS:${Date.now()}`;
    try {
        const qr = qrcode(0, 'M');
        qr.addData(qrData);
        qr.make();

        const moduleCount = qr.getModuleCount();
        const cellSize = size / moduleCount;

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
    } catch (err) {
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
    const m = Math.floor(_trxSeconds / 60);
    const s = _trxSeconds % 60;
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

    document.getElementById('trx-qr-nominal').textContent = trxFormatRp(_trxNominal);
    document.getElementById('trx-qr-catatan').textContent = _trxCatatan || '';
    document.getElementById('trx-detail-nominal').textContent = trxFormatRp(_trxNominal);
    document.getElementById('trx-detail-catatan').textContent = _trxCatatan || '-';

    trxGoToStep(2, $f7);
    setTimeout(() => {
        trxRenderQR();
        trxStartTimer($f7);
    }, 50);
}

// //////////////////////////////////////////
//             FUNGSI BAGIKAN QR
// /////////////////////////////////////////
export function trxBagikanQR($f7) {
    trxRenderShareCanvas(function (imageUrl) {
        if (window.plugins && window.plugins.socialsharing) {
            window.plugins.socialsharing.share(
                null,
                'qr-transfer.png',
                imageUrl,
                null,
                function () { },
                function (err) {
                    console.error('Share error:', err);
                    $f7.toast.create({ text: '⚠️ Gagal membagikan QR', position: 'bottom', closeTimeout: 2000 }).open();
                }
            );
        } else if (navigator.share) {
            const byteString = atob(imageUrl.split(',')[1]);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            const blob = new Blob([ia], { type: 'image/png' });
            const file  = new File([blob], 'qr-transfer.png', { type: 'image/png' });
            navigator.share({ files: [file] })
                .catch(err => console.error('Share error:', err));
        } else {
            $f7.dialog.alert('Fitur berbagi tidak tersedia di perangkat ini.', 'Tidak Tersedia');
        }
    });
}

// /////////////////////////////////////////////////
//              CANVAS BAGIKAN QR
// ////////////////////////////////////////////////
export function trxRenderShareCanvas(callback) {
    const srcCanvas = document.getElementById('trx-qr-canvas');
    const shareCanvas = document.getElementById('trx-share-canvas');
    if (!srcCanvas || !shareCanvas) return;

    let userName = '-';
    let userPhone = '-';
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user) {
            userName = user.name || '-';
            userPhone = user.phone || '-';
        }
    } catch (e) { }

    const nominal = trxFormatRp(_trxNominal);

    const ctx = shareCanvas.getContext('2d');
    const W = shareCanvas.width;   // 500
    const H = shareCanvas.height;  // 680 — naikkan tinggi canvas

    shareCanvas.height = 680;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // ── Header DogiPay ──
    const headerY = 50;
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(W / 2 - 78, headerY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D', W / 2 - 78, headerY + 1);

    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('DogiPay', W / 2 - 52, headerY + 8);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, headerY + 36);
    ctx.lineTo(W - 40, headerY + 36);
    ctx.stroke();

    // ── QR ──
    const qrSize = 340;
    const qrX = (W - qrSize) / 2;
    const qrY = headerY + 64;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
    ctx.restore();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
    ctx.drawImage(srcCanvas, qrX, qrY, qrSize, qrSize);

    // ── Info teks di dalam gambar ──
    const infoY = qrY + qrSize + 48;

    ctx.strokeStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(40, infoY - 20);
    ctx.lineTo(W - 40, infoY - 20);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(userName, W / 2, infoY + 4);

    ctx.fillStyle = '#6b7280';
    ctx.font = '13px Arial';
    ctx.fillText(userPhone, W / 2, infoY + 24);

    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(nominal, W / 2, infoY + 56);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px Arial';
    ctx.fillText('Scan QR ini untuk transfer ke saya', W / 2, infoY + 80);

    callback(shareCanvas.toDataURL('image/png'));
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

// /////////////////////////////////////////////
// IKI FUNGSI ANYAR GAE STEP 3 TRANSFER
// /////////////////////////////////////////////
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

// //////////////////////////////////////
// CANVAS CETAK BUKTI TRANFER (WA)
// //////////////////////////////////////
export function cetakBukti(data, callback) {
    const canvas = document.getElementById('bukti-canvas');
    const ctx = canvas.getContext('2d');

    const W = canvas.width;
    const H = canvas.height;

    const fmtRp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
    const now = new Date();
    const tgl = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const refId = 'DGP' + Date.now().toString().slice(-8);
    const biaya = 0;
    const total = Number(data.amount) + biaya;

    // ── Background ──
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // ── Header ──
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DOGI PAY', W / 2, 32);
    ctx.font = '13px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Bukti Transfer', W / 2, 56);

    // ── Ikon sukses ──
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(W / 2, 106, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial';
    ctx.fillText('✓', W / 2, 114);
    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 15px Arial';
    ctx.fillText('Transfer Berhasil', W / 2, 146);

    // ── Helper ──
    const dashedLine = (y) => {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(24, y); ctx.lineTo(W - 24, y);
        ctx.stroke();
        ctx.restore();
    };

    const row = (label, value, y, valueColor = '#111827', valueBold = false) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px Arial';
        ctx.fillText(label, 32, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = valueColor;
        ctx.font = valueBold ? 'bold 13px Arial' : '13px Arial';
        ctx.fillText(value, W - 32, y);
    };

    const subtext = (text, y) => {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#9ca3af';
        ctx.font = '11px Arial';
        ctx.fillText(text, W - 32, y);
    };

    dashedLine(165);

    // ── Pengirim ──
    row('Pengirim', data.senderName || '-', 188);
    subtext(data.senderPhone || '-', 204);

    // ── Penerima ──
    row('Penerima', data.receiverName || '-', 228);
    subtext(data.receiverPhone || '-', 244);

    dashedLine(260);

    // ── Nominal ──
    row('Jumlah Transfer', fmtRp(data.amount), 282);
    row('Biaya Transaksi', fmtRp(biaya), 306);

    dashedLine(322);

    // ── Total ──
    row('Jumlah Total', fmtRp(total), 344, '#1a1a2e', true);

    dashedLine(360);

    // ── Info transaksi ──
    row('No. Referensi', refId, 382);
    row('Tanggal', tgl, 406);
    row('Waktu', jam, 430);

    dashedLine(448);

    // ── Footer ──
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px Arial';
    ctx.fillText('Terima kasih telah menggunakan Dogi Pay', W / 2, 472);
    ctx.fillText('Simpan struk ini sebagai bukti transaksi', W / 2, 490);

    // ── Barcode dekoratif ──
    ctx.fillStyle = '#e5e7eb';
    for (let i = 0; i < 30; i++) {
        const bw = (Math.random() > 0.5 ? 4 : 2);
        ctx.fillRect(32 + i * 11, 508, bw, 28);
    }
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px Arial';
    ctx.fillText(refId, W / 2, 550);

    callback(canvas.toDataURL('image/png'));
}

// /////////////////////////////////////////
// CANVAS CETAK PRINT
// ////////////////////////////////////////
export function formatStrukBluetooth(data) {
    const fmtRp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
    const now = new Date().toLocaleString('id-ID');
    const line = '--------------------------------';
    const refId = 'DGP' + Date.now().toString().slice(-8);
    const biaya = 0;
    const total = Number(data.amount) + biaya;

    return [
        '         DOGI PAY        ',
        '      BUKTI TRANSFER     ',
        line,
        'Status   : BERHASIL',
        line,
        'PENGIRIM',
        'Nama     : ' + (data.senderName || '-'),
        'No. HP   : ' + (data.senderPhone || '-'),
        line,
        'PENERIMA',
        'Nama     : ' + (data.receiverName || '-'),
        'No. HP   : ' + (data.receiverPhone || '-'),
        line,
        'Jumlah   : ' + fmtRp(data.amount),
        'Biaya    : ' + fmtRp(biaya),
        'TOTAL    : ' + fmtRp(total),
        line,
        'Ref      : ' + refId,
        'Tanggal  : ' + now,
        line,
        '   Terima kasih telah    ',
        '    menggunakan DogiPay  ',
        '\n\n\n',
    ].join('\n');
}