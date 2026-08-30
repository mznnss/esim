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

  const { email, orderId, packageName } = req.body;

  if (!email || !orderId) {
    return res.status(400).json({ error: 'Email dan Order ID wajib diisi' });
  }

  const RESEND_API_KEY = "re_Z3RLN1qS_7pVGsu3myADgrY2pRtKuVaj2";

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'eSIMGo Official <onboarding@resend.dev>',
        to: [email],
        subject: `[eSIMGo] Profil QR Code eSIM Anda Siap Digunakan - Order #${orderId}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #4f46e5; margin: 0; font-size: 24px;">eSIM<span style="color: #0f172a;">Go</span></h1>
              <p style="color: #64748b; font-size: 13px; margin-top: 5px;">Konfirmasi Aktivasi eSIM Roaming</p>
            </div>

            <div style="background-color: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px; font-size: 14px;">
              <p style="margin: 4px 0;"><b>No. Order:</b> #${orderId}</p>
              <p style="margin: 4px 0;"><b>Paket Layanan:</b> ${packageName}</p>
              <p style="margin: 4px 0;"><b>Status Pembayaran:</b> <span style="color: #16a34a; font-weight: bold;">LUNAS</span></p>
            </div>

            <h3 style="color: #0f172a; font-size: 16px; margin-bottom: 10px;">Panduan Pemasangan eSIM:</h3>
            <ol style="color: #334155; font-size: 13px; line-height: 1.6; padding-left: 20px;">
              <li>Pastikan smartphone Anda terhubung ke jaringan Wi-Fi / Internet yang stabil.</li>
              <li>Buka menu <b>Pengaturan HP (Settings) &gt; Seluler / Jaringan Seluler</b>.</li>
              <li>Pilih menu <b>Tambah Paket Seluler (Add eSIM)</b>.</li>
              <li>Pilih opsi Scan QR Code, lalu arahkan kamera ke barcode eSIM Anda.</li>
              <li>Selesaikan proses konfigurasi profil dan beri nama label (misal: <i>eSIM Roaming</i>).</li>
            </ol>

            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; font-size: 12px; color: #991b1b;">
              <b>Perhatian:</b> Harap aktifkan fitur <b>Data Roaming</b> pada profil eSIM ini saat Anda telah mendarat di negara tujuan.
            </div>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="text-align: center; color: #94a3b8; font-size: 11px; margin: 0;">
              © 2026 eSIMGo • Rifki Cell. Email ini dikirim otomatis oleh sistem.
            </p>
          </div>
        `
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({ error: data.message || 'Gagal mengirim email' });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
