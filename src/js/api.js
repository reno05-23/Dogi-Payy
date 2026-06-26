const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ==========================================
// 1. KONFIGURASI DATABASE
// ==========================================
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, // <-- Sudah disesuaikan dengan .env Anda
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
// Kunci Rahasia JWT (Sebaiknya ambil dari file .env)
const JWT_SECRET = process.env.SESSION_SECRET || 'dogipay_rahasia_super_aman';

// ==========================================
// 2. MIDDLEWARE KEAMANAN (JWT & STATUS)
// ==========================================
// Mencegat semua request untuk memastikan user valid dan token belum kedaluwarsa
const verifyTokenAndStatus = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Mengambil token dari format "Bearer <token>"

        if (!token) {
            return res.status(401).json({ success: false, message: "Akses ditolak. Sesi tidak ditemukan." });
        }

        jwt.verify(token, JWT_SECRET, async (err, decoded) => {
            if (err) return res.status(403).json({ success: false, message: "Sesi telah berakhir. Silakan login kembali." });

            const userId = decoded.id;

            // Cek status keaktifan akun di database
            const [rows] = await pool.query('SELECT is_active FROM users WHERE id = ? LIMIT 1', [userId]);

            if (rows.length === 0 || rows[0].is_active !== 1) {
                return res.status(403).json({ success: false, message: "Akses ditolak. Akun Anda sedang ditangguhkan." });
            }

            // Menyimpan data user ke dalam request agar bisa diakses oleh rute berikutnya
            req.user = decoded;
            next();
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Gagal memverifikasi keamanan." });
    }
};

// ==========================================
// 3. ENDPOINT API MOBILE DOGIPAY
// ==========================================

// A. Pengecekan Status API (Health Check)
router.get('/status', (req, res) => {
    res.status(200).json({
        success: true,
        message: "API Mobile DogiPay berjalan sempurna dengan JWT!",
        timestamp: new Date().toISOString()
    });
});

// ==========================================
// B. Fitur Register (Menggunakan Nomor HP & PIN 6 Digit)
// ==========================================
router.post('/register', async (req, res) => {
    try {
        // Kita mengambil 'pin' dari input pengguna, bukan lagi 'password' teks panjang
        const { name, email, phone, pin } = req.body;

        if (!name || !email || !phone || !pin) {
            return res.status(400).json({ success: false, message: "Semua kolom wajib diisi." });
        }

        // Validasi ketat: PIN harus berupa angka dan pas 6 digit
        if (!/^\d{6}$/.test(pin)) {
            return res.status(400).json({ success: false, message: "PIN harus berupa 6 digit angka." });
        }

        const [existingUser] = await pool.query(
            'SELECT id FROM users WHERE phone = ? OR email = ? LIMIT 1', 
            [phone, email]
        );
        
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, message: "Nomor HP atau Email sudah terdaftar." });
        }

        // Enkripsi PIN (Tetap dienkripsi demi keamanan ekstra)
        const saltRounds = 10;
        const hashedPin = await bcrypt.hash(pin, saltRounds);
        
        const qrCode = `QR-USER-${Date.now()}-${phone.substring(phone.length - 4)}`;

        // Menyimpan data. hashedPin dimasukkan ke kolom 'password' dan 'pin' agar aman dari error NOT NULL
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password, pin, phone, qr_code, saldo, is_active, tabungan) VALUES (?, ?, ?, ?, ?, ?, 0.00, 1, 0.00)',
            [name, email, hashedPin, hashedPin, phone, qrCode]
        );

        res.status(201).json({
            success: true,
            message: "Pendaftaran berhasil! Silakan login dengan Nomor HP dan PIN Anda.",
            data: { id: result.insertId, name: name, phone: phone }
        });

    } catch (error) {
        console.error("Error Register:", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Kesalahan internal server saat mendaftar", 
            error_detail: error.message 
        });
    }
});

// ==========================================
// C. Fitur Login (Menggunakan Nomor HP & PIN)
// ==========================================
router.post('/login', async (req, res) => {
    try {
        const { phone, pin } = req.body;
        
        if (!phone || !pin) return res.status(400).json({ success: false, message: "Harap isi Nomor HP dan PIN" });

        const [rows] = await pool.query('SELECT * FROM users WHERE phone = ? LIMIT 1', [phone]);
        
        if (rows.length === 0) return res.status(401).json({ success: false, message: "Nomor HP tidak terdaftar" });

        const user = rows[0];
        
        if (user.is_active !== 1) return res.status(403).json({ success: false, message: "Login gagal. Akun Anda tidak aktif." });

        // Cek kecocokan PIN yang diinput dengan PIN yang tersimpan dan terenkripsi di database
        // Kita mengecek ke kolom password karena sebelumnya kita simpan hashed PIN di sana
        const match = await bcrypt.compare(pin, user.password);
        if (!match) return res.status(401).json({ success: false, message: "PIN salah" });

        // Membuat Token JWT
        const accessToken = jwt.sign(
            { id: user.id, phone: user.phone }, 
            process.env.SESSION_SECRET || 'dogipay_rahasia_super_aman', 
            { expiresIn: '7d' } 
        );

        res.status(200).json({
            success: true,
            message: "Login berhasil",
            token: accessToken,
            data: { 
                id: user.id, 
                name: user.name, 
                phone: user.phone, 
                qr_code: user.qr_code, 
                saldo: user.saldo,
                tabungan: user.tabungan || 0
            }
        });
    } catch (error) {
        console.error("Error Login:", error);
        res.status(500).json({ success: false, message: "Kesalahan internal server" });
    }
});

