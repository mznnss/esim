import nodemailer from 'nodemailer';

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

  const { email, orderId, packageName, qrCodeBase64, customNotes } = req.body;

  if (!email || !orderId) {
    return res.status(400).json({ error: 'Email dan Order ID wajib diisi' });
  }

  const user = process.env.GMAIL_USER || 'mizanzulmi1508@gmail.com';
  const pass = process.env.GMAIL_PASS;

  if (!pass) {
    return res.status(500).json({ error: 'GMAIL_PASS belum disetel di Environment Variables Vercel' });
  }

  // Konfigurasi SMTP Gmail
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: pass
    }
  });

  // Siapkan lampiran QR Code / PDF jika ada
  const attachments = [];
  if (qrCodeBase64) {
    const isPdf = qrCodeBase64.startsWith('data:application/pdf');
    const filename = isPdf ? `eSIM-Profile-${orderId}.pdf` : `eSIM-QRCode-${orderId}.png`;
    const cleanBase64 = qrCodeBase64.split(',')[1] || qrCodeBase64;

    attachments.push({
      filename: filename,
      content: Buffer.from(cleanBase64, 'base64')
    });
  }

  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #4f46e5; margin: 0; font-size: 24px;">eSIM<span style="color: #0f172a;">Go</span></h1>
        <p style="color: #64748b; font-size: 13px; margin-top: 5px;">Konfirmasi Aktivasi & QR Code eSIM Roaming</p>
      </div>

      <div style="background-color: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px; font-size: 14px;">
        <p style="margin: 4px 0;"><b>No. Order:</b> #${orderId}</p>
        <p style="margin: 4px 0;"><b>Paket Layanan:</b> ${packageName}</p>
        <p style="margin: 4px 0;"><b>Status Pembayaran:</b> <span style="color: #16a34a; font-weight: bold;">LUNAS</span></p>
      </div>

      ${customNotes ? `
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin: 15px 0; font-size: 13px; color: #1e40af;">
          <b>Catatan dari Admin:</b><br/>${customNotes}
        </div>
      ` : ''}

      <h3 style="color: #0f172a; font-size: 16px; margin-bottom: 10px;">Panduan Pemasangan eSIM:</h3>
      <ol style="color: #334155; font-size: 13px; line-height: 1.6; padding-left: 20px;">
        <li>Pastikan smartphone Anda terhubung ke jaringan Wi-Fi / Internet yang stabil.</li>
        <li>Buka menu <b>Pengaturan HP (Settings) &gt; Seluler / Jaringan Seluler</b>.</li>
        <li>Pilih menu <b>Tambah Paket Seluler (Add eSIM)</b>.</li>
        <li>Scan barcode QR Code yang ada di lampiran email ini.</li>
        <li>Selesaikan proses aktivasi dan beri label nama profil (misal: <i>eSIM Roaming</i>).</li>
      </ol>

      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; font-size: 12px; color: #991b1b;">
        <b>Perhatian:</b> Aktifkan opsi <b>Data Roaming</b> pada profil eSIM ini saat Anda telah mendarat di negara tujuan.
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="text-align: center; color: #94a3b8; font-size: 11px; margin: 0;">
        © 2026 eSIMGo • Rifki Cell. Email ini dikirim otomatis oleh sistem.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"eSIMGo Official" <${user}>`,
      to: email,
      subject: `[eSIMGo] Profil QR Code eSIM Anda Siap Digunakan - Order #${orderId}`,
      html: htmlContent,
      attachments: attachments
    });

    return res.status(200).json({ success: true, message: 'Email berhasil dikirim via Gmail SMTP' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Gagal mengirim email via Gmail' });
  }
}
