import nodemailer from 'nodemailer';

const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GMAIL_USER = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS;

const ADMIN_NAMES = {
  "8731786333": "Admin 1",
  "6654067367": "Admin 2"
};

const ALL_RECIPIENTS = [
  "-1004352073054", // Grup Telegram
  "8731786333",     // Japri Admin 1
  "6654067367"      // Japri Admin 2
];

function cleanOrderId(id) {
  if (!id) return '';
  return id
    .toUpperCase()
    .replace(/^0RD/i, 'ORD')
    .replace(/[\u2013\u2014_]/g, '-');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook ready');
  }

  const update = req.body;

  try {
    // ==========================================
    // 1. TANGANI COMMAND TEKS (/start, /cek, /pantau, /selesai)
    // ==========================================
    if (update.message && update.message.text) {
      const rawText = update.message.text.trim();
      const text = rawText.replace(/@goesimidbot/gi, '').trim();

      if (text.startsWith('/start')) {
        const startMessage = `👋 *Halo! Selamat Datang di Bot eSIMGo Admin*

Bot ini berfungsi sebagai pusat monitoring & pemrosesan pesanan eSIM.

📌 *Fitur & Perintah Bot:*
• \`/pantau\` - Rekap ringkasan order & antrean
• \`/cek ORD-XXXX\` - Cek detail status transaksi
• \`/selesai ORD-XXXX\` - Tandai order selesai manual
• 📤 *Kirim eSIM + Catatan:* *Reply* pesan notifikasi dengan lampiran file & tulis catatan admin pada caption foto/file.

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

      if (text.startsWith('/cek')) {
        const parts = text.split(/\s+/);
        let targetOrderId = parts[1] ? cleanOrderId(parts[1]) : null;

        if (!targetOrderId) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: `⚠️ *Format salah!*\nGunakan: \`/cek ORD-XXXXX\``,
              parse_mode: 'Markdown'
            })
          });
          return res.status(200).json({ ok: true });
        }

        let resData = await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}.json`);
        let order = await resData.json();

        if (!order) {
          const fallbackId = targetOrderId.replace(/^ORD/, '0RD');
          resData = await fetch(`${FIREBASE_DB_URL}/orders/${fallbackId}.json`);
          order = await resData.json();
          if (order) targetOrderId = fallbackId;
        }

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
📝 *Catatan:* ${order.admin_note || '_Tidak ada catatan_'}
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

      if (text.startsWith('/selesai')) {
        const parts = text.split(/\s+/);
        let targetOrderId = parts[1] ? cleanOrderId(parts[1]) : null;

        if (!targetOrderId) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: `⚠️ *Format salah!*\nGunakan: \`/selesai ORD-XXXXX\``,
              parse_mode: 'Markdown'
            })
          });
          return res.status(200).json({ ok: true });
        }

        const senderName = update.message.from.first_name || 'Admin';

        let resData = await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}.json`);
        let order = await resData.json();

        if (!order) {
          const fallbackId = targetOrderId.replace(/^ORD/, '0RD');
          resData = await fetch(`${FIREBASE_DB_URL}/orders/${fallbackId}.json`);
          order = await resData.json();
          if (order) targetOrderId = fallbackId;
        }

        if (!order) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: `❌ Order \`${targetOrderId}\` tidak ditemukan.`,
              parse_mode: 'Markdown'
            })
          });
          return res.status(200).json({ ok: true });
        }

        await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}/status.json`, {
          method: 'PUT',
          body: JSON.stringify('COMPLETED')
        });

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: `✅ Status Order *#${targetOrderId}* berhasil diselesaikan oleh *${senderName}*!`,
            parse_mode: 'Markdown'
          })
        });
        return res.status(200).json({ ok: true });
      }

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
        let orderId = data.replace('VERIFY_', '');
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

