const BOT_TOKEN = "8636838151:AAFpbytiio0xBSqW7hrqddhfLf3e2XwHrpY";
const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";
const GROUP_ADMIN_ID = "-1004352073054";

function getWIBTimeString() {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date()) + ' WIB';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { package_name, price, email, order_id } = req.body;
    
    if (!package_name || !price || !email) {
      return res.status(400).json({ success: false, error: 'Data tidak lengkap' });
    }

    const finalOrderId = order_id || ('ORD-' + Math.floor(100000 + Math.random() * 900000));
    const nowWIB = getWIBTimeString();

    const newOrder = {
      order_id: finalOrderId,
      package_name: package_name,
      price: Number(price),
      email: email.trim().toLowerCase(),
      status: 'PENDING',
      created_at: new Date().toISOString(),
      pending_since: new Date().toISOString(),
      waktu: nowWIB,
      source: 'WEB'
    };

    // Simpan ke Firebase
    await fetch(`${FIREBASE_DB_URL}/orders/${finalOrderId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder)
    });

    // Kirim notifikasi pesanan baru ke Grup Telegram Admin
    const adminNotif = `🔔 *PESANAN BARU MENUNGGU PEMBAYARAN!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`${finalOrderId}\`
🌐 *Sumber:* Website
📦 *Paket:* ${package_name}
💰 *Nominal:* Rp ${Number(price).toLocaleString('id-ID')}
📧 *Email:* ${email}
⏳ *Batas Waktu:* 1 Jam`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: GROUP_ADMIN_ID,
        text: adminNotif,
        parse_mode: 'Markdown'
      })
    });

    return res.status(200).json({ success: true, order: newOrder });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
