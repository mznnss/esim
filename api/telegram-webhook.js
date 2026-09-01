import nodemailer from 'nodemailer';

const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GMAIL_USER = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS;

const GROUP_ADMIN_ID = "-1004352073054";
const ADMIN_NAMES = {
  "8731786333": "Admin 1",
  "6654067367": "Admin 2"
};

const ALL_RECIPIENTS = [
  GROUP_ADMIN_ID,
  "8731786333",
  "6654067367"
];

function cleanOrderId(id) {
  if (!id) return '';
  return id.toUpperCase().replace(/^0RD/i, 'ORD').replace(/[\u2013\u2014_]/g, '-');
}

function getWIBTimeString() {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date()) + ' WIB';
}

async function sendTelegramMsg(chatId, text, replyMarkup = undefined, replyId = undefined) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
      reply_to_message_id: replyId
    })
  });
}

function formatFullPackageName(item) {
  if (!item || typeof item !== 'object') return 'eSIM Package';
  const name = item.name || item.title || item.country || item.category || 'ASIA';
  const quota = item.quota || item.speed || item.desc || item.description || '';
  const provider = item.provider || item.operator || item.network || '';
  let label = name;
  if (quota) label += ` - ${quota}`;
  if (provider) label += ` (${provider})`;
  return label;
}

function getAllProductsFlat(dbProducts) {
  const list = [];
  if (!dbProducts) return list;

  const extract = (key, item) => {
    if (!item || typeof item !== 'object') return;
    const isInactive = item.active === false || item.is_active === false || item.status === 'inactive';
    if (isInactive) return;

    if (item.name || item.title || item.price || item.harga || item.quota) {
      list.push({
        key: String(key),
        data: item,
        fullName: formatFullPackageName(item),
        price: Number(item.price || item.nominal || item.harga || item.amount || 0),
        duration: item.duration || item.validity || ''
      });
    } else {
      Object.entries(item).forEach(([subKey, subItem]) => {
        extract(`${key}_${subKey}`, subItem);
      });
    }
  };

  if (Array.isArray(dbProducts)) {
    dbProducts.forEach((item, idx) => extract(String(idx), item));
  } else {
    Object.entries(dbProducts).forEach(([key, item]) => extract(key, item));
  }
  return list;
}

