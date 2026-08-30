import nodemailer from 'nodemailer';

const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GMAIL_USER = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS;

const ADMIN_NAMES = {
  "8731786333": "Admin 1",
  "6654067367": "Admin 2"
};

// Target notifikasi broadcast
const ALL_RECIPIENTS = [
  "-1004352073054", // Grup Telegram
  "8731786333",     // Japri Admin 1
  "6654067367"      // Japri Admin 2
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook ready');
  }

  const update = req.body;

  try {
    // ==========================================
    // 1. TANGANI COMMAND TEKS (/start, /cek, /pantau)
    // ==========================================
    if (update.message && update.message.text) {
      const rawText = update.message.text.trim();
      const text = rawText.replace(/@goesimidbot/gi, '').trim();

      // COMMAND /start
      if (text.startsWith('/start')) {
        const startMessage = `👋 *Halo! Selamat Datang di Bot eSIMGo Admin*

Bot ini berfungsi sebagai pusat monitoring & pemrosesan pesanan eSIM.

📌 *Fitur & Perintah Bot:*
• \`/pantau\` - Rekap ringkasan order & antrean
• \`/cek ORD-XXXX\` - Cek detail status satu transaksi
• 🛒 *Notifikasi Otomatis:* Bukti bayar otomatis dikirim ke sini
• 📤 *Kirim eSIM:* Cukup *Reply* notifikasi dengan melampirkan file PDF / Foto QR Code eSIM

_Bot siap digunakan._`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: startMessage,
            parse_mode: 'Markdown'
          })
        });
        return res.status(200).json({ ok: true });
      }

      // COMMAND /cek (Contoh: /cek ORD-1001)
      if (text.startsWith('/cek')) {
        const parts = text.split(/\s+/);
        const targetOrderId = parts[1] ? parts[1].trim().toUpperCase() : null;

        if (!targetOrderId) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: `⚠️ *Format salah!*\n\nGunakan: \`/cek ORD-XXXXX\`\nContoh: \`/cek ORD-1001\``,
              parse_mode: 'Markdown'
            })
          });
          return res.status(200).json({ ok: true });
        }

        const resData = await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}.json`);
        const order = await resData.json();

        if (!order) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: `❌ Pesanan \`${targetOrderId}\` tidak ditemukan di database.`,
              parse_mode: 'Markdown'
            })
          });
          return res.status(200).json({ ok: true });
        }

        const statusBadge = {
          'PENDING': '🟡 MENUNGGU PEMBAYARAN',
          'PAID': '🔵 LUNAS (Perlu Kirim eSIM)',
          'COMPLETED': '✅ SELESAI / SUDAH TERKIRIM'
        }[order.status] || order.status;

        const replyCek = `🔍 *DETAIL STATUS TRANSAKSI*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${targetOrderId}\`
📦 *Paket:* ${order.package_name || '-'}
💰 *Nominal:* Rp ${Number(order.price || 0).toLocaleString('id-ID')}
📧 *Email:* ${order.email || '-'}
📊 *Status:* *${statusBadge}*`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: replyCek,
            parse_mode: 'Markdown'
          })
        });
        return res.status(200).json({ ok: true });
      }

      // COMMAND /pantau atau /rekap
      if (text.startsWith('/pantau') || text.startsWith('/rekap')) {
        const resAll = await fetch(`${FIREBASE_DB_URL}/orders.json`);
        const allOrders = (await resAll.json()) || {};

        let countPending = 0;
        let countPaid = 0;
        let countCompleted = 0;
        const orderKeys = Object.keys(allOrders);

        orderKeys.forEach(k => {
          const st = allOrders[k].status;
          if (st === 'PENDING') countPending++;
          else if (st === 'PAID') countPaid++;
          else if (st === 'COMPLETED') countCompleted++;
        });

        const recentList = orderKeys.slice(-5).reverse().map(k => {
          const item = allOrders[k];
          const icon = item.status === 'COMPLETED' ? '✅' : item.status === 'PAID' ? '🔵' : '🟡';
          return `${icon} \`${k}\` | ${item.package_name || 'eSIM'} | *${item.status}*`;
        }).join('\n');

        const rekapText = `📊 *MONITORING TRANSAKSI ESIM*
━━━━━━━━━━━━━━━━━━
🟡 Menunggu Bayar    : *${countPending}*
🔵 Antrean Kirim eSIM: *${countPaid}*
✅ Selesai / Terkirim : *${countCompleted}*
📦 Total Semua Order : *${orderKeys.length}*
━━━━━━━━━━━━━━━━━━
🕒 *5 Pesanan Terakhir:*
${recentList || '_Belum ada transaksi_'}

_Ketik \`/cek ORD-ID\` untuk melihat rincian per order._`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: rekapText,
            parse_mode: 'Markdown'
          })
        });
        return res.status(200).json({ ok: true });
      }
    }

    // ==========================================
    // 2. TANGANI KLIK TOMBOL "VERIFIKASI LUNAS"
    // ==========================================
    if (update.callback_query) {
      const callback = update.callback_query;
      const data = callback.data;

      if (data && data.startsWith('VERIFY_')) {
        const orderId = data.replace('VERIFY_', '');
        const adminId = String(callback.from.id);
        const adminName = ADMIN_NAMES[adminId] || callback.from.first_name || 'Admin';

        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}/status.json`, {
          method: 'PUT',
          body: JSON.stringify('PAID')
        });

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: callback.message.chat.id,
            message_id: callback.message.message_id,
            reply_markup: {
              inline_keyboard: [
                [{ text: `✅ Terverifikasi Lunas oleh ${adminName}`, callback_data: "DONE" }]
              ]
            }
          })
        });

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: callback.message.chat.id,
            text: `💡 *Order #${orderId} telah diverifikasi LUNAS oleh ${adminName}!*

Silakan *REPLY (Balas)* pesan ini dengan melampirkan file **PDF** atau foto **QR Code** eSIM untuk dikirim ke email pembeli.`,
            parse_mode: 'Markdown',
            reply_to_message_id: callback.message.message_id
          })
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ==========================================
    // 3. TANGANI REPLY DOKUMEN / QR CODE OLEH ADMIN
    // ==========================================
    if (update.message && (update.message.document || update.message.photo) && update.message.reply_to_message) {
      const senderId = String(update.message.from.id);
      const chatId = String(update.message.chat.id);

      const isAllowed = ALL_RECIPIENTS.includes(chatId) || Object.keys(ADMIN_NAMES).includes(senderId);
      if (!isAllowed) {
        return res.status(200).json({ ok: true });
      }

      const replyMsg = update.message.reply_to_message;
      const replyText = replyMsg.text || replyMsg.caption || "";
      const match = replyText.match(/ORD-\d+/i);

      if (match) {
        const orderId = match[0].toUpperCase();
        const executorName = ADMIN_NAMES[senderId] || update.message.from.first_name || 'Admin';

        const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
        const orderData = await orderRes.json();

        if (!orderData || !orderData.email) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: `⚠️ Data pesanan *#${orderId}* tidak ditemukan di database.`,
              parse_mode: 'Markdown',
              reply_to_message_id: update.message.message_id
            })
          });
          return res.status(200).json({ ok: true });
        }

        let fileId = "";
        let fileName = `eSIM-Profile-${orderId}.pdf`;

        if (update.message.document) {
          const doc = update.message.document;
          fileId = doc.file_id;
          fileName = doc.file_name || `eSIM-Profile-${orderId}.pdf`;
        } else if (update.message.photo) {
          const photos = update.message.photo;
          fileId = photos[photos.length - 1].file_id;
          fileName = `eSIM-QRCode-${orderId}.png`;
        }

        const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileInfo = await fileInfoRes.json();
        
        if (!fileInfo.ok || !fileInfo.result.file_path) {
          throw new Error('Gagal mengunduh file dari Telegram API');
        }

        const filePath = fileInfo.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        const fileBuffer = await (await fetch(downloadUrl)).arrayBuffer();
        const buffer = Buffer.from(fileBuffer);

        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: GMAIL_USER, pass: GMAIL_PASS }
        });

        await transporter.sendMail({
          from: `"eSIMGo Official" <${GMAIL_USER}>`,
          to: orderData.email,
          subject: `[eSIMGo] Profil & Panduan eSIM Anda Siap - Order #${orderId}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
              <h2 style="color: #4f46e5; text-align: center; margin-top: 0;">eSIMGo - Profil eSIM Siap Digunakan</h2>
              <div style="background: #f8fafc; padding: 12px 15px; border-radius: 10px; font-size: 13px; margin: 15px 0;">
                <p style="margin: 3px 0;"><b>No. Pesanan:</b> #${orderId}</p>
                <p style="margin: 3px 0;"><b>Paket Layanan:</b> ${orderData.package_name || '-'}</p>
                <p style="margin: 3px 0;"><b>Status:</b> <span style="color: #16a34a; font-weight: bold;">LUNAS & SELESAI</span></p>
              </div>
              <p style="font-size: 13px; color: #334155; line-height: 1.6;">
                Halo, terima kasih telah berbelanja di eSIMGo. Dokumen / file profil eSIM Anda telah dilampirkan pada email ini.
              </p>
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 10px; margin: 15px 0; font-size: 12px; color: #991b1b;">
                <b>Perhatian:</b> Aktifkan fitur <b>Data Roaming</b> di pengaturan smartphone Anda saat telah mendarat di negara tujuan.
              </div>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">© 2026 eSIMGo • Rifki Cell</p>
            </div>
          `,
          attachments: [{
            filename: fileName,
            content: buffer
          }]
        });

        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}/status.json`, {
          method: 'PUT',
          body: JSON.stringify('COMPLETED')
        });

        const nowWIB = new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(new Date());

        const successBroadcastMessage = `🚀 *TRANSAKSI SELESAI & TERKIRIM!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${orderData.package_name || '-'}
📧 *Email:* ${orderData.email}
📎 *File:* \`${fileName}\`
👤 *Diproses oleh:* *${executorName}*
⏱ *Waktu:* ${nowWIB} WIB

_QR Code / PDF telah sukses terkirim ke email pembeli._`;

        const broadcastPromises = ALL_RECIPIENTS.map(targetId =>
          fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetId,
              text: successBroadcastMessage,
              parse_mode: 'Markdown'
            })
          })
        );

        await Promise.all(broadcastPromises);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
