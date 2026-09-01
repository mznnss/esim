const FIREBASE_DB_URL = "https://esim-store-d7580-default-rtdb.europe-west1.firebasedatabase.app";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { orderId } = req.query;

  if (!orderId) {
    return res.status(400).json({ status: 'NOT_FOUND', error: 'Order ID wajib disertakan' });
  }

  try {
    const response = await fetch(`${FIREBASE_DB_URL}/orders/${orderId}.json`);
    const order = await response.json();

    if (!order) {
      return res.status(404).json({ status: 'NOT_FOUND' });
    }

    return res.status(200).json({ status: order.status, order });
  } catch (err) {
    return res.status(500).json({ status: 'ERROR', error: err.message });
  }
}
