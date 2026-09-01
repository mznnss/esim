const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GROUP_ADMIN_ID = "-1004352073054";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { order_id, proof_image, proofUrl } = req.body;
    const targetOrderId = order_id || req.body.orderId;

    if (!targetOrderId) {
      return res.status(400).json({ error: 'Order ID wajib diisi' });
    }

    const orderRes = await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}.json`);
    const order = await orderRes.json();

    if (!order) {
      return res.status(404).json({ error: 'Order tidak ditemukan' });
    }

    const proofData = proofUrl || proof_image || null;

    // Update status di Firebase Realtime Database
    await fetch(`${FIREBASE_DB_URL}/orders/${targetOrderId}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'WAITING_VERIFICATION',
        payment_proof_url: proofData,
        proof_uploaded_at: new Date().toISOString()
      })
    });

    const caption = `📸 *BUKTI PEMBAYARAN MASUK!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${targetOrderId}\`
🌐 *Sumber:* Website
📦 *Paket:* ${order.package_name || '-'}
💰 *Nominal:* Rp ${Number(order.price || 0).toLocaleString('id-ID')}
📧 *Email:* ${order.email || '-'}`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ Verifikasi Lunas", callback_data: `VERIFY_${targetOrderId}` },
          { text: "❌ Tolak / Bukti Palsu", callback_data: `REJECT_${targetOrderId}` }
        ]
      ]
    };

    // Kirim notifikasi foto bukti ke Grup Telegram Admin
    if (proofData && proofData.startsWith('http')) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: GROUP_ADMIN_ID,
          photo: proofData,
          caption: caption,
          parse_mode: 'Markdown',
          reply_markup: replyMarkup
        })
      });
    } else {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: GROUP_ADMIN_ID,
          text: caption,
          parse_mode: 'Markdown',
          reply_markup: replyMarkup
        })
      });
    }

    return res.status(200).json({ success: true, message: 'Bukti berhasil diunggah' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
