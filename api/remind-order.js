import nodemailer from 'nodemailer';

const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GMAIL_USER = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID wajib disertakan' });
  }

  try {
    const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
    const order = await orderRes.json();

    if (!order) {
      return res.status(404).json({ error: 'Data pesanan tidak ditemukan di database' });
    }

    const createdTime = new Date(order.pending_since || order.created_at).getTime();
    const diffMinutes = Math.floor((Date.now() - createdTime) / (1000 * 60));
    const remainingMinutes = Math.max(1, 60 - diffMinutes);

    // 1. Kirim Notifikasi Pengingat ke Chat Telegram Pembeli (Jika ada Chat ID)
    if (order.buyer_chat_id) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: order.buyer_chat_id,
          text: `⏰ *PENGINGAT PEMBAYARAN ESIM*\n━━━━━━━━━━━━━━━━━━\nHalo! Pesanan *#${orderId}* (*${order.package_name || '-'}*) belum menyelesaikan pembayaran.\n\n💰 *Total Tagihan:* Rp ${Number(order.price || 0).toLocaleString('id-ID')}\n⏳ *Sisa Batas Waktu Bayar:* ${remainingMinutes} Menit\n\nSilakan segera transfer via QRIS dan kirimkan struk bukti transfer ke chat ini sebelum pesanan dibatalkan otomatis.`,
          parse_mode: 'Markdown'
        })
      });
    }

    // 2. Kirim Email Pengingat ke Pembeli
    if (order.email && GMAIL_PASS) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_PASS }
      });

      await transporter.sendMail({
        from: `"eSIMGo Billing" <${GMAIL_USER}>`,
        to: order.email,
        subject: `[PENGINGAT] Selesaikan Pembayaran Pesanan eSIM #${orderId}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: auto; padding: 25px; border: 1px solid #fed7aa; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #d97706; margin: 0; font-size: 20px;">⏰ Pengingat Pembayaran eSIMGo</h2>
              <p style="color: #64748b; font-size: 13px; margin-top: 5px;">No. Order: #${orderId}</p>
            </div>
            <div style="background-color: #fffbeb; border-radius: 12px; padding: 15px; margin-bottom: 20px; font-size: 13px; color: #92400e; border: 1px solid #fef3c7;">
              <p style="margin: 0 0 6px 0;"><b>Paket:</b> ${order.package_name || '-'}</p>
              <p style="margin: 0 0 6px 0;"><b>Total Tagihan:</b> Rp ${Number(order.price || 0).toLocaleString('id-ID')}</p>
              <p style="margin: 0;"><b>Sisa Waktu Bayar:</b> ${remainingMinutes} Menit</p>
            </div>
            <p style="font-size: 13px; color: #334155; line-height: 1.6;">
              Segera transfer dan upload bukti transfer melalui web eSIMGo atau bot Telegram kami agar pesanan tidak kadaluarsa & dihapus sistem.
            </p>
            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
            <p style="text-align: center; color: #94a3b8; font-size: 11px; margin: 0;">
              © 2026 eSIMGo • Rifki Cell. Email otomatis sistem.
            </p>
          </div>
        `
      });
    }

    return res.status(200).json({ success: true, message: 'Pengingat berhasil dikirim' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Gagal mengirim pengingat' });
  }
}
