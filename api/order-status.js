global.orders = global.orders || [];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { orderId } = req.query;
  const order = global.orders.find(o => o.order_id === orderId);

  if (!order) return res.status(404).json({ status: 'NOT_FOUND' });
  res.status(200).json({ status: order.status });
}
