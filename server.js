const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Database sederhana di memori server
let orders = [];

// 1. Endpoint Pembeli: Buat Pesanan Baru
app.post('/api/order', (req, res) => {
  const { package_name, price, email } = req.body;
  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000); // ID unik 6 digit

  const newOrder = {
    order_id: orderId,
    package_name,
    price,
    email,
    status: 'PENDING', // PENDING -> PAID
    created_at: new Date().toLocaleTimeString('id-ID')
  };

  orders.unshift(newOrder);
  res.json({ success: true, order: newOrder });
});

// 2. Endpoint Pembeli: Auto-Check Status (Polling)
app.get('/api/order-status/:orderId', (req, res) => {
  const order = orders.find(o => o.order_id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ status: order.status });
});

// 3. Endpoint Admin: Ambil Semua Pesanan
app.get('/api/admin/orders', (req, res) => {
  res.json(orders);
});

// 4. Endpoint Admin: Ubah Status jadi PAID
app.post('/api/admin/verify/:orderId', (req, res) => {
  const order = orders.find(o => o.order_id === req.params.orderId);
  if (order) {
    order.status = 'PAID';
    return res.json({ success: true, order });
  }
  res.status(404).json({ error: 'Order not found' });
});

app.listen(3000, () => console.log('Server berjalan di http://localhost:3000'));
