export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderId, packageName, price, email, type } = req.body;

  const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
  const CHAT_ID = "8731786333";

  let messageText = '';

  if (type === 'NEW_ORDER') {
    messageText = `🛒 *PESANAN BARU MASUK!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📦 *Paket:* ${packageName}
💰 *Nominal:* Rp ${Number(price).toLocaleString('id-ID')}
📧 *Email:* ${email}
⏱ *Waktu:* ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB

_Pembeli sedang membuka halaman scan QRIS._`;
  } else if (type === 'PROOF_UPLOADED') {
    messageText = `📸 *BUKTI PEMBAYARAN DIUNGGAH!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${orderId}\`
📧 *Email Pembeli:* ${email}
💰 *Tagihan:* Rp ${Number(price).toLocaleString('id-ID')}

⚡ *Buka dashboard admin untuk verifikasi & kirim profil eSIM:*
🔗 https://goesim.vercel.app/admin.html`;
  }

  try {
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: messageText,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