Silakan *REPLY (Balas)* pesan ini dengan melampirkan **Foto QR Code / File PDF**.
*(Opsional: Tulis keterangan / catatan aktivasi manual pada caption file).*`,
            parse_mode: 'Markdown',
            reply_to_message_id: callback.message.message_id
          })
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ==========================================
    // 3. TANGANI REPLY DOKUMEN / QR CODE + CAPTION CATATAN
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
      const match = replyText.match(/[O0]RD[-\u2013\u2014]\d+/i);

      if (match) {
        let orderId = cleanOrderId(match[0]);
        const executorName = ADMIN_NAMES[senderId] || update.message.from.first_name || 'Admin';

        // Ambil catatan admin dari Caption foto / file
        const adminNote = update.message.caption ? update.message.caption.trim() : "";

        let orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
        let orderData = await orderRes.json();

        if (!orderData) {
          const fallbackId = orderId.replace(/^ORD/, '0RD');
          orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${fallbackId}.json`);
          orderData = await orderRes.json();
          if (orderData) orderId = fallbackId;
        }

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

        // Susun blok HTML catatan jika ada
        const noteHtmlBlock = adminNote ? `
          <div style="background-color: #1e293b; border-left: 3px solid #38bdf8; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px;">
            <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #38bdf8;">📝 Catatan Tambahan dari Admin:</p>
            <p style="margin: 0; font-size: 13px; color: #f1f5f9; white-space: pre-line; line-height: 1.5;">${adminNote}</p>
          </div>
        ` : '';

        // Kirim email dark mode
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: GMAIL_USER, pass: GMAIL_PASS }
        });

        await transporter.sendMail({
          from: `"eSIMGo Official" <${GMAIL_USER}>`,
          to: orderData.email,
          subject: `[eSIMGo] Profil QR Code eSIM Siap Digunakan - Order #${orderId}`,
          html: `
            <div style="background-color: #12141a; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; border-radius: 18px;">
              <div style="text-align: center; margin-bottom: 28px;">
                <h1 style="color: #c084fc; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">eSIMGo</h1>
                <p style="color: #94a3b8; font-size: 13px; margin-top: 6px;">Konfirmasi Aktivasi & QR Code eSIM Roaming</p>
              </div>

              <div style="background-color: #1a1d26; border: 1px solid #282d3d; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                <p style="margin: 6px 0; font-size: 14px; color: #cbd5e1;"><strong style="color: #ffffff;">No. Order:</strong> #${orderId}</p>
                <p style="margin: 6px 0; font-size: 14px; color: #cbd5e1;"><strong style="color: #ffffff;">Paket Layanan:</strong> ${orderData.package_name || '-'}</p>
                <p style="margin: 6px 0; font-size: 14px; color: #cbd5e1;"><strong style="color: #ffffff;">Status Pembayaran:</strong> <span style="color: #4ade80; font-weight: 700;">LUNAS</span></p>
              </div>

              ${noteHtmlBlock}

              <h3 style="color: #ffffff; font-size: 15px; margin: 0 0 14px 0;">Panduan Pemasangan eSIM:</h3>
              <ol style="color: #cbd5e1; font-size: 13px; line-height: 1.7; padding-left: 18px; margin: 0 0 24px 0;">
                <li style="margin-bottom: 6px;">Pastikan smartphone Anda terhubung ke jaringan Wi-Fi / Internet yang stabil.</li>
                <li style="margin-bottom: 6px;">Buka menu <strong>Pengaturan HP (Settings) &gt; Seluler / Jaringan Seluler</strong>.</li>
                <li style="margin-bottom: 6px;">Pilih menu <strong>Tambah Paket Seluler (Add eSIM)</strong>.</li>
                <li style="margin-bottom: 6px;">Scan barcode QR Code yang ada di lampiran email ini.</li>
                <li style="margin-bottom: 6px;">Selesaikan proses aktivasi dan beri label nama profil (misal: <em>eSIM Roaming</em>).</li>
              </ol>

              <div style="background-color: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; border-radius: 6px; padding: 12px 14px;">
                <p style="margin: 0; font-size: 12px; color: #fca5a5; line-height: 1.5;">
                  <strong style="color: #ef4444;">Perhatian:</strong> Aktifkan opsi <strong>Data Roaming</strong> pada profil eSIM ini saat Anda telah mendarat di negara tujuan.
                </p>
              </div>

              <div style="margin-top: 30px; text-align: center; border-top: 1px solid #242938; padding-top: 18px;">
                <p style="color: #64748b; font-size: 11px; margin: 0;">© 2026 eSIMGo • Rifki Cell. All rights reserved.</p>
              </div>
            </div>
          `,
          attachments: [{
            filename: fileName,
            content: buffer
          }]
        });

        // Update status & simpan catatan ke database
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'COMPLETED',
            admin_note: adminNote || null
          })
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
📝 *Catatan:* ${adminNote ? `_${adminNote}_` : '_Tidak ada catatan_'}
👤 *Diproses oleh:* *${executorName}*
⏱ *Waktu:* ${nowWIB} WIB

_QR Code & Panduan berhasil terkirim ke email pembeli._`;

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
