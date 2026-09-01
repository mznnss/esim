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
      if (!order) continue;

      const createdTime = new Date(order.pending_since || order.created_at).getTime();
      const diffMinutes = Math.floor((now - createdTime) / (1000 * 60));
      const orderLink = `https://goesim.vercel.app/?orderId=${orderId}`;

      // 1. AUTO-DELETE DRAFT_EMAIL (>= 5 Menit tanpa isi email)
      if (order.status === 'DRAFT_EMAIL' && diffMinutes >= 5) {
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, { method: 'DELETE' });
        continue;
      }

      // HANYA proses order PENDING yang BELUM upload bukti
      const hasUploadedProof = !!(order.payment_proof_url || order.proof_image || order.status === 'WAITING_VERIFICATION');

      // 2. INGATKAN PEMBELI (Menit ke-5 s/d 59 dan belum upload bukti)
      if (order.status === 'PENDING' && !hasUploadedProof && diffMinutes >= 5 && diffMinutes < 60 && !order.reminder_sent) {
        // Kunci status dulu agar tidak terjadi spam dobel
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
          method: 'PATCH',
          body: JSON.stringify({ reminder_sent: true })
        });

        // Notifikasi Telegram Pembeli
        if (order.buyer_chat_id) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: order.buyer_chat_id,
              text: `⏰ *PENGINGAT PEMBAYARAN (5 MENIT)*\n━━━━━━━━━━━━━━━━━━\nPesanan *#${orderId}* (${order.package_name || '-'}) belum menerima bukti transfer.\n\n💰 *Total Tagihan:* Rp ${Number(order.price || 0).toLocaleString('id-ID')}\n⏳ *Sisa Waktu:* ${60 - diffMinutes} Menit\n\nSilakan transfer via QRIS dan kirimkan struk bukti pembayaran sebelum pesanan otomatis dibatalkan sistem.`,
              parse_mode: 'Markdown'
            })
          });
        }

        // Email Pengingat dengan Tombol Deep Link
        if (order.email && GMAIL_PASS) {
          await transporter.sendMail({
            from: `"eSIMGo Billing" <${GMAIL_USER}>`,
            to: order.email,
            subject: `[PENTING] Segera Selesaikan Pembayaran Pesanan #${orderId}`,
            html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:28px;border-radius:16px;background-color:#12141a;color:#ffffff;text-align:center;">
                <h3 style="color:#f59e0b;margin-top:0;font-size:20px;">⏰ Pengingat Pembayaran eSIMGo</h3>
                <p style="color:#cbd5e1;font-size:13px;line-height:1.6;text-align:left;">
                  Pesanan Anda <b>#${orderId}</b> (<b>${order.package_name || '-'}</b>) sebesar <b>Rp ${Number(order.price || 0).toLocaleString('id-ID')}</b> belum menerima pembayaran.
                </p>
                <div style="background-color:#1e293b;padding:14px;border-radius:10px;margin:16px 0;text-align:left;border-left:3px solid #f59e0b;">
                  <p style="color:#fca5a5;font-size:12px;margin:0;">
                    ⏳ Sisa batas waktu: <b>${60 - diffMinutes} Menit</b> sebelum pesanan otomatis dibatalkan & dihapus sistem.
                  </p>
                </div>
                <div style="margin:24px 0;">
                  <a href="${orderLink}" style="background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-size:13px;font-weight:bold;display:inline-block;">
                    💳 Selesaikan Pembayaran & Bukti Transfer →
                  </a>
                </div>
                <p style="color:#64748b;font-size:11px;margin-top:20px;">
                  Atau akses langsung tautan berikut:<br/>
                  <a href="${orderLink}" style="color:#38bdf8;word-break:break-all;">${orderLink}</a>
                </p>
              </div>
            `
          });
        }
      }

      // 3. AUTO-DELETE (>= 60 Menit untuk PENDING / DRAFT yang belum diverifikasi)
      if ((order.status === 'PENDING' || order.status === 'DRAFT_EMAIL') && diffMinutes >= 60) {
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, { method: 'DELETE' });

        if (order.buyer_chat_id) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: order.buyer_chat_id,
              text: `❌ *PESANAN #${orderId} KADALUARSA & DIHAPUS*\n━━━━━━━━━━━━━━━━━━\nBatas waktu 1 jam telah habis tanpa pembayaran valid. Pesanan Anda otomatis dibatalkan sistem.\nKetik /start jika ingin memesan kembali.`,
              parse_mode: 'Markdown'
            })
          });
        }

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: GROUP_ADMIN_ID,
            text: `🗑 *ORDER #${orderId} EXPIRED & DIHAPUS DARI DATABASE*\n_Alasan: Tidak ada pembayaran valid dalam 1 jam._`,
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