async function sendInvoiceEmail(email, orderId, packageName, price, paymentText, qrisUrl) {
  if (!email) return;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  const attachments = [];
  if (qrisUrl) {
    try {
      const imgRes = await fetch(qrisUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      attachments.push({ filename: 'QRIS-eSIMGo.jpg', content: imgBuffer, cid: 'qris_image_cid' });
    } catch (e) {}
  }

  const qrisHtml = attachments.length > 0
    ? `<div style="text-align: center; margin: 20px 0;"><img src="cid:qris_image_cid" style="max-width: 240px; border-radius: 12px; border: 1px solid #334155;" alt="QRIS Barcode" /><p style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Scan barcode di atas menggunakan aplikasi Bank / E-Wallet</p></div>`
    : '';

  await transporter.sendMail({
    from: `"eSIMGo Billing" <${GMAIL_USER}>`,
    to: email,
    subject: `[Menunggu Pembayaran] Invoice Pesanan eSIM #${orderId}`,
    html: `
      <div style="background-color: #12141a; color: #ffffff; font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #c084fc; margin: 0;">eSIMGo Invoice</h2>
          <p style="color: #94a3b8; font-size: 13px;">Segera selesaikan pembayaran pesanan Anda</p>
        </div>
        <div style="background-color: #1a1d26; border: 1px solid #282d3d; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 4px 0; font-size: 13px; color: #cbd5e1;"><strong>No. Order:</strong> #${orderId}</p>
          <p style="margin: 4px 0; font-size: 13px; color: #cbd5e1;"><strong>Paket:</strong> ${packageName}</p>
          <p style="margin: 4px 0; font-size: 15px; color: #38bdf8;"><strong>Total Tagihan:</strong> Rp ${Number(price).toLocaleString('id-ID')}</p>
          <p style="margin: 4px 0; font-size: 12px; color: #f87171;"><strong>Batas Waktu Bayar:</strong> 1 Jam (60 Menit)</p>
        </div>
        ${qrisHtml}
        <div style="background-color: #1e293b; padding: 12px; border-radius: 8px; font-size: 12px; color: #cbd5e1; margin-bottom: 20px;">
          <strong>Instruksi Pembayaran:</strong><br/>
          ${paymentText.replace(/\n/g, '<br/>')}
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Setelah transfer, silakan kirim foto bukti pembayaran ke bot Telegram kami.</p>
      </div>
    `,
    attachments: attachments
  });
}

// Fungsi Penolakan Bukti Transfer (Reject / Bukti Palsu)
async function rejectOrderPayment(orderId, rejectReason, adminName, notifyChatId) {
  let orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
  let orderData = await orderRes.json();

  if (!orderData) {
    const fallbackId = orderId.replace(/^ORD/, '0RD');
    orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${fallbackId}.json`);
    orderData = await orderRes.json();
    if (orderData) orderId = fallbackId;
  }

  if (!orderData) {
    if (notifyChatId) await sendTelegramMsg(notifyChatId, `❌ Order \`${orderId}\` tidak ditemukan.`);
    return false;
  }

  const createdTime = new Date(orderData.pending_since || orderData.created_at).getTime();
  const diffMinutes = Math.floor((Date.now() - createdTime) / (1000 * 60));
  const remainingMinutes = Math.max(1, 60 - diffMinutes);

  // Kembalikan status ke PENDING dan hapus bukti invalid
  await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'PENDING',
      payment_proof_url: null,
      proof_rejected_reason: rejectReason,
      proof_rejected_at: new Date().toISOString(),
      reminder_sent: false
    })
  });

  const rejectMsg = `⚠️ *BUKTI PEMBAYARAN DITOLAK / TIDAK VALID*
━━━━━━━━━━━━━━━━━━
Halo, bukti pembayaran untuk pesanan *#${orderId}* (*${orderData.package_name}*) ditolak oleh Admin.

📝 *Alasan:* ${rejectReason}
⏳ *Sisa Batas Waktu Bayar:* ${remainingMinutes} Menit

Silakan lakukan transfer yang valid sesuai nominal (Rp ${Number(orderData.price).toLocaleString('id-ID')}) dan kirimkan kembali struk pembayaran asli ke chat ini sebelum pesanan dibatalkan otomatis.`;

  if (orderData.buyer_chat_id) {
    await sendTelegramMsg(orderData.buyer_chat_id, rejectMsg);
  }

  if (orderData.email) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    });
    await transporter.sendMail({
      from: `"eSIMGo Verification" <${GMAIL_USER}>`,
      to: orderData.email,
      subject: `[PERHATIAN] Bukti Pembayaran Order #${orderId} Ditolak`,
      html: `
        <div style="background-color: #12141a; color: #ffffff; font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border-radius: 14px;">
          <h3 style="color: #f87171; margin-top: 0;">⚠️ Bukti Pembayaran Ditolak</h3>
          <p style="color: #cbd5e1; font-size: 13px;">Bukti transfer untuk Order <b>#${orderId}</b> (${orderData.package_name}) belum dapat kami verifikasi.</p>
          <div style="background-color:#1e293b;padding:12px;border-left:3px solid #f87171;border-radius:6px;margin:14px 0;">
            <p style="margin:0;font-size:13px;color:#fca5a5;"><b>Alasan Admin:</b> ${rejectReason}</p>
          </div>
          <p style="color: #cbd5e1; font-size: 12px;">Sisa waktu penyelesaian: <b>${remainingMinutes} Menit</b>. Harap segera kirim bukti yang sah.</p>
        </div>
      `
    });
  }

  if (notifyChatId) {
    await sendTelegramMsg(notifyChatId, `🚫 *Bukti Pembayaran #${orderId} DITOLAK oleh ${adminName}!*\n\n📝 Alasan: _${rejectReason}_\n_Notifikasi telah dikirim ke Telegram & Email pembeli untuk upload ulang._`);
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot Ready');

  const update = req.body;

  try {
    const chat = update.message?.chat || update.callback_query?.message?.chat;
    const isPrivate = chat?.type === 'private';
    const isGroup = chat?.type === 'group' || chat?.type === 'supergroup' || String(chat?.id) === GROUP_ADMIN_ID;
    const senderIdStr = String(update.message?.from?.id || update.callback_query?.from?.id || '');
    const isRegisteredAdmin = Object.keys(ADMIN_NAMES).includes(senderIdStr);

    // ========================================================
    // 1. AREA ADMIN
    // ========================================================
    if (isGroup && isRegisteredAdmin) {
      if (update.message && update.message.text) {
        const rawText = update.message.text.trim();
        const text = rawText.replace(/@goesimidbot/gi, '').trim();

        if (text.startsWith('/start')) {
          const startMessage = `👋 *Halo! Selamat Datang di Bot eSIMGo Admin*\n\n📌 *Fitur & Perintah Admin:*\n• \`/pantau\` - Rekap ringkasan antrean\n• \`/cek ORD-XXXX\` - Cek detail status transaksi\n• \`/tolak ORD-XXXX <alasan>\` - Tolak bukti bayar/palsu\n• \`/selesai ORD-XXXX\` - Tandai order selesai manual\n• 📤 *Kirim eSIM:* *Reply* bukti bayar dengan melampirkan file PDF / Foto QR Code eSIM.`;
          await sendTelegramMsg(update.message.chat.id, startMessage);
          return res.status(200).json({ ok: true });
        }

        // Command Tolak Bukti Bayar Manual
        if (text.startsWith('/tolak')) {
          const parts = text.split(/\s+/);
          const targetOrderId = parts[1] ? cleanOrderId(parts[1]) : null;
          const reason = parts.slice(2).join(' ') || "Bukti transfer tidak valid / dana belum masuk ke mutasi rekening.";
          const adminName = ADMIN_NAMES[senderIdStr] || update.message.from.first_name || 'Admin';

          if (!targetOrderId) {
            await sendTelegramMsg(update.message.chat.id, `⚠️ *Format salah!*\nGunakan: \`/tolak ORD-XXXXX <alasan>\``);
            return res.status(200).json({ ok: true });
          }

          await rejectOrderPayment(targetOrderId, reason, adminName, update.message.chat.id);
          return res.status(200).json({ ok: true });
        }

        if (text.startsWith('/cek')) {
          const parts = text.split(/\s+/);
          let targetOrderId = parts[1] ? cleanOrderId(parts[1]) : null;

          if (!targetOrderId) {
            await sendTelegramMsg(update.message.chat.id, `⚠️ *Format salah!*\nGunakan: \`/cek ORD-XXXXX\``);
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
            await sendTelegramMsg(update.message.chat.id, `❌ Pesanan \`${targetOrderId}\` tidak ditemukan di database.`);
            return res.status(200).json({ ok: true });
          }

          const statusBadge = {
            'PENDING': '🟡 MENUNGGU PEMBAYARAN',
            'WAITING_VERIFICATION': '🟠 BUKTI MASUK (Perlu Dicek)',
            'PAID': '🔵 LUNAS (Siap Kirim eSIM)',
            'COMPLETED': '✅ SELESAI / TERKIRIM',
            'CANCELLED': '❌ DIBATALKAN / EXPIRED'
          }[order.status] || order.status;

          const replyCek = `🔍 *DETAIL STATUS TRANSAKSI*\n━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* \`${targetOrderId}\`\n📦 *Paket:* ${order.package_name || '-'}\n💰 *Nominal:* Rp ${Number(order.price || 0).toLocaleString('id-ID')}\n📧 *Email:* ${order.email || '-'}\n📊 *Status:* *${statusBadge}*\n${order.proof_rejected_reason ? `⚠️ *Alasan Tolak Sebelumnya:* _${order.proof_rejected_reason}_\n` : ''}`;
          await sendTelegramMsg(update.message.chat.id, replyCek);
          return res.status(200).json({ ok: true });
        }

        if (text.startsWith('/selesai')) {
          const parts = text.split(/\s+/);
          let targetOrderId = parts[1] ? cleanOrderId(parts[1]) : null;
          const senderName = ADMIN_NAMES[senderIdStr] || update.message.from.first_name || 'Admin';

          if (!targetOrderId) {
            await sendTelegramMsg(update.message.chat.id, `⚠️ *Format salah!*\nGunakan: \`/selesai ORD-XXXXX\``);
            return res.status(200).json({ ok: true });
          }

          await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}.json`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'COMPLETED', completed_by: senderName, completed_at: new Date().toISOString() })
          });
          await sendTelegramMsg(update.message.chat.id, `✅ Status Order *#${targetOrderId}* berhasil diselesaikan oleh *${senderName}*!`);
          return res.status(200).json({ ok: true });
        }

        if (text.startsWith('/pantau') || text.startsWith('/rekap')) {
          const resAll = await fetch(`${FIREBASE_DB_URL}/orders.json`);
          const allOrders = (await resAll.json()) || {};

          let countPending = 0, countWaiting = 0, countPaid = 0, countCompleted = 0;
          const orderKeys = Object.keys(allOrders);

          orderKeys.forEach(k => {
            const st = allOrders[k].status;
            if (st === 'PENDING') countPending++;
            else if (st === 'WAITING_VERIFICATION') countWaiting++;
            else if (st === 'PAID') countPaid++;
            else if (st === 'COMPLETED') countCompleted++;
          });

          const rekapText = `📊 *MONITORING TRANSAKSI ESIM*\n━━━━━━━━━━━━━━━━━━\n🟡 *Menunggu Bayar:* ${countPending}\n🟠 *Bukti Perlu Dicek:* ${countWaiting}\n🔵 *Antrean Kirim eSIM:* ${countPaid}\n✅ *Selesai:* ${countCompleted}\n📦 *Total Semua Order:* ${orderKeys.length}`;
          await sendTelegramMsg(update.message.chat.id, rekapText);
          return res.status(200).json({ ok: true });
        }
      }

      // Callback Query Admin
      if (update.callback_query) {
        const data = update.callback_query.data;

        // Tombol Tolak Bukti Bayar
        if (data.startsWith('REJECT_')) {
          const orderId = data.replace('REJECT_', '');
          const adminName = ADMIN_NAMES[senderIdStr] || update.callback_query.from.first_name || 'Admin';

          await rejectOrderPayment(orderId, "Bukti transfer tidak valid / dana belum masuk ke mutasi rekening.", adminName, update.callback_query.message.chat.id);
          return res.status(200).json({ ok: true });
        }

        // Tombol Verifikasi Lunas
        if (data.startsWith('VERIFY_')) {
          let orderId = data.replace('VERIFY_', '');
          const adminName = ADMIN_NAMES[senderIdStr] || update.callback_query.from.first_name || 'Admin';

          await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'PAID',
              verified_by: adminName,
              verified_at: new Date().toISOString()
            })
          });

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.callback_query.message.chat.id,
              message_id: update.callback_query.message.message_id,
              reply_markup: {
                inline_keyboard: [[{ text: `✅ Terverifikasi Lunas oleh ${adminName}`, callback_data: "DONE" }]]
              }
            })
          });

          await sendTelegramMsg(
            update.callback_query.message.chat.id,
            `💡 *Order #${orderId} telah diverifikasi LUNAS oleh ${adminName}!*\n\nSilakan *REPLY (Balas)* pesan bukti transfer dengan file PDF atau foto QR Code eSIM untuk dikirim ke pembeli.`,
            undefined,
            update.callback_query.message.message_id
          );

          const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
          const orderData = await orderRes.json();
          if (orderData?.buyer_chat_id) {
            await sendTelegramMsg(orderData.buyer_chat_id, `🎉 *Pembayaran untuk Order #${orderId} DITERIMA & LUNAS!*\n\nAdmin sedang menyiapkan profile eSIM Anda. File akan segera dikirimkan ke chat ini & email Anda.`);
          }
          return res.status(200).json({ ok: true });
        }
      }

      // Admin Reply File QR/PDF
      if (update.message && (update.message.document || update.message.photo) && update.message.reply_to_message) {
        const replyText = update.message.reply_to_message.text || update.message.reply_to_message.caption || "";
        const match = replyText.match(/[O0]RD[-\u2013\u2014]\d+/i);

        if (match) {
          let orderId = cleanOrderId(match[0]);
          const executorName = ADMIN_NAMES[senderIdStr] || update.message.from.first_name || 'Admin';
          const adminNote = update.message.caption ? update.message.caption.trim() : "";

          let orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
          let orderData = await orderRes.json();

          if (!orderData) {
            const fallbackId = orderId.replace(/^ORD/, '0RD');
            orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${fallbackId}.json`);
            orderData = await orderRes.json();
            if (orderData) orderId = fallbackId;
          }

          if (!orderData) {
            await sendTelegramMsg(update.message.chat.id, `⚠️ Data pesanan *#${orderId}* tidak ditemukan di database.`, undefined, update.message.message_id);
            return res.status(200).json({ ok: true });
          }

          let fileId = update.message.document ? update.message.document.file_id : update.message.photo[update.message.photo.length - 1].file_id;
          let fileName = update.message.document ? (update.message.document.file_name || `eSIM-Profile-${orderId}.pdf`) : `eSIM-QRCode-${orderId}.png`;

          const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
          const fileInfo = await fileInfoRes.json();
          const filePath = fileInfo.result.file_path;
          const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
          const fileBuffer = Buffer.from(await (await fetch(downloadUrl)).arrayBuffer());

          if (orderData.buyer_chat_id) {
            const buyerCaption = `🎉 *PROFIL ESIM ANDA SIAP!*\n━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* \`${orderId}\`\n📦 *Paket:* ${orderData.package_name || '-'}\n${adminNote ? `\n📝 *Catatan Admin:*\n${adminNote}\n` : ''}\n📲 *Panduan Pemasangan eSIM:*\n1. Hubungkan HP ke Wi-Fi stabil.\n2. Buka *Pengaturan HP > Seluler > Tambah Paket Seluler (Add eSIM)*.\n3. Scan QR Code yang terlampir.\n4. Aktifkan *Data Roaming* saat tiba di negara tujuan.`;

            if (update.message.photo) {
              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: orderData.buyer_chat_id, photo: fileId, caption: buyerCaption, parse_mode: 'Markdown' })
              });
            } else {
              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: orderData.buyer_chat_id, document: fileId, caption: buyerCaption, parse_mode: 'Markdown' })
              });
            }
          }

          if (orderData.email) {
            const noteHtmlBlock = adminNote ? `<div style="background-color: #1e293b; border-left: 3px solid #38bdf8; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px;"><p style="margin: 0; font-size: 13px; color: #f1f5f9; white-space: pre-line;">${adminNote}</p></div>` : '';
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: GMAIL_USER, pass: GMAIL_PASS }
            });

            await transporter.sendMail({
              from: `"eSIMGo Official" <${GMAIL_USER}>`,
              to: orderData.email,
              subject: `[eSIMGo] Profil QR Code eSIM Siap Digunakan - Order #${orderId}`,
              html: `
                <div style="background-color: #12141a; color: #ffffff; font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; border-radius: 18px;">
                  <h2 style="color: #c084fc; margin-top:0;">eSIMGo - Aktivasi eSIM</h2>
                  <p>Order <b>#${orderId}</b> (${orderData.package_name}) telah <b>LUNAS</b>.</p>
                  ${noteHtmlBlock}
                  <p style="font-size:12px;color:#cbd5e1;">Scan barcode yang terlampir pada email ini melalui Pengaturan Seluler di HP Anda.</p>
                </div>
              `,
              attachments: [{ filename: fileName, content: fileBuffer }]
            });
          }

          await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'COMPLETED',
              admin_note: adminNote || null,
              completed_by: executorName,
              completed_at: new Date().toISOString()
            })
          });

          const successBroadcast = `🚀 *TRANSAKSI SELESAI & TERKIRIM!*\n━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* \`${orderId}\`\n📦 *Paket:* ${orderData.package_name || '-'}\n📧 *Email:* ${orderData.email || '-'}\n👤 *Diproses oleh:* *${executorName}*\n⏱ *Waktu:* ${getWIBTimeString()}`;
          await Promise.all(ALL_RECIPIENTS.map(t => sendTelegramMsg(t, successBroadcast)));
          return res.status(200).json({ ok: true });
        }
      }
    }

    // ========================================================
    // 2. AREA PEMBELI
    // ========================================================
    if (isPrivate) {
      const buyerChatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      const text = update.message?.text || "";

      // 2.1 /start
      if (text.startsWith('/start')) {
        const resDb = await fetch(`${FIREBASE_DB_URL}/products.json`);
        const dbProducts = (await resDb.json()) || {};
        const productList = getAllProductsFlat(dbProducts);

        let pricelistText = "";
        productList.forEach(item => {
          pricelistText += `🔹 *${item.fullName}*\n`;
          if (item.duration) pricelistText += `   ⏱ _Masa Aktif:_ ${item.duration}\n`;
          pricelistText += `   💰 *Harga:* Rp ${item.price.toLocaleString('id-ID')}\n\n`;
        });

        const greetingMessage = `👋 *Halo! Selamat Datang di eSIMGo Store* 🌏\n\n📋 *DAFTAR PAKET & HARGA ESIM:*\n━━━━━━━━━━━━━━━━━━\n${pricelistText || '_Belum ada paket yang aktif saat ini._'}━━━━━━━━━━━━━━━━━━\nSilakan klik tombol di bawah untuk memesan:`;
        const welcomeKeyboard = {
          inline_keyboard: [
            [{ text: "🛍 Beli Paket eSIM Sekarang", callback_data: "BUY_MENU" }],
            [{ text: "📦 Cek Status Pesanan", callback_data: "BUY_STATUS" }, { text: "💬 Bantuan CS", callback_data: "BUY_HELP" }]
          ]
        };

        await sendTelegramMsg(buyerChatId, greetingMessage, welcomeKeyboard);
        return res.status(200).json({ ok: true });
      }

      // 2.2 /status
      if (text.startsWith('/status') || (update.callback_query && update.callback_query.data === "BUY_STATUS")) {
        const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        const myOrders = Object.entries(resOrders).filter(([_, o]) => o && String(o.buyer_chat_id) === String(buyerChatId));

        if (myOrders.length === 0) {
          await sendTelegramMsg(buyerChatId, `ℹ️ Anda belum memiliki riwayat pesanan.\nKetik /start untuk memesan.`);
          return res.status(200).json({ ok: true });
        }

        const statusMap = {
          'DRAFT_EMAIL': '⏳ Menunggu Input Email',
          'PENDING': '🟡 Menunggu Pembayaran',
          'WAITING_VERIFICATION': '🟠 Menunggu Konfirmasi Admin',
          'PAID': '🔵 Pembayaran Diterima (Diproses Admin)',
          'COMPLETED': '✅ Selesai & Terkirim',
          'CANCELLED': '❌ Dibatalkan'
        };

        const listText = myOrders.slice(-3).reverse().map(([id, item]) => {
          return `🆔 *Order ID:* \`${id}\`\n📦 *Paket:* ${item.package_name || '-'}\n📊 *Status:* ${statusMap[item.status] || item.status}`;
        }).join('\n━━━━━━━━━━━━━━━━━━\n');

        await sendTelegramMsg(buyerChatId, `📦 *STATUS PESANAN ANDA*\n━━━━━━━━━━━━━━━━━━\n${listText}`);
        return res.status(200).json({ ok: true });
      }

      // 2.3 /bantuan
      if (text.startsWith('/bantuan') || (update.callback_query && update.callback_query.data === "BUY_HELP")) {
        await sendTelegramMsg(buyerChatId, `💬 *PUSAT BANTUAN & CS ESIMGO*\n• 👤 *Customer Support:* @rifkyyw\n• ⏱ *Jam Operasional:* 08.00 - 23.00 WIB`);
        return res.status(200).json({ ok: true });
      }

      // 2.4 Menu Pilih Paket
      if (update.callback_query && update.callback_query.data === "BUY_MENU") {
        const resDb = await fetch(`${FIREBASE_DB_URL}/products.json`);
        const dbProducts = (await resDb.json()) || {};
        const productList = getAllProductsFlat(dbProducts);

        const pkgButtons = productList.map((item, index) => [
          { text: `${item.fullName} - Rp ${item.price.toLocaleString('id-ID')}`, callback_data: `P_${index}` }
        ]);

        await sendTelegramMsg(buyerChatId, `🌏 *Pilih Paket eSIM yang Ingin Anda Beli:*`, { inline_keyboard: pkgButtons });
        return res.status(200).json({ ok: true });
      }

      // 2.5 Eksekusi Pilih Paket
      if (update.callback_query && update.callback_query.data.startsWith('P_')) {
        const resDb = await fetch(`${FIREBASE_DB_URL}/products.json`);
        const dbProducts = (await resDb.json()) || {};
        const productList = getAllProductsFlat(dbProducts);
        const idx = parseInt(update.callback_query.data.replace('P_', ''), 10);
        const selected = productList[idx]?.data;

        if (!selected) {
          await sendTelegramMsg(buyerChatId, `⚠️ Paket tidak ditemukan.`);
          return res.status(200).json({ ok: true });
        }

        const pkgFullName = formatFullPackageName(selected);
        const pkgPrice = Number(selected.price || selected.nominal || selected.harga || 0);
        const newOrderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

        await fetch(`${FIREBASE_DB_URL}/orders/${newOrderId}.json`, {
          method: 'PUT',
          body: JSON.stringify({
            order_id: newOrderId,
            package_name: pkgFullName,
            price: pkgPrice,
            buyer_chat_id: buyerChatId,
            status: 'DRAFT_EMAIL',
            created_at: new Date().toISOString(),
            waktu: getWIBTimeString()
          })
        });

        await sendTelegramMsg(buyerChatId, `👌 Anda memilih paket: *${pkgFullName}*\n\nKetik dan kirimkan *ALAMAT EMAIL* Anda sekarang untuk pengiriman cadangan profil eSIM:`);
        return res.status(200).json({ ok: true });
      }

      // 2.6 Input Email
      if (text.includes('@') && text.includes('.')) {
        const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        const draftOrder = Object.entries(resOrders).reverse().find(([_, o]) => o.buyer_chat_id === buyerChatId && o.status === 'DRAFT_EMAIL');

        if (draftOrder) {
          const [orderId, orderInfo] = draftOrder;
          const userEmail = text.trim().toLowerCase();

          await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
            method: 'PATCH',
            body: JSON.stringify({
              email: userEmail,
              status: 'PENDING',
              pending_since: new Date().toISOString()
            })
          });

          const resSettings = (await (await fetch(`${FIREBASE_DB_URL}/store_settings.json`)).json()) || {};
          const paymentText = resSettings.payment_info || "• Pembayaran via QRIS (Semua Bank / E-Wallet)\n• Silakan scan barcode di atas";
          const qrisImageUrl = resSettings.qris_image_url || "https://goesim.vercel.app/qris.jpg";

          const invoiceMessage = `📋 *INVOICE PEMBAYARAN*\n━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* \`${orderId}\`\n📦 *Paket:* ${orderInfo.package_name}\n💰 *Total Tagihan:* *Rp ${Number(orderInfo.price).toLocaleString('id-ID')}*\n📧 *Email Pengiriman:* ${userEmail}\n⏳ *Batas Waktu Bayar:* *1 Jam (60 Menit)*\n━━━━━━━━━━━━━━━━━━\n💳 *Metode Pembayaran:*\n${paymentText}\n\n_Invoice & QRIS telah dikirim ke email Anda (${userEmail})._\nSilakan transfer lalu *KIRIMKAN FOTO STRUK BUKTI PEMBAYARAN* ke chat ini.`;

          if (qrisImageUrl) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: buyerChatId, photo: qrisImageUrl, caption: invoiceMessage, parse_mode: 'Markdown' })
            });
          } else {
            await sendTelegramMsg(buyerChatId, invoiceMessage);
          }

          sendInvoiceEmail(userEmail, orderId, orderInfo.package_name, orderInfo.price, paymentText, qrisImageUrl).catch(e => {});

          await sendTelegramMsg(
            GROUP_ADMIN_ID,
            `🔔 *PESANAN BARU MENUNGGU PEMBAYARAN!*\n━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* \`${orderId}\`\n👤 *Pembeli:* @${update.message.from.username || update.message.from.first_name}\n📦 *Paket:* ${orderInfo.package_name}\n💰 *Nominal:* Rp ${Number(orderInfo.price).toLocaleString('id-ID')}\n📧 *Email:* ${userEmail}\n⏳ *Batas Waktu:* 1 Jam`
          );

          return res.status(200).json({ ok: true });
        }
      }

      // 2.7 Upload Bukti Bayar (Status Otomatis Jadi WAITING_VERIFICATION)
      if (update.message?.photo) {
        const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        const pendingOrder = Object.entries(resOrders).reverse().find(([_, o]) => o.buyer_chat_id === buyerChatId && (o.status === 'PENDING' || o.status === 'WAITING_VERIFICATION'));

        if (!pendingOrder) {
          await sendTelegramMsg(buyerChatId, `⚠️ Anda tidak memiliki pesanan yang sedang menunggu pembayaran. Ketik /start untuk membuat pesanan baru.`);
          return res.status(200).json({ ok: true });
        }

        const [orderId, orderInfo] = pendingOrder;
        const photoId = update.message.photo[update.message.photo.length - 1].file_id;

        let proofUrl = "";
        try {
          const fileInfoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${photoId}`);
          const fileInfo = await fileInfoRes.json();
          if (fileInfo.ok && fileInfo.result.file_path) {
            proofUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
          }
        } catch (e) {}

        // Ubah status jadi WAITING_VERIFICATION agar pengingat berhenti
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'WAITING_VERIFICATION',
            payment_proof_url: proofUrl || null,
            proof_uploaded_at: new Date().toISOString()
          })
        });

        // Kirim ke Grup Admin dengan 2 Tombol: Verifikasi atau Tolak Bukti
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: GROUP_ADMIN_ID,
            photo: photoId,
            caption: `📸 *BUKTI PEMBAYARAN MASUK!*\n━━━━━━━━━━━━━━━━━━\n🆔 *Order ID:* \`${orderId}\`\n👤 *Pembeli:* @${update.message.from.username || update.message.from.first_name}\n📦 *Paket:* ${orderInfo.package_name}\n💰 *Nominal:* Rp ${Number(orderInfo.price).toLocaleString('id-ID')}\n📧 *Email:* ${orderInfo.email}`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Verifikasi Lunas", callback_data: `VERIFY_${orderId}` },
                  { text: "❌ Tolak / Bukti Palsu", callback_data: `REJECT_${orderId}` }
                ]
              ]
            }
          })
        });

        await sendTelegramMsg(buyerChatId, `✅ *Bukti Pembayaran Diterima!*\n\nAdmin sedang mengecek mutasi transfer. Mohon tunggu, profil eSIM akan segera dikirimkan setelah terverifikasi.`);
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
