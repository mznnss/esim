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

// Helper: Normalisasi Order ID
function cleanOrderId(id) {
  if (!id) return '';
  return id
    .toUpperCase()
    .replace(/^0RD/i, 'ORD')
    .replace(/[\u2013\u2014_]/g, '-');
}

// Helper: Kirim Pesan Telegram Teks
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
    // 1. AREA ADMIN (KHUSUS DI DALAM GRUP ADMIN)
    // ========================================================
    if (isGroup && isRegisteredAdmin) {

      // 1.1 COMMAND TEKS ADMIN (/start, /pantau, /cek, /selesai)
      if (update.message && update.message.text) {
        const rawText = update.message.text.trim();
        const text = rawText.replace(/@goesimidbot/gi, '').trim();

        // /start di grup
        if (text.startsWith('/start')) {
          const startMessage = `👋 *Halo! Selamat Datang di Bot eSIMGo Admin*

Bot ini berfungsi sebagai pusat monitoring & pemrosesan pesanan eSIM di grup ini.

📌 *Fitur & Perintah Admin:*
• \`/pantau\` - Rekap ringkasan order & antrean
• \`/cek 0RD-XXXX\` - Cek detail status transaksi
• \`/selesai 0RD-XXXX\` - Tandai order selesai manual
• 📤 *Kirim eSIM:* *Reply* notifikasi bukti bayar dengan melampirkan file PDF / Foto QR Code eSIM.

_Bot siap beroperasi di grup._`;

          await sendTelegramMsg(update.message.chat.id, startMessage);
          return res.status(200).json({ ok: true });
        }

        // /cek
        if (text.startsWith('/cek')) {
          const parts = text.split(/\s+/);
          let targetOrderId = parts[1] ? cleanOrderId(parts[1]) : null;

          if (!targetOrderId) {
            await sendTelegramMsg(update.message.chat.id, `⚠️ *Format salah!*\nGunakan: \`/cek 0RD-XXXXX\``);
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

          await sendTelegramMsg(update.message.chat.id, replyCek);
          return res.status(200).json({ ok: true });
        }

        // /selesai
        if (text.startsWith('/selesai')) {
          const parts = text.split(/\s+/);
          let targetOrderId = parts[1] ? cleanOrderId(parts[1]) : null;

          if (!targetOrderId) {
            await sendTelegramMsg(update.message.chat.id, `⚠️ *Format salah!*\nGunakan: \`/selesai 0RD-XXXXX\``);
            return res.status(200).json({ ok: true });
          }

          const senderName = ADMIN_NAMES[senderIdStr] || update.message.from.first_name || 'Admin';

          let resData = await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}.json`);
          let order = await resData.json();

          if (!order) {
            const fallbackId = targetOrderId.replace(/^ORD/, '0RD');
            resData = await fetch(`${FIREBASE_DB_URL}/orders/${fallbackId}.json`);
            order = await resData.json();
            if (order) targetOrderId = fallbackId;
          }

          if (!order) {
            await sendTelegramMsg(update.message.chat.id, `❌ Order \`${targetOrderId}\` tidak ditemukan.`);
            return res.status(200).json({ ok: true });
          }

          await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}/status.json`, {
            method: 'PUT',
            body: JSON.stringify('COMPLETED')
          });

          await sendTelegramMsg(update.message.chat.id, `✅ Status Order *#${targetOrderId}* berhasil diselesaikan oleh *${senderName}*!`);
          return res.status(200).json({ ok: true });
        }

        // /pantau atau /rekap
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
            return `${icon} \`${k}\` | ${item.package_name || 'eSIM'} |\n*${item.status}*`;
          }).join('\n\n');

          const rekapText = `📊 *MONITORING TRANSAKSI ESIM*
━━━━━━━━━━━━━━━━━━
🟡 *Menunggu Bayar:* ${countPending}
🔵 *Antrean Kirim eSIM:* ${countPaid}
✅ *Selesai / Terkirim:* ${countCompleted}
📦 *Total Semua Order:* ${orderKeys.length}
━━━━━━━━━━━━━━━━━━
🕒 *5 Pesanan Terakhir:*

${recentList || '_Belum ada transaksi_'}

_Ketik \`/cek ORD-ID\` untuk melihat rincian per order._`;

          await sendTelegramMsg(update.message.chat.id, rekapText);
          return res.status(200).json({ ok: true });
        }
      }

      // 1.2 KLIK VERIFIKASI LUNAS
      if (update.callback_query && update.callback_query.data.startsWith('VERIFY_')) {
        let orderId = update.callback_query.data.replace('VERIFY_', '');
        const adminName = ADMIN_NAMES[senderIdStr] || update.callback_query.from.first_name || 'Admin';

        await fetch(`${FIREBASE_DB_URL}/orders/${orderId}/status.json`, {
          method: 'PUT',
          body: JSON.stringify('PAID')
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
          `💡 *Order #${orderId} telah diverifikasi LUNAS oleh ${adminName}!*

Silakan *REPLY (Balas)* pesan ini dengan melampirkan file **PDF** atau foto **QR Code** eSIM untuk dikirim ke pembeli.
*(Opsional: Tulis catatan pada caption).*`,
          undefined,
          update.callback_query.message.message_id
        );

        const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
        const orderData = await orderRes.json();
        if (orderData?.buyer_chat_id) {
          await sendTelegramMsg(orderData.buyer_chat_id, `🎉 *Pembayaran untuk Order #${orderId} DITERIMA!*\n\nAdmin sedang menyiapkan profile eSIM Anda. File akan segera dikirimkan ke chat ini & email Anda.`);
        }

        return res.status(200).json({ ok: true });
      }

      // 1.3 ADMIN REPLY FILE QR/PDF
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

          // Kirim ke Telegram Pembeli
          if (orderData.buyer_chat_id) {
            const buyerCaption = `🎉 *PROFIL ESIM ANDA SIAP!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${orderData.package_name || '-'}
${adminNote ? `\n📝 *Catatan Admin:*\n${adminNote}\n` : ''}
📲 *Panduan Pemasangan eSIM:*
1. Pastikan terhubung ke Wi-Fi / Internet stabil.
2. Buka *Pengaturan HP > Seluler > Tambah Paket Seluler (Add eSIM)*.
3. Scan QR Code yang terlampir.
4. Aktifkan *Data Roaming* saat telah tiba di negara tujuan.`;

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

          // Kirim Email Dark Mode
          if (orderData.email) {
            const noteHtmlBlock = adminNote ? `
              <div style="background-color: #1e293b; border-left: 3px solid #38bdf8; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px;">
                <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #38bdf8;">📝 Catatan Tambahan dari Admin:</p>
                <p style="margin: 0; font-size: 13px; color: #f1f5f9; white-space: pre-line; line-height: 1.5;">${adminNote}</p>
              </div>
            ` : '';

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
              attachments: [{ filename: fileName, content: fileBuffer }]
            });
          }

          // Update Firebase ke COMPLETED
          await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'COMPLETED', admin_note: adminNote || null })
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
📧 *Email:* ${orderData.email || '-'}
📎 *File:* \`${fileName}\`
📝 *Catatan:* ${adminNote ? `_${adminNote}_` : '_Tidak ada catatan_'}
👤 *Diproses oleh:* *${executorName}*
⏱ *Waktu:* ${nowWIB} WIB

_QR Code / PDF telah sukses terkirim ke email & Telegram pembeli._`;

          const broadcastPromises = ALL_RECIPIENTS.map(targetId =>
            sendTelegramMsg(targetId, successBroadcastMessage)
          );

          await Promise.all(broadcastPromises);
          return res.status(200).json({ ok: true });
        }
      }
    }

    // ========================================================
    // 2. AREA PEMBELI (CHAT PRIBADI / JAPRI BOT)
    // ========================================================
    if (isPrivate) {
      const buyerChatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      const text = update.message?.text || "";

      // 2.1 PEMBELI KLIK /start
      if (text.startsWith('/start')) {
        const welcomeKeyboard = {
          inline_keyboard: [
            [{ text: "🛍 Beli Paket eSIM", callback_data: "BUY_MENU" }],
            [{ text: "📦 Cek Status Pesanan", callback_data: "BUY_STATUS" }]
          ]
        };
        await sendTelegramMsg(buyerChatId, `👋 *Halo! Selamat Datang di eSIMGo Store*

Mau internetan hemat & roaming super cepat di luar negeri tanpa repot ganti kartu fisik?
Silakan pilih menu di bawah untuk memulai:`, welcomeKeyboard);
        return res.status(200).json({ ok: true });
      }

      // 2.2 COMMAND KHUSUS PEMBELI: /status
      if (text.startsWith('/status') || (update.callback_query && update.callback_query.data === "BUY_STATUS")) {
        const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        const myOrders = Object.entries(resOrders).filter(([_, o]) => o && String(o.buyer_chat_id) === String(buyerChatId));

        if (myOrders.length === 0) {
          await sendTelegramMsg(buyerChatId, `ℹ️ Anda belum memiliki riwayat pesanan di akun ini.\n\nKetik /start lalu klik *🛍 Beli Paket eSIM* untuk memesan.`);
          return res.status(200).json({ ok: true });
        }

        const statusMap = {
          'DRAFT_EMAIL': '⏳ Menunggu Input Email',
          'PENDING': '🟡 Menunggu Pembayaran',
          'PAID': '🔵 Pembayaran Diterima (Diproses Admin)',
          'COMPLETED': '✅ Selesai & Terkirim'
        };

        const listText = myOrders.slice(-3).reverse().map(([id, item]) => {
          return `🆔 *Order ID:* \`${id}\`\n📦 *Paket:* ${item.package_name || '-'}\n📊 *Status:* ${statusMap[item.status] || item.status}`;
        }).join('\n━━━━━━━━━━━━━━━━━━\n');

        await sendTelegramMsg(buyerChatId, `📦 *STATUS PESANAN ANDA*\n━━━━━━━━━━━━━━━━━━\n${listText}`);
        return res.status(200).json({ ok: true });
      }

      // 2.3 COMMAND KHUSUS PEMBELI: /bantuan
      if (text.startsWith('/bantuan')) {
        await sendTelegramMsg(buyerChatId, `💬 *PUSAT BANTUAN & CS ESIMGO*
━━━━━━━━━━━━━━━━━━
Jika Anda mengalami kendala pembayaran atau instalasi eSIM, hubungi admin kami melalui:
• 👤 *Customer Support:* @mznnss
• ⏱ *Jam Operasional:* 08.00 - 23.00 WIB

_Sertakan Order ID Anda jika ingin menanyakan status pesanan._`);
        return res.status(200).json({ ok: true });
      }

      // 2.4 PEMBELI PILIH PAKET (Auto-Detect Format Firebase /products)
      if (update.callback_query && update.callback_query.data === "BUY_MENU") {
        const resDb = await fetch(`${FIREBASE_DB_URL}/products.json`);
        const dbProducts = (await resDb.json()) || {};

        const pkgButtons = [];

        const extractProduct = (key, item) => {
          if (!item || typeof item !== 'object') return;
          const name = item.name || item.title || item.package_name || item.nama || item.packageName;
          const price = item.price || item.nominal || item.harga || item.amount || 0;
          const isInactive = item.active === false || item.is_active === false || item.status === 'inactive';

          if (name && !isInactive) {
            pkgButtons.push([
              { text: `${name} - Rp ${Number(price).toLocaleString('id-ID')}`, callback_data: `SELECT_${key}` }
            ]);
          }
        };

        if (Array.isArray(dbProducts)) {
          dbProducts.forEach((item, index) => extractProduct(String(index), item));
        } else {
          Object.entries(dbProducts).forEach(([key, item]) => {
            if (item && typeof item === 'object' && !item.name && !item.title && !item.price) {
              Object.entries(item).forEach(([subKey, subItem]) => {
                extractProduct(`${key}_${subKey}`, subItem);
              });
            } else {
              extractProduct(key, item);
            }
          });
        }

        if (pkgButtons.length === 0) {
          await sendTelegramMsg(buyerChatId, `⚠️ Maaf, belum ada paket eSIM yang tersedia di database saat ini.`);
          return res.status(200).json({ ok: true });
        }

        await sendTelegramMsg(buyerChatId, `🌏 *Pilih Paket eSIM yang Anda Butuhkan:*`, { inline_keyboard: pkgButtons });
        return res.status(200).json({ ok: true });
      }

      // Handler saat tombol paket diklik
      if (update.callback_query && update.callback_query.data.startsWith('SELECT_')) {
        const pkgKey = update.callback_query.data.replace('SELECT_', '');
        
        const resDb = await fetch(`${FIREBASE_DB_URL}/products.json`);
        const dbProducts = (await resDb.json()) || {};

        let selected = null;
        if (pkgKey.includes('_')) {
          const [cat, sub] = pkgKey.split('_');
          selected = dbProducts[cat]?.[sub];
        } else {
          selected = dbProducts[pkgKey];
        }

        if (!selected) {
          await sendTelegramMsg(buyerChatId, `⚠️ Paket tidak ditemukan.`);
          return res.status(200).json({ ok: true });
        }

        const pkgName = selected.name || selected.title || selected.package_name || selected.nama;
        const pkgPrice = selected.price || selected.nominal || selected.harga || 0;
        const newOrderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

        await fetch(`${FIREBASE_DB_URL}/orders/${newOrderId}.json`, {
          method: 'PUT',
          body: JSON.stringify({
            package_name: pkgName,
            price: pkgPrice,
            buyer_chat_id: buyerChatId,
            status: 'DRAFT_EMAIL',
            created_at: new Date().toISOString()
          })
        });

        await sendTelegramMsg(buyerChatId, `👌 Anda memilih paket: *${pkgName}*\n\nKetik dan kirimkan *ALAMAT EMAIL* Anda sekarang untuk pengiriman cadangan profil eSIM:`);
        return res.status(200).json({ ok: true });
      }

      // 2.5 PEMBELI INPUT EMAIL
      if (text.includes('@') && text.includes('.')) {
        const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        const draftOrder = Object.entries(resOrders).reverse().find(([_, o]) => o.buyer_chat_id === buyerChatId && o.status === 'DRAFT_EMAIL');

        if (draftOrder) {
          const [orderId, orderInfo] = draftOrder;
          const userEmail = text.trim().toLowerCase();

          await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`, {
            method: 'PATCH',
            body: JSON.stringify({ email: userEmail, status: 'PENDING' })
          });

          // Ambil pengaturan Rekening/QRIS dari node store_settings
          const resSettings = (await (await fetch(`${FIREBASE_DB_URL}/store_settings.json`)).json()) || {};
          const paymentText = resSettings.payment_info || "• Pembayaran via QRIS (Semua E-Wallet & Mobile Banking)\n• Silakan scan barcode di atas";
          const qrisImageUrl = resSettings.qris_image_url || "https://goesim.vercel.app/qris.jpg";

          const invoiceMessage = `📋 *INVOICE PEMBAYARAN*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${orderInfo.package_name}
💰 *Total Tagihan:* *Rp ${Number(orderInfo.price).toLocaleString('id-ID')}*
📧 *Email Pengiriman:* ${userEmail}
━━━━━━━━━━━━━━━━━━
💳 *Metode Pembayaran:*
${paymentText}

Silakan transfer lalu *KIRIMKAN FOTO BUKTI PEMBAYARAN* ke chat ini.`;

          if (qrisImageUrl) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: buyerChatId,
                photo: qrisImageUrl,
                caption: invoiceMessage,
                parse_mode: 'Markdown'
              })
            });
          } else {
            await sendTelegramMsg(buyerChatId, invoiceMessage);
          }

          return res.status(200).json({ ok: true });
        }
      }

      // 2.6 PEMBELI UPLOAD BUKTI TRANSFER
      if (update.message?.photo) {
        const resOrders = await (await fetch(`${FIREBASE_DB_URL}/orders.json`)).json() || {};
        const pendingOrder = Object.entries(resOrders).reverse().find(([_, o]) => o.buyer_chat_id === buyerChatId && o.status === 'PENDING');

        if (!pendingOrder) {
          await sendTelegramMsg(buyerChatId, `⚠️ Anda tidak memiliki pesanan yang sedang menunggu pembayaran. Ketik /start untuk membuat pesanan baru.`);
          return res.status(200).json({ ok: true });
        }

        const [orderId, orderInfo] = pendingOrder;
        const photoId = update.message.photo[update.message.photo.length - 1].file_id;

        // Forward bukti bayar ke Grup Admin
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: GROUP_ADMIN_ID,
            photo: photoId,
            caption: `📸 *BUKTI PEMBAYARAN DIUNGGAH!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
👤 *Pembeli:* @${update.message.from.username || update.message.from.first_name}
📦 *Paket:* ${orderInfo.package_name}
💰 *Nominal:* Rp ${Number(orderInfo.price).toLocaleString('id-ID')}
📧 *Email:* ${orderInfo.email}`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: "✅ Verifikasi Lunas Langsung", callback_data: `VERIFY_${orderId}` }]]
            }
          })
        });

        await sendTelegramMsg(buyerChatId, `✅ *Bukti Pembayaran Diterima!*\n\nAdmin kami sedang memverifikasi pembayaran Anda. QR Code eSIM akan segera dikirimkan ke chat ini & email Anda.`);
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
