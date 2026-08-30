global.orders = global.orders || [];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json(global.orders);
  }

  if (req.method === 'POST') {
    const { orderId } = req.body;
    const order = global.orders.find(o => o.order_id === orderId);
    if (order) {
      order.status = 'PAID';
      return res.status(200).json({ success: true, order });
    }
    return res.status(404).json({ error: 'Order not found' });
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}
