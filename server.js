const express = require('express');
const midtransClient = require('midtrans-client');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Inisialisasi Midtrans Core API (Gunakan Server Key Anda)
const coreApi = new midtransClient.CoreApi({
  isProduction: false, // Ubah ke true jika sudah live
  serverKey: 'SB-Mid-server-xxxxxxxxxxxx',
  clientKey: 'SB-Mid-client-xxxxxxxxxxxx'
});

// Database sederhana sementara (in-memory) untuk data pesanan
const ordersDB = {};

// 1. Endpoint Generate Dynamic QRIS
app.post('/api/charge-qris', async (req, res) => {
  const { package_name, price, customer_email } = req.body;
  const orderId = 'ESIM-' + Date.now();

  try {
    const parameter = {
      payment_type: 'qris',
      transaction_details: {
        order_id: orderId,
        gross_amount: price
      },
      customer_details: {
        email: customer_email
      }
    };

    // Request QRIS ke Midtrans
    const chargeResponse = await coreApi.charge(parameter);
    
    // Simpan data order
    ordersDB[orderId] = {
      orderId,
      package_name,
      customer_email,
      price,
      status: 'pending'
    };

    // Mengembalikan URL QR code string ke frontend
    res.json({
      success: true,
      order_id: orderId,
      qr_url: chargeResponse.actions[0].url // URL gambar QRIS
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Endpoint Polling Cek Status Pembayaran (Dipanggil frontend berkala)
app.get('/api/check-status/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    const statusResponse = await coreApi.transaction.status(orderId);
    const trxStatus = statusResponse.transaction_status;

    // Jika pembayaran sukses
    if (trxStatus === 'settlement' || trxStatus === 'capture') {
      if (ordersDB[orderId]) {
        ordersDB[orderId].status = 'paid';
      }
      return res.json({ status: 'success', message: 'Pembayaran Diterima' });
    }

    if (trxStatus === 'expire' || trxStatus === 'cancel') {
      return res.json({ status: 'failed', message: 'Transaksi Dibatalkan/Kedaluwarsa' });
    }

    // Masih menunggu pembayaran
    res.json({ status: 'pending' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
