global.orders = global.orders || [];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { package_name, price, email } = req.body;
    
    if (!package_name || !price || !email) {
      return res.status(400).json({ success: false, error: 'Data tidak lengkap' });
    }

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = {
      order_id: orderId,
      package_name,
      price: Number(price),
      email,
      proof_image: null,
      status: 'PENDING',
      created_at: new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })
    };

    global.orders.unshift(newOrder);
    return res.status(200).json({ success: true, order: newOrder });
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}
