import nodemailer from 'nodemailer';

const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GMAIL_USER = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS;
const GROUP_ADMIN_ID = "-1004352073054";

export default async function handler(req, res) {
  try {
    const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
    const now = Date.now();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    });

    for (const [orderId, order] of Object.entries(resOrders)) {
      if (!order || order.status !== 'PENDING') continue;

      const createdTime = new Date(order.pending_since || order.created_at).getTime();
      const diffMinutes = Math.floor((now - createdTime) / (1000 * 60));

      // 1. PENGINGAT OTOMATIS SETELAH 5 MENIT (Dikirim 1x)
      if (diffMinutes >= 5 && diffMinutes < 60 && !order.reminder_sent) {
        // Kirim notifikasi chat ke Telegram Pembeli
        if (order.buyer_chat_id) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: order.buyer_chat_id,
              text: `⏰ *PENGINGAT PEMBAYARAN (5 MENIT)*
━━━━━━━━━━━━━━━━━━
Pesanan *#${orderId}* (${order.package_name}) belum menerima pembayaran.

💰 *Total Tagihan:* Rp ${Number(order.price).toLocaleString('id-ID')}
⏳ *Sisa Waktu:* ${60 - diffMinutes} Menit

Silakan segera selesaikan transfer via QRIS dan kirimkan bukti bayar agar pesanan tidak otomatis terhapus sistem.`,
              parse_mode: 'Markdown'
            })
          });
        }

        // Kirim email pengingat ke Email Pembeli
        if (order.email) {
          await transporter.sendMail({
            from: `"eSIMGo Billing" <${GMAIL_USER}>`,
            to: order.email,
            subject: `[PENTING] Segera Selesaikan Pembayaran Pesanan #${orderId}`,
            html: `
              <div style="background-color:#12141a;color:#ffffff;padding:24px;border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;">
                <h3 style="color:#f59e0b;margin-top:0;">⏰ Pengingat Pembayaran eSIMGo</h3>
                <p style="color:#cbd5e1;font-size:13px;line-height:1.5;">Pesanan Anda <b>#${orderId}</b> (<b>${order.package_name}</b>) sebesar <b>Rp ${Number(order.price).toLocaleString('id-ID')}</b> belum dibayar.</p>
                <p style="color:#f87171;font-size:12px;line-height:1.5;">Sisa batas waktu pembayaran: <b>${60 - diffMinutes} Menit</b>. Segera selesaikan sebelum data pesanan dihapus permanen oleh sistem.</p>
              </div>
            `
          });
        }

        // Tandai flag reminder_sent agar tidak berulang
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}/reminder_sent.json`, {
          method: 'PUT',
          body: JSON.stringify(true)
        });
      }

      // 2. OTOMATIS HAPUS DARI FIREBASE JIKA LEBIH DARI 1 JAM (60 MENIT)
      if (diffMinutes >= 60) {
        // HAPUS PERMANEN DARI FIREBASE REALTIME DATABASE
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
          method: 'DELETE'
        });

        // Kirim notifikasi pembatalan ke Telegram Pembeli
        if (order.buyer_chat_id) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: order.buyer_chat_id,
              text: `❌ *PESANAN #${orderId} KADALUARSA & DIHAPUS*
━━━━━━━━━━━━━━━━━━
Batas waktu pembayaran 1 jam telah habis. Pesanan Anda otomatis dibatalkan dan dihapus dari sistem.
Ketik /start jika ingin membuat pesanan baru.`,
              parse_mode: 'Markdown'
            })
          });
        }

        // Kirim notifikasi penghapusan ke Grup Admin
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: GROUP_ADMIN_ID,
            text: `🗑 *ORDER DIHAPUS OTOMATIS DARI DATABASE*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${order.package_name}
📧 *Email:* ${order.email}
_Status: Dihapus permanen dari Firebase karena tidak ada pembayaran dalam 1 jam._`,
            parse_mode: 'Markdown'
          })
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
