global.orders = global.orders || [];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { order_id, proof_image } = req.body;
    const order = global.orders.find(o => o.order_id === order_id);

    if (order) {
      order.proof_image = proof_image;
      return res.status(200).json({ success: true, message: 'Bukti berhasil diunggah' });
    }
    return res.status(404).json({ error: 'Order not found' });
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}
