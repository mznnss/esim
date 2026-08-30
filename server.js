const express = require('express');
const cors = require('cors');

const app = express();

// Konfigurasi limit besar agar file foto bukti base64 terkirim lancar
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(cors());

// Database sementara (Array in-memory)
let orders = [];

// 1. Endpoint: Pelanggan membuat pesanan baru
app.post('/api/order', (req, res) => {
  const { package_name, price, email } = req.body;
  
  if (!package_name || !price || !email) {
    return res.status(400).json({ success: false, error: 'Data tidak lengkap' });
  }

  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

  const newOrder = {
    order_id: orderId,
    package_name,
    price: Number(price),
    email,
    proof_image: null,
    status: 'PENDING', // PENDING -> PAID
    created_at: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };

  orders.unshift(newOrder);
  console.log(`[Order Masuk] ID: ${orderId} | Email: ${email} | Paket: ${package_name}`);
  res.json({ success: true, order: newOrder });
});

// 2. Endpoint: Pelanggan mengunggah bukti bayar
app.post('/api/upload-proof', (req, res) => {
  const { order_id, proof_image } = req.body;
  const order = orders.find(o => o.order_id === order_id);

  if (!order) {
    return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan' });
  }

  order.proof_image = proof_image;
  console.log(`[Bukti Diterima] ID: ${order_id}`);
  res.json({ success: true, message: 'Bukti transfer berhasil diunggah' });
});

// 3. Endpoint: Polling status transaksi oleh halaman pembeli
app.get('/api/order-status/:orderId', (req, res) => {
  const order = orders.find(o => o.order_id === req.params.orderId);
  if (!order) {
    return res.status(404).json({ status: 'NOT_FOUND' });
  }
  res.json({ status: order.status });
});

// 4. Endpoint: Admin mengambil daftar semua pesanan
app.get('/api/admin/orders', (req, res) => {
  res.json(orders);
});

// 5. Endpoint: Admin memverifikasi pembayaran menjadi lunas
app.post('/api/admin/verify/:orderId', (req, res) => {
  const order = orders.find(o => o.order_id === req.params.orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan' });
  }

  order.status = 'PAID';
  console.log(`[VERIFIKASI LUNAS] ID: ${order.order_id} - Email: ${order.email}`);
  res.json({ success: true, order });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Server eSIM berjalan di http://localhost:${PORT}`);
  console.log(`========================================`);
});
