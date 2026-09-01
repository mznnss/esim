export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { orderId, packageName, price, email, type, completedBy, customNotes, proofUrl } = req.body;

  const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
  const ALL_RECIPIENTS = [
    "-1004352073054", // Grup Telegram
    "8731786333",     // Japri Admin 1
    "6654067367"      // Japri Admin 2
  ];

  const nowWIB = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date()) + ' WIB';

  let messageText = '';
  let inlineKeyboard = [];
  let isPhoto = false;

  if (type === 'NEW_ORDER') {
    messageText = `🔔 *PESANAN BARU MENUNGGU PEMBAYARAN!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
🌐 *Sumber:* Website
📦 *Paket:* ${packageName || '-'}
💰 *Nominal:* Rp ${Number(price || 0).toLocaleString('id-ID')}
📧 *Email:* ${email || '-'}
⏳ *Batas Waktu:* 1 Jam
⏱ *Waktu:* ${nowWIB}`;
  } else if (type === 'PROOF_UPLOADED') {
    messageText = `📸 *BUKTI PEMBAYARAN MASUK!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
🌐 *Sumber:* Website
📦 *Paket:* ${packageName || '-'}
💰 *Nominal:* Rp ${Number(price || 0).toLocaleString('id-ID')}
📧 *Email:* ${email || '-'}
⏱ *Waktu:* ${nowWIB}`;

    inlineKeyboard = [
      [
        { text: "✅ Verifikasi Lunas", callback_data: `VERIFY_${orderId}` },
        { text: "❌ Tolak / Bukti Palsu", callback_data: `REJECT_${orderId}` }
      ]
    ];
    if (proofUrl && proofUrl.startsWith('http')) isPhoto = true;
  } else if (type === 'ORDER_VERIFIED') {
    messageText = `✅ *PEMBAYARAN DIVERIFIKASI LUNAS!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${packageName || '-'}
💰 *Nominal:* Rp ${Number(price || 0).toLocaleString('id-ID')}
📧 *Email:* ${email || '-'}
👤 *Diverifikasi oleh:* *${completedBy || 'Admin Web'}*
⏱ *Waktu:* ${nowWIB}

_Stok produk telah otomatis berkurang. Silakan kirim file profile eSIM ke email pembeli._`;
  } else if (type === 'PROOF_REJECTED') {
    messageText = `🚫 *BUKTI PEMBAYARAN DITOLAK!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${packageName || '-'}\n📧 *Email:* ${email || '-'}
📝 *Alasan:* _${customNotes || '-'}_
⏱ *Waktu:* ${nowWIB}

_Pembeli telah diminta untuk mengunggah ulang bukti transfer sah via web/bot._`;
  } else if (type === 'ORDER_COMPLETED') {
    const actor = completedBy || 'Sistem Web Otomatis';
    messageText = `🚀 *TRANSAKSI SELESAI & TERKIRIM!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${packageName || '-'}
📧 *Email:* ${email || '-'}
👤 *Diproses oleh:* *${actor}*
⏱ *Waktu:* ${nowWIB}`;
  }

  try {
    const replyMarkupObj = inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined;

    const sendPromises = ALL_RECIPIENTS.map(chatId => {
      if (isPhoto) {
        return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: proofUrl,
            caption: messageText,
            parse_mode: 'Markdown',
            reply_markup: replyMarkupObj
          })
        });
      } else {
        return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: 'Markdown',
            reply_markup: replyMarkupObj
          })
        });
      }
    });

    await Promise.all(sendPromises);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