// D. Ambil Profil & Refresh Saldo (Terlindungi JWT)
router.get('/profile', verifyTokenAndStatus, async (req, res) => {
    try {
        const userId = req.user.id; // Diambil langsung dari Token
        const [rows] = await pool.query('SELECT id, name, phone, qr_code, saldo, tabungan FROM users WHERE id = ?', [userId]);
        
        if (rows.length === 0) return res.status(404).json({ success: false, message: "User tidak ditemukan" });

        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: "Gagal memuat profil" });
    }
});

// E. Fitur Top Up (Terlindungi JWT)
router.post('/topup', verifyTokenAndStatus, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userId = req.user.id; 
        const { merchantId, amount } = req.body;
        
        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Nominal tidak valid" });

        await connection.beginTransaction();

        const [users] = await connection.query('SELECT saldo FROM users WHERE id = ? FOR UPDATE', [userId]);
        if (users.length === 0) throw new Error("User tidak ditemukan");
        
        const saldoBefore = parseFloat(users[0].saldo);
        const saldoAfter = saldoBefore + parseFloat(amount);

        await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [saldoAfter, userId]);
        
        // Catat Transaksi
        await connection.query(
            'INSERT INTO topup_transactions (merchant_id, user_id, amount, saldo_before, saldo_after, status) VALUES (?, ?, ?, ?, ?, ?)',
            [merchantId || 1, userId, amount, saldoBefore, saldoAfter, 'success']
        );
        
        // Notifikasi
        await connection.query(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [userId, 'Saldo Masuk', `Berhasil top up saldo sebesar Rp ${amount}`, 'topup']
        );

        await connection.commit();
        res.status(200).json({ success: true, message: `Top up Rp ${amount} berhasil`, saldo: saldoAfter });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message || "Top up gagal" });
    } finally {
        connection.release();
    }
});

// F. Fitur Transfer Saldo (Terlindungi JWT)
router.post('/transfer', verifyTokenAndStatus, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const senderId = req.user.id; // Mencegah user A mengirim request pakai ID user B
        const { receiverPhone, amount } = req.body;
        
        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Nominal transfer tidak valid" });

        await connection.beginTransaction();

        // Kunci Data Pengirim
        const [senders] = await connection.query('SELECT id, saldo FROM users WHERE id = ? FOR UPDATE', [senderId]);
        const sender = senders[0];
        if (parseFloat(sender.saldo) < amount) throw new Error("Saldo utama tidak mencukupi");

        // Kunci Data Penerima
        const [receivers] = await connection.query('SELECT id, name, saldo, is_active FROM users WHERE phone = ? FOR UPDATE', [receiverPhone]);
        if (receivers.length === 0) throw new Error("Nomor tujuan tidak ditemukan");
        
        const receiver = receivers[0];
        if (receiver.is_active !== 1) throw new Error("Akun tujuan sedang tidak aktif");
        if (sender.id === receiver.id) throw new Error("Tidak bisa transfer ke nomor sendiri");

        // Hitung Saldo
        const senderSaldoAfter = parseFloat(sender.saldo) - parseFloat(amount);
        const receiverSaldoAfter = parseFloat(receiver.saldo) + parseFloat(amount);

        // Eksekusi Pemindahan Saldo
        await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [senderSaldoAfter, sender.id]);
        await connection.query('UPDATE users SET saldo = ? WHERE id = ?', [receiverSaldoAfter, receiver.id]);

        // Catat Riwayat
        await connection.query(
            'INSERT INTO transfer_transactions (sender_id, receiver_id, amount, saldo_before_sender, saldo_after_sender, saldo_before_receiver, saldo_after_receiver, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [sender.id, receiver.id, amount, sender.saldo, senderSaldoAfter, receiver.saldo, receiverSaldoAfter, 'success']
        );

        // Notifikasi Notifikasi
        await connection.query(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [receiver.id, 'Transfer Masuk', `Menerima dana sebesar Rp ${amount}`, 'transfer_in']
        );
        await connection.query(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [sender.id, 'Transfer Keluar', `Berhasil mengirim Rp ${amount} ke ${receiver.name}`, 'transfer_out']
        );

        await connection.commit();
        res.status(200).json({ success: true, message: `Transfer Rp ${amount} ke ${receiver.name} berhasil`, saldo: senderSaldoAfter });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message || "Transfer gagal" });
    } finally {
        connection.release();
    }
});

// G. Fitur Tabungan (Terlindungi JWT)
router.post('/savings', verifyTokenAndStatus, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userId = req.user.id;
        const { amount } = req.body;
        
        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Nominal tidak valid" });

        await connection.beginTransaction();

        const [users] = await connection.query('SELECT saldo, tabungan FROM users WHERE id = ? FOR UPDATE', [userId]);
        if (users.length === 0) throw new Error("User tidak ditemukan");

        const user = users[0];
        if (parseFloat(user.saldo) < amount) throw new Error("Saldo utama tidak mencukupi untuk menabung");

        const saldoAfter = parseFloat(user.saldo) - parseFloat(amount);
        const tabunganAfter = parseFloat(user.tabungan) + parseFloat(amount); 

        await connection.query('UPDATE users SET saldo = ?, tabungan = ? WHERE id = ?', [saldoAfter, tabunganAfter, userId]);

        await connection.query(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [userId, 'Tabungan', `Berhasil memindahkan Rp ${amount} ke tabungan`, 'system']
        );

        await connection.commit();
        res.status(200).json({ success: true, message: "Berhasil menabung", saldo: saldoAfter, tabungan: tabunganAfter });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message || "Gagal memproses tabungan" });
    } finally {
        connection.release();
    }
});

// H. Fitur Riwayat Transaksi (Terlindungi JWT)
router.get('/history', verifyTokenAndStatus, async (req, res) => {
    try {
        const userId = req.user.id;
        const [history] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: "Gagal memuat riwayat transaksi" });
    }
});

module.exports = router;