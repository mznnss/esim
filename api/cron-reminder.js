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

      // 1. Ingatkan Pembeli setelah 5 Menit (Hanya dikirim 1x)
      if (diffMinutes >= 5 && diffMinutes < 60 && !order.reminder_sent) {
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

Silakan segera selesaikan pembayaran via QRIS dan kirimkan bukti struk agar pesanan tidak dibatalkan otomatis.`,
              parse_mode: 'Markdown'
            })
          });
        }

        if (order.email) {
          await transporter.sendMail({
            from: `"eSIMGo Billing" <${GMAIL_USER}>`,
            to: order.email,
            subject: `[PENTING] Segera Selesaikan Pembayaran Pesanan #${orderId}`,
            html: `
              <div style="background-color:#12141a;color:#fff;padding:24px;border-radius:12px;font-family:sans-serif;">
                <h3 style="color:#f59e0b;">⏰ Pengingat Pembayaran eSIMGo</h3>
                <p>Pesanan Anda <b>#${orderId}</b> (${order.package_name}) belum dibayar.</p>
                <p>Sisa waktu pembayaran: <b>${60 - diffMinutes} Menit</b>. Segera selesaikan sebelum dibatalkan otomatis.</p>
              </div>
            `
          });
        }

        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}/reminder_sent.json`, {
          method: 'PUT',
          body: JSON.stringify(true)
        });
      }

      // 2. Batalkan Otomatis jika sudah >= 60 Menit (1 Jam)
      if (diffMinutes >= 60) {
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'CANCELLED',
            cancelled_reason: 'Expired (Melewati batas 1 jam)',
            cancelled_at: new Date().toISOString()
          })
        });

        if (order.buyer_chat_id) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: order.buyer_chat_id,
              text: `❌ *PESANAN #${orderId} DIBATALKAN*
━━━━━━━━━━━━━━━━━━
Batas waktu pembayaran 1 jam telah habis. Pesanan Anda otomatis dibatalkan sistem.
Ketik /start jika ingin membuat pesanan baru.`,
              parse_mode: 'Markdown'
            })
          });
        }

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: GROUP_ADMIN_ID,
            text: `❌ *ORDER EXPIRED & DIBATALKAN OTOMATIS*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${order.package_name}
📧 *Email:* ${order.email}
_Alasan: Tidak ada pembayaran dalam 1 jam._`,
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
