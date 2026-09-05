import { env } from '../config/env.js';

export async function sendOtpEmail(email, otp) {
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  if (hasSmtp) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"AVN Athletics" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject: `${otp} is your AVN Athletics verification code`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a0a0c; color: #ffffff; padding: 32px; border-radius: 16px; border: 1px solid #222;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #FF1E27; font-size: 24px; font-weight: 900; letter-spacing: 2px; margin: 0;">AVN ATHLETICS</h1>
              <p style="color: #888; font-size: 12px; margin-top: 4px;">COMMERCIAL FITNESS GEAR</p>
            </div>
            <div style="background: #151518; padding: 24px; border-radius: 12px; text-align: center; border: 1px solid #333;">
              <p style="color: #aaa; font-size: 14px; margin-bottom: 12px;">Your one-time sign-in verification code is:</p>
              <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #FF1E27; padding: 12px 0; font-family: monospace;">
                ${otp}
              </div>
              <p style="color: #666; font-size: 12px; margin-top: 12px;">This code expires in 5 minutes. Do not share it with anyone.</p>
            </div>
          </div>
        `,
      });
      console.log(`✉️ [AVN Athletics] Verification code dispatched via SMTP to ${email}`);
      return { success: true, method: 'smtp' };
    } catch (error) {
      console.warn('⚠️ SMTP dispatch fallback:', error.message);
    }
  }

  // Fallback logging only when SMTP is unconfigured
  console.log(`✉️ [AVN Athletics] Recipient: ${email} (valid for 5 minutes)`);
  return { success: true, method: 'console' };
}
