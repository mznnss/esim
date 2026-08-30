export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { orderId, packageName, price, email, type } = req.body;

  const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
  const CHAT_ID = "8731786333";

  // Konversi Waktu Eksplisit ke Asia/Jakarta (WIB)
  const nowWIB = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());

  let messageText = '';
  let inlineKeyboard = [];

  if (type === 'NEW_ORDER') {
    messageText = `🛒 *PESANAN BARU MASUK!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${packageName}
💰 *Nominal:* Rp ${Number(price).toLocaleString('id-ID')}
📧 *Email:* ${email}
⏱ *Waktu:* ${nowWIB} WIB

_Menunggu pembayaran QRIS..._`;
  } else if (type === 'PROOF_UPLOADED') {
    messageText = `📸 *BUKTI PEMBAYARAN DIUNGGAH!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📧 *Email:* ${email}
💰 *Tagihan:* Rp ${Number(price).toLocaleString('id-ID')}
⏱ *Waktu:* ${nowWIB} WIB

_Klik tombol di bawah untuk verifikasi lunas:_`;

    inlineKeyboard = [
      [
        { text: "✅ Verifikasi Lunas Langsung", callback_data: `VERIFY_${orderId}` }
      ]
    ];
  }

  try {
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: messageText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      })
    });

    const data = await response.json();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
