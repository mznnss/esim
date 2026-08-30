import nodemailer from 'nodemailer';

const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GMAIL_USER = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS;

const ADMIN_RECIPIENTS = [
  "8731786333",
  "6654067367"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook ready');
  }

  const update = req.body;

  try {
    // 1. TANGANI KLIK TOMBOL "VERIFIKASI LUNAS" DARI SALAH SATU ADMIN
    if (update.callback_query) {
      const callback = update.callback_query;
      const data = callback.data;

      if (data && data.startsWith('VERIFY_')) {
        const orderId = data.replace('VERIFY_', '');

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
                [{ text: "✅ Status: LUNAS & DIVERIFIKASI", callback_data: "DONE" }]
              ]
            }
          })
        });

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: callback.message.chat.id,
            text: `💡 *Order #${orderId} telah LUNAS!*\n\nSilakan *REPLY (Balas)* pesan ini dengan melampirkan **File PDF** atau **Foto QR Code** eSIM untuk dikirim ke pembeli.`,
            parse_mode: 'Markdown',
            reply_to_message_id: callback.message.message_id
          })
        });
      }
      return res.status(200).json({ ok: true });
    }

    // 2. TANGANI BALASAN (REPLY) PDF/QR DARI ADMIN 1 ATAU ADMIN 2
    if (update.message && (update.message.document || update.message.photo) && update.message.reply_to_message) {
      const senderId = String(update.message.chat.id);
      
      // Pastikan pengirim adalah salah satu admin terdaftar
      if (!ADMIN_RECIPIENTS.includes(senderId)) {
        return res.status(200).json({ ok: true });
      }

      const replyMsg = update.message.reply_to_message;
      const replyText = replyMsg.text || replyMsg.caption || "";
      const match = replyText.match(/ORD-\d+/i);

      if (match) {
        const orderId = match[0].toUpperCase();

        const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
        const orderData = await orderRes.json();

        if (!orderData || !orderData.email) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: `⚠️ Data pesanan *#${orderId}* tidak ditemukan.`,
              parse_mode: 'Markdown'
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
          throw new Error('Gagal mengunduh file dari Telegram');
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
                <p style="margin: 3px 0;"><b>Paket Layanan:</b> ${orderData.package_name}</p>
                <p style="margin: 3px 0;"><b>Status:</b> <span style="color: #16a34a; font-weight: bold;">LUNAS</span></p>
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

        // Beritahu admin yang memproses
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: `🚀 *SUKSES!* File \`${fileName}\` untuk Order *#${orderId}* berhasil dikirim ke email pembeli (*${orderData.email}*).`,
            parse_mode: 'Markdown',
            reply_to_message_id: update.message.message_id
          })
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
