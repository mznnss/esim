import nodemailer from 'nodemailer';

const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GMAIL_USER = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS;

const GROUP_ADMIN_ID = "-1004352073054";
const ADMIN_IDS = ["8731786333", "6654067367"];

// Katalog Paket eSIM Sederhana
const PACKAGES = {
  "PKG_SG_5GB": { name: "Singapore 5GB (7 Hari)", price: 45000 },
  "PKG_MY_5GB": { name: "Malaysia 5GB (7 Hari)", price: 40000 },
  "PKG_JP_10GB": { name: "Japan 10GB (15 Hari)", price: 120000 },
  "PKG_ASIA_10GB": { name: "Asia 3 Negara 10GB (15 Hari)", price: 95000 }
};

// Helper: Kirim Pesan Telegram
async function sendMsg(chatId, text, replyMarkup = undefined, replyId = undefined) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Bot Ready');

  const update = req.body;

  try {
    // ========================================================
    // 1. AREA ADMIN (HANYA BISA DIAKSES DARI GRUP ATAU ID ADMIN)
    // ========================================================
    const chatIdStr = String(update.message?.chat?.id || update.callback_query?.message?.chat?.id || '');
    const senderIdStr = String(update.message?.from?.id || update.callback_query?.from?.id || '');
    const isAdmin = chatIdStr === GROUP_ADMIN_ID || ADMIN_IDS.includes(senderIdStr);

    // 1.1 ADMIN KLIK VERIFIKASI LUNAS
    if (update.callback_query && update.callback_query.data.startsWith('VERIFY_') && isAdmin) {
      const orderId = update.callback_query.data.replace('VERIFY_', '');
      const adminName = update.callback_query.from.first_name || 'Admin';

      await fetch(`${FIREBASE_DB_URL}/orders/${orderId}/status.json`, {
        method: 'PUT',
        body: JSON.stringify('PAID')
      });

      // Edit tombol di grup admin
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: update.callback_query.message.chat.id,
          message_id: update.callback_query.message.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: `✅ Diverifikasi oleh ${adminName}`, callback_data: "DONE" }]]
          }
        })
      });

      await sendMsg(
        update.callback_query.message.chat.id,
        `💡 *Order #${orderId} telah LUNAS!*\n\nSilakan *REPLY* pesan ini dengan melampirkan **Foto QR Code / File PDF** eSIM untuk dikirim langsung ke pembeli.`,
        undefined,
        update.callback_query.message.message_id
      );

      // Notifikasi ke pembeli bahwa pembayaran diverifikasi
      const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
      const orderData = await orderRes.json();
      if (orderData?.buyer_chat_id) {
        await sendMsg(orderData.buyer_chat_id, `🎉 *Pembayaran untuk Order #${orderId} DITERIMA!*\n\nAdmin sedang menyiapkan profile eSIM Anda. File akan dikirimkan sesaat lagi ke chat ini & email Anda.`);
      }

      return res.status(200).json({ ok: true });
    }

    // 1.2 ADMIN REPLY QR/PDF UNTUK DISELESAIKAN
    if (isAdmin && update.message && (update.message.document || update.message.photo) && update.message.reply_to_message) {
      const replyText = update.message.reply_to_message.text || update.message.reply_to_message.caption || "";
      const match = replyText.match(/[O0]RD[-\u2013\u2014]\d+/i);

      if (match) {
        const orderId = match[0].toUpperCase().replace(/^0RD/i, 'ORD').replace(/[\u2013\u2014_]/g, '-');
        const adminNote = update.message.caption ? update.message.caption.trim() : "";

        const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
        const orderData = await orderRes.json();

        if (!orderData) {
          await sendMsg(update.message.chat.id, `⚠️ Data order *#${orderId}* tidak ditemukan.`, undefined, update.message.message_id);
          return res.status(200).json({ ok: true });
        }

        let fileId = update.message.document ? update.message.document.file_id : update.message.photo[update.message.photo.length - 1].file_id;
        let fileName = update.message.document ? (update.message.document.file_name || `eSIM-${orderId}.pdf`) : `eSIM-QRCode-${orderId}.png`;

        // 1. Teruskan file langsung ke JAPRI PEMBELI
        if (orderData.buyer_chat_id) {
          const buyerCaption = `🎉 *PROFIL ESIM ANDA SIAP!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${orderData.package_name}
${adminNote ? `\n📝 *Catatan Admin:*\n${adminNote}\n` : ''}
📲 *Cara Pasang:*
1. Buka *Pengaturan HP > Seluler > Tambah eSIM*.
2. Scan QR Code di atas.
3. Aktifkan *Data Roaming* saat tiba di negara tujuan.`;

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

        // 2. Teruskan file via EMAIL (Nodemailer)
        if (orderData.email) {
          const fileInfo = await (await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
          const fileBuffer = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`)).arrayBuffer());

          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: GMAIL_USER, pass: GMAIL_PASS }
          });

          await transporter.sendMail({
            from: `"eSIMGo Official" <${GMAIL_USER}>`,
            to: orderData.email,
            subject: `[eSIMGo] Profil QR Code eSIM Siap Digunakan - Order #${orderId}`,
            html: `<div style="background:#12141a;color:#fff;padding:20px;font-family:sans-serif;border-radius:10px;">
                    <h2>eSIMGo - Order #${orderId}</h2>
                    <p>Paket: <b>${orderData.package_name}</b></p>
                    ${adminNote ? `<p style="color:#38bdf8;">Catatan: ${adminNote}</p>` : ''}
                    <p>Scan barcode terlampir untuk mengaktifkan eSIM.</p>
                   </div>`,
            attachments: [{ filename: fileName, content: fileBuffer }]
          });
        }

        // 3. Update Status ke Firebase
        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'COMPLETED', admin_note: adminNote || null })
        });

        await sendMsg(update.message.chat.id, `🚀 *SUKSES!* eSIM untuk Order *#${orderId}* berhasil dikirim ke Telegram Pembeli & Email (*${orderData.email}*).`, undefined, update.message.message_id);
        return res.status(200).json({ ok: true });
      }
    }

    // 1.3 COMMAND KHUSUS ADMIN (/pantau & /cek)
    if (isAdmin && update.message?.text) {
      const text = update.message.text.trim();
      if (text.startsWith('/pantau')) {
        const resAll = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        let p = 0, pd = 0, c = 0;
        Object.values(resAll).forEach(o => { if(o.status==='PENDING') p++; else if(o.status==='PAID') pd++; else if(o.status==='COMPLETED') c++; });
        await sendMsg(update.message.chat.id, `📊 *MONITORING ADMIN:*\n🟡 Menunggu Bayar: *${p}*\n🔵 Antrean Kirim: *${pd}*\n✅ Selesai: *${c}*`);
        return res.status(200).json({ ok: true });
      }
    }

    // ========================================================
    // 2. AREA PEMBELI (JAPRI / PRIVATE CHAT)
    // ========================================================
    if (!isAdmin && update.message) {
      const buyerChatId = update.message.chat.id;
      const text = update.message.text || "";

      // 2.1 PEMBELI KLIK /start
      if (text.startsWith('/start')) {
        const welcomeKeyboard = {
          inline_keyboard: [
            [{ text: "🛍 Beli Paket eSIM", callback_data: "BUY_MENU" }],
            [{ text: "📦 Cek Status Pesanan", callback_data: "BUYER_CHECK_STATUS" }]
          ]
        };
        await sendMsg(buyerChatId, `👋 *Halo Selamat Datang di eSIMGo!*

Mau internetan hemat dan cepat di luar negeri tanpa ganti kartu fisik?
Silakan pilih menu di bawah untuk mulai transaksi:`, welcomeKeyboard);
        return res.status(200).json({ ok: true });
      }

      // 2.2 PEMBELI UPLOAD BUKTI PEMBAYARAN (FOTO)
      if (update.message.photo) {
        // Ambil transaksi PENDING terakhir milik user ini
        const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        const pendingOrder = Object.entries(resOrders).reverse().find(([_, o]) => o.buyer_chat_id === buyerChatId && o.status === 'PENDING');

        if (!pendingOrder) {
          await sendMsg(buyerChatId, `⚠️ Anda tidak memiliki pesanan aktif yang menunggu pembayaran. Ketik /start untuk buat order baru.`);
          return res.status(200).json({ ok: true });
        }

        const [orderId, orderInfo] = pendingOrder;
        const photoId = update.message.photo[update.message.photo.length - 1].file_id;

        // Forward bukti bayar ke grup admin
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: GROUP_ADMIN_ID,
            photo: photoId,
            caption: `📸 *BUKTI PEMBAYARAN MASUK!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
👤 *Pembeli:* @${update.message.from.username || update.message.from.first_name}
📦 *Paket:* ${orderInfo.package_name}
💰 *Nominal:* Rp ${Number(orderInfo.price).toLocaleString('id-ID')}
📧 *Email:* ${orderInfo.email}`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: "✅ Verifikasi Lunas", callback_data: `VERIFY_${orderId}` }]]
            }
          })
        });

        await sendMsg(buyerChatId, `✅ *Bukti Pembayaran Diterima!*\n\nAdmin kami sedang memvalidasi pembayaran Anda. Profile eSIM akan segera dikirimkan ke chat ini.`);
        return res.status(200).json({ ok: true });
      }

      // 2.3 PEMBELI INPUT EMAIL (Format validasi regex sederhana)
      if (text.includes('@') && text.includes('.')) {
        // Ambil order DRAFT
        const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        const draftOrder = Object.entries(resOrders).reverse().find(([_, o]) => o.buyer_chat_id === buyerChatId && o.status === 'DRAFT_EMAIL');

        if (draftOrder) {
          const [orderId, orderInfo] = draftOrder;
          const userEmail = text.trim().toLowerCase();

          await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
            method: 'PATCH',
            body: JSON.stringify({ email: userEmail, status: 'PENDING' })
          });

          await sendMsg(buyerChatId, `📋 *INVOICE PEMBAYARAN*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${orderInfo.package_name}
💰 *Total Tagihan:* *Rp ${Number(orderInfo.price).toLocaleString('id-ID')}*
📧 *Email Pengiriman:* ${userEmail}
━━━━━━━━━━━━━━━━━━
💳 *Metode Pembayaran:*
• *BCA:* \`1234567890\` (a/n eSIMGo)
• *QRIS / Dana:* \`081234567890\`

Silakan transfer dan *KIRIMKAN FOTO BUKTI TRANSFER* langsung membalas chat ini.`);
          return res.status(200).json({ ok: true });
        }
      }
    }

    // 2.4 CALLBACK QUERY PEMBELI (PILIH PAKET)
    if (update.callback_query && !isAdmin) {
      const data = update.callback_query.data;
      const buyerChatId = update.callback_query.message.chat.id;

      if (data === "BUY_MENU") {
        const pkgButtons = Object.entries(PACKAGES).map(([key, item]) => [
          { text: `${item.name} - Rp ${item.price.toLocaleString('id-ID')}`, callback_data: `SELECT_${key}` }
        ]);
        await sendMsg(buyerChatId, `🌏 *Pilih Paket eSIM yang Anda Butuhkan:*`, { inline_keyboard: pkgButtons });
      } else if (data.startsWith('SELECT_')) {
        const pkgKey = data.replace('SELECT_', '');
        const selected = PACKAGES[pkgKey];
        const newOrderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

        // Buat Order Status DRAFT_EMAIL di Firebase
        await fetch(`${FIREBASE_DB_URL}/orders/${newOrderId}.json`, {
          method: 'PUT',
          body: JSON.stringify({
            package_name: selected.name,
            price: selected.price,
            buyer_chat_id: buyerChatId,
            status: 'DRAFT_EMAIL',
            created_at: new Date().toISOString()
          })
        });

        await sendMsg(buyerChatId, `👌 Anda memilih: *${selected.name}*\n\nKetik dan kirimkan *ALAMAT EMAIL* Anda sekarang untuk pengiriman cadangan profile eSIM:`);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
