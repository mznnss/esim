import nodemailer from 'nodemailer';

const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GMAIL_USER = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook ready');
  }

  const update = req.body;

  try {
    // 1. Tangani Klik Tombol "Verifikasi Lunas Langsung" di Chat Telegram
    if (update.callback_query) {
      const callback = update.callback_query;
      const data = callback.data;

      if (data.startsWith('VERIFY_')) {
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
            text: `💡 *Order #${orderId} telah LUNAS!*\n\nUntuk mengirim QR Code ke pembeli, silakan *REPLY (Balas)* pesan ini dengan melampirkan **Foto / File PDF QR Code eSIM**.`,
            parse_mode: 'Markdown',
            reply_to_message_id: callback.message.message_id
          })
        });
      }
      return res.status(200).json({ ok: true });
    }

    // 2. Tangani Reply Foto/Dokumen QR Code dari Admin di Telegram
    if (update.message && (update.message.photo || update.message.document) && update.message.reply_to_message) {
      const replyText = update.message.reply_to_message.text || update.message.reply_to_message.caption || "";
      const match = replyText.match(/ORD-\d+/);

      if (match) {
        const orderId = match[0];

        const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
        const orderData = await orderRes.json();

        if (orderData && orderData.email) {
          let fileId = "";
          let isPdf = false;

          if (update.message.photo) {
            const photos = update.message.photo;
            fileId = photos[photos.length - 1].file_id;
          } else if (update.message.document) {
            fileId = update.message.document.file_id;
            isPdf = update.message.document.mime_type === 'application/pdf';
          }

          const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
          const fileInfo = await fileInfoRes.json();
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
            subject: `[eSIMGo] Profil QR Code eSIM Anda Siap Digunakan - Order #${orderId}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #4f46e5; text-align: center; margin-top: 0;">eSIMGo - Profil eSIM Siap</h2>
                <p>Halo, pembayaran Anda untuk pesanan <b>#${orderId}</b> (${orderData.package_name}) telah diverifikasi.</p>
                <p>QR Code / Dokumen aktivasi profil eSIM telah dilampirkan pada email ini. Silakan scan barcode tersebut melalui menu pengaturan seluler di ponsel Anda.</p>
                <div style="background: #f8fafc; padding: 10px; border-radius: 8px; font-size: 12px; color: #64748b; margin: 15px 0;">
                  <b>Catatan:</b> Pastikan mengaktifkan opsi <i>Data Roaming</i> setelah tiba di negara tujuan.
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">© 2026 eSIMGo • Rifki Cell</p>
              </div>
            `,
            attachments: [{
              filename: isPdf ? `eSIM-Profile-${orderId}.pdf` : `eSIM-QRCode-${orderId}.png`,
              content: buffer
            }]
          });

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: `🚀 *SUKSES!* File QR Code eSIM untuk Order *#${orderId}* telah terkirim ke email pembeli (${orderData.email}).`,
              parse_mode: 'Markdown'
            })
          });
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
