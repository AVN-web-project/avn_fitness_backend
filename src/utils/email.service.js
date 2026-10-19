import { env } from '../config/env.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedTransporter = null;

async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!hasSmtp) return null;

  try {
    const nodemailer = await import('nodemailer');
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return cachedTransporter;
  } catch (err) {
    console.warn('⚠️ Failed to initialize nodemailer transporter:', err.message);
    return null;
  }
}

export async function sendOtpEmail(email, otp) {
  const transporter = await getTransporter();

  if (!transporter) {
    throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.');
  }

  try {
    await transporter.sendMail({
        from: `"AVN Athletics" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject: `${otp} is your AVN Athletics verification code`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a0a0c; color: #ffffff; padding: 32px; border-radius: 16px; border: 1px solid #222;">
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
    console.log(`Verification email sent to ${email}`);
    return { success: true, method: 'smtp' };
  } catch (error) {
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

function resolveItemThumbnail(item) {
  const thumbDir = path.resolve(__dirname, '../assets/thumbnails');
  if (item?.image) {
    const rawName = path.basename(String(item.image).split('?')[0]);
    const candidatePath = path.join(thumbDir, rawName);
    if (fs.existsSync(candidatePath)) return candidatePath;
  }
  const normName = String(item?.name || item?.slug || '').toLowerCase();
  if (normName.includes('wrist')) return path.join(thumbDir, 'wrist-wrap.png');
  if (normName.includes('knee')) return path.join(thumbDir, 'knee-wrap.png');
  if (normName.includes('elbow')) return path.join(thumbDir, 'elbow-wrap.png');
  if (normName.includes('strap')) return path.join(thumbDir, 'lifting-straps.png');
  if (normName.includes('belt') || normName.includes('lever')) return path.join(thumbDir, 'knee-wrap.png');
  if (normName.includes('yoga')) return path.join(thumbDir, 'yoga-belt.png');
  return null;
}

export async function sendOrderConfirmationEmail(email, order) {
  const orderNumber = order?.orderNumber || order?._id || 'ORD-UNKNOWN';
  const total = order?.pricing?.totalPayable ?? 0;
  const subtotal = order?.pricing?.subtotal ?? total;
  const discount = order?.pricing?.discount ?? 0;
  const shippingFee = order?.pricing?.shippingFee ?? 0;
  const items = Array.isArray(order?.items) ? order.items : [];
  const shippingAddress = order?.shippingAddress || {};
  const provider = (order?.paymentInfo?.provider || order?.paymentMethod || 'COD').toUpperCase();
  const isCod = provider.includes('COD') || provider.includes('CASH');
  const rawPaymentStatus = String(order?.paymentInfo?.paymentStatus || order?.paymentStatus || (isCod ? 'pending' : 'captured')).toLowerCase();
  const isPaymentPending = isCod ? rawPaymentStatus !== 'captured' : (rawPaymentStatus === 'pending');

  // 1. Console Log for instant dev monitoring
  console.log([
    '=========================================',
    '📦 [AVN ATHLETICS ORDER CONFIRMATION]',
    `📩 Customer: ${email}`,
    `🏷️  Order: ${orderNumber}`,
    `💰 Total Payable: ₹${Number(total).toLocaleString('en-IN')}`,
    `💳 Payment: ${provider} (${isPaymentPending ? 'PENDING' : 'CONFIRMED'})`,
    `📍 Ship to: ${shippingAddress.fullName || 'Customer'}, ${shippingAddress.city || ''} (${shippingAddress.pincode || ''})`,
    '=========================================',
  ].join('\n'));

  // 2. Prepare Attachments & Item HTML
  const attachments = [];
  const thumbDir = path.resolve(__dirname, '../assets/thumbnails');
  const logoPath = path.join(thumbDir, 'avn-logo.png');
  const hasLogoAttachment = fs.existsSync(logoPath);
  if (hasLogoAttachment) {
    attachments.push({
      filename: 'avn-logo.png',
      path: logoPath,
      cid: 'avn_brand_logo',
    });
  }

  const itemsHtml = items.map((item, idx) => {
    const itemTotal = item.subtotal || (item.price * item.quantity);
    const thumbPath = resolveItemThumbnail(item);
    let imageCellHtml = '';

    if (thumbPath && fs.existsSync(thumbPath)) {
      const cid = `prod_thumb_${idx}`;
      attachments.push({
        filename: path.basename(thumbPath),
        path: thumbPath,
        cid: cid,
      });
      imageCellHtml = `
        <img src="cid:${cid}" width="56" height="56" alt="" style="display: block; width: 56px; height: 56px; object-fit: contain; border-radius: 10px; background-color: #1a1a24; border: 1px solid #2a2a38;" />
      `;
    } else {
      imageCellHtml = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 56px; height: 56px; border-radius: 10px; background-color: #1a1a24; border: 1px solid #2a2a38; text-align: center;">
          <tr>
            <td style="vertical-align: middle; text-align: center; color: #FF1E27; font-size: 11px; font-weight: 900; letter-spacing: 1px; font-family: monospace;">
              AVN
            </td>
          </tr>
        </table>
      `;
    }

    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 10px; background-color: #171822; border-radius: 12px; border: 1px solid #252634;">
        <tr>
          <td style="padding: 12px 14px; width: 56px; vertical-align: middle;">
            ${imageCellHtml}
          </td>
          <td style="padding: 12px 12px 12px 0; vertical-align: middle;">
            <div style="font-size: 13px; font-weight: 800; color: #ffffff; letter-spacing: 0.3px; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              ${item.name}
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              Variant: <span style="color: #d1d5db; font-weight: 600;">${item.variantTitle || 'Standard'}</span> &bull; Qty: <strong style="color: #ffffff;">${item.quantity}</strong>
            </div>
          </td>
          <td style="padding: 12px 16px 12px 0; vertical-align: middle; text-align: right; white-space: nowrap;">
            <div style="font-size: 15px; font-weight: 800; color: #ffffff; font-family: monospace;">
              ₹${Number(itemTotal).toLocaleString('en-IN')}
            </div>
          </td>
        </tr>
      </table>
    `;
  }).join('');

  // 3. Dispatch via SMTP
  try {
    const transporter = await getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: `"AVN Athletics" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject: `Order Confirmed: ${orderNumber} | AVN Athletics`,
        attachments: attachments,
        html: `
          <div style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #13141c; border: 1px solid #22232e; border-radius: 16px; overflow: hidden; margin-top: 24px; margin-bottom: 32px;">
              
              <!-- Brand Header -->
              <div style="background: linear-gradient(180deg, #181922 0%, #101117 100%); padding: 28px 24px; text-align: center; border-bottom: 2px solid #FF1E27;">
                ${hasLogoAttachment ? `
                  <img src="cid:avn_brand_logo" width="160" height="auto" alt="AVN ATHLETICS" style="display: block; margin: 0 auto; max-width: 160px; height: auto; border: 0;" />
                ` : `
                  <h1 style="color: #FF1E27; font-size: 24px; font-weight: 900; letter-spacing: 2.5px; margin: 0; font-style: italic;">AVN ATHLETICS</h1>
                `}
                <div style="color: #888894; font-size: 10px; font-weight: 800; letter-spacing: 2px; margin-top: 8px; text-transform: uppercase;">
                  Commercial Fitness Gear &bull; Engineered For Strength
                </div>
              </div>

              <!-- Hero Status Confirmation -->
              <div style="padding: 26px 24px 20px 24px; text-align: center; background-color: #15161f; border-bottom: 1px solid #22232e;">
                <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.12); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.35); padding: 5px 16px; border-radius: 9999px; font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;">
                  ✓ ORDER CONFIRMED
                </div>
                <h2 style="color: #ffffff; font-size: 22px; font-weight: 900; margin: 14px 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                  Thank You For Your Order!
                </h2>
                <p style="color: #9ca3af; font-size: 13px; margin: 0; line-height: 1.5; max-width: 480px; margin: 0 auto;">
                  We have received your order <strong style="color: #FF1E27; font-family: monospace;">#${orderNumber}</strong>. Your high-performance equipment is being carefully prepared for express dispatch.
                </p>
              </div>

              <!-- Key Order Meta Strip (3-Column) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; background-color: #171822; border-bottom: 1px solid #22232e;">
                <tr>
                  <td style="padding: 16px; text-align: center; border-right: 1px solid #22232e; width: 33%;">
                    <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #888894;">Order ID</div>
                    <div style="font-size: 12px; font-weight: 900; color: #FF1E27; font-family: monospace; margin-top: 4px;">${orderNumber}</div>
                  </td>
                  <td style="padding: 16px; text-align: center; border-right: 1px solid #22232e; width: 33%;">
                    <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #888894;">Payment</div>
                    <div style="font-size: 11px; font-weight: 800; color: ${isPaymentPending ? '#F59E0B' : '#10B981'}; text-transform: uppercase; margin-top: 4px;">
                      ${isCod ? 'COD (Pending)' : 'Online (Paid)'}
                    </div>
                  </td>
                  <td style="padding: 16px; text-align: center; width: 33%;">
                    <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #888894;">Est. Delivery</div>
                    <div style="font-size: 12px; font-weight: 800; color: #ffffff; margin-top: 4px;">3 – 5 Days</div>
                  </td>
                </tr>
              </table>

              <!-- Dedicated Payment Status Banner -->
              <div style="padding: 20px 24px 0 24px;">
                ${isPaymentPending ? `
                  <div style="padding: 14px 16px; background-color: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                      <tr>
                        <td style="width: 28px; vertical-align: top; padding-right: 10px; font-size: 16px;">
                          ⏳
                        </td>
                        <td style="vertical-align: top;">
                          <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #F59E0B; margin-bottom: 3px;">
                            Payment Status: Due on Delivery (Cash on Delivery)
                          </div>
                          <div style="font-size: 12px; color: #d1d5db; line-height: 1.5;">
                            Please keep <strong>₹${Number(total).toLocaleString('en-IN')}</strong> in cash or UPI ready at the time of delivery. Payment will be collected and verified upon physical delivery.
                          </div>
                        </td>
                      </tr>
                    </table>
                  </div>
                ` : `
                  <div style="padding: 14px 16px; background-color: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                      <tr>
                        <td style="width: 24px; vertical-align: middle; padding-right: 8px; font-size: 15px; color: #10B981; font-weight: 900;">
                          ✓
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #10B981;">
                            Payment Status: Confirmed & Paid
                          </span>
                          <span style="font-size: 12px; color: #9ca3af; margin-left: 6px;">
                            &bull; ₹${Number(total).toLocaleString('en-IN')} captured via ${provider}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </div>
                `}
              </div>

              <!-- Itemized Gear Section -->
              <div style="padding: 20px 24px 10px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 12px; border-bottom: 1px solid #22232e; padding-bottom: 8px;">
                  <tr>
                    <td style="color: #ffffff; font-size: 11px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase;">
                      ORDER SUMMARY
                    </td>
                    <td style="text-align: right; color: #888894; font-size: 11px; font-weight: 700;">
                      ${items.length} ${items.length === 1 ? 'ITEM' : 'ITEMS'}
                    </td>
                  </tr>
                </table>

                ${itemsHtml}
              </div>

              <!-- Pricing Breakdown -->
              <div style="padding: 16px 24px 20px 24px; background-color: #15161f; border-top: 1px solid #22232e; border-bottom: 1px solid #22232e;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; font-size: 13px;">
                  <tr>
                    <td style="color: #9ca3af; padding: 6px 0; font-weight: 600;">Items Subtotal</td>
                    <td style="color: #ffffff; padding: 6px 0; text-align: right; font-weight: 700; font-family: monospace;">₹${Number(subtotal).toLocaleString('en-IN')}</td>
                  </tr>
                  ${discount > 0 ? `
                  <tr>
                    <td style="color: #10B981; padding: 6px 0; font-weight: 600;">Special Discount</td>
                    <td style="color: #10B981; padding: 6px 0; text-align: right; font-weight: 700; font-family: monospace;">-₹${Number(discount).toLocaleString('en-IN')}</td>
                  </tr>` : ''}
                  <tr>
                    <td style="color: #9ca3af; padding: 6px 0; font-weight: 600;">Shipping Fee</td>
                    <td style="color: #ffffff; padding: 6px 0; text-align: right; font-weight: 700;">
                      ${shippingFee === 0 ? '<span style="color: #10B981; font-weight: 800;">FREE</span>' : '<span style="font-family: monospace;">₹' + Number(shippingFee).toLocaleString('en-IN') + '</span>'}
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding: 8px 0;">
                      <div style="height: 1px; background-color: #262734;"></div>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #ffffff; font-size: 14px; font-weight: 900; padding: 6px 0; text-transform: uppercase; letter-spacing: 0.5px;">Total Payable</td>
                    <td style="color: #FF1E27; font-size: 18px; font-weight: 900; padding: 6px 0; text-align: right; font-family: monospace;">₹${Number(total).toLocaleString('en-IN')}</td>
                  </tr>
                </table>
              </div>

              <!-- Shipping Address -->
              <div style="padding: 24px;">
                <div style="color: #ffffff; font-size: 11px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 12px;">
                  DELIVERY DESTINATION
                </div>
                <div style="background-color: #171822; border: 1px solid #252634; border-radius: 12px; padding: 18px; font-size: 13px; line-height: 1.6; color: #9ca3af;">
                  <div style="color: #ffffff; font-size: 14px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px;">
                    ${shippingAddress.fullName || 'Valued Athlete'}
                  </div>
                  ${shippingAddress.phone ? `<div style="color: #d1d5db; font-size: 12px; margin-bottom: 6px;">📞 ${shippingAddress.phone}</div>` : ''}
                  <div style="color: #9ca3af; font-size: 12px;">
                    ${shippingAddress.street || ''}<br>
                    ${shippingAddress.city || ''}${shippingAddress.city && shippingAddress.state ? ', ' : ''}${shippingAddress.state || ''} &bull; <strong style="color: #ffffff;">${shippingAddress.pincode || ''}</strong><br>
                    ${shippingAddress.country || 'India'}
                  </div>
                </div>
              </div>

              <!-- Footer Support Info -->
              <div style="padding: 24px; text-align: center; background-color: #0e0e14; border-top: 1px solid #1e1e28; font-size: 11px; color: #6b7280; line-height: 1.6;">
                <div style="margin-bottom: 8px;">
                  Questions about your equipment or shipment? Contact our athlete support team:
                </div>
                <div style="margin-bottom: 12px;">
                  <a href="mailto:projectstestingavn@gmail.com" style="color: #FF1E27; text-decoration: none; font-weight: 800;">projectstestingavn@gmail.com</a>
                </div>
                <div style="color: #4b5563; font-size: 10px;">
                  &copy; 2026 AVN Athletics. All rights reserved. Built for Elite Strength.
                </div>
              </div>

            </div>
          </div>
        `,
      });
      console.log(`✉️ [AVN Athletics] Order confirmation email dispatched via SMTP to ${email}`);
      return { success: true, method: 'smtp' };
    }
  } catch (error) {
    console.warn('⚠️ Order confirmation SMTP dispatch fallback:', error.message);
  }

  return { success: true, method: 'console' };
}



// ---------------------------------------------------------------------------
// Appended below: cancellation + refund confirmations.
// These reuse the branding, helpers and transporter defined above; nothing
// above this line is modified.
// ---------------------------------------------------------------------------

const buildBrandShell = ({ badgeText, badgeTone, heading, intro, bodyHtml, hasLogo }) => {
  const tones = {
    green: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', fg: '#10B981' },
    red: { bg: 'rgba(255,30,39,0.12)', border: 'rgba(255,30,39,0.35)', fg: '#FF1E27' },
  };
  const tone = tones[badgeTone] || tones.green;

  return `
    <div style="margin:0;padding:0;background-color:#0b0c10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
      <div style="max-width:600px;margin:0 auto;background-color:#13141c;border:1px solid #22232e;border-radius:16px;overflow:hidden;margin-top:24px;margin-bottom:32px;">
        <div style="background:linear-gradient(180deg,#181922 0%,#101117 100%);padding:28px 24px;text-align:center;border-bottom:2px solid #FF1E27;">
          ${hasLogo
            ? `<img src="cid:avn_brand_logo" width="160" height="auto" alt="AVN ATHLETICS" style="display:block;margin:0 auto;max-width:160px;height:auto;border:0;" />`
            : `<h1 style="color:#FF1E27;font-size:24px;font-weight:900;letter-spacing:2.5px;margin:0;font-style:italic;">AVN ATHLETICS</h1>`}
          <div style="color:#888894;font-size:10px;font-weight:800;letter-spacing:2px;margin-top:8px;text-transform:uppercase;">Commercial Fitness Gear</div>
        </div>

        <div style="padding:26px 24px 20px 24px;text-align:center;background-color:#15161f;border-bottom:1px solid #22232e;">
          <div style="display:inline-block;background-color:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};padding:5px 16px;border-radius:9999px;font-size:11px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">${badgeText}</div>
          <h2 style="color:#ffffff;font-size:22px;font-weight:900;margin:14px 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">${heading}</h2>
          ${intro ? `<p style="color:#9ca3af;font-size:13px;margin:0 auto;line-height:1.5;max-width:480px;">${intro}</p>` : ''}
        </div>

        ${bodyHtml}

        <div style="padding:24px;text-align:center;background-color:#0e0e14;border-top:1px solid #1e1e28;font-size:11px;color:#6b7280;line-height:1.6;">
          <div style="margin-bottom:8px;">Questions about your equipment or shipment? Contact our athlete support team:</div>
          <div style="margin-bottom:12px;"><a href="mailto:projectstestingavn@gmail.com" style="color:#FF1E27;text-decoration:none;font-weight:800;">projectstestingavn@gmail.com</a></div>
          <div style="color:#4b5563;font-size:10px;">&copy; 2026 AVN Athletics. All rights reserved. Built for Elite Strength.</div>
        </div>
      </div>
    </div>`;
};

const inrFormat = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const mailDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Renders order lines + collects the matching CID attachments.
const buildOrderItemsBlock = (items, cidPrefix) => {
  const attachments = [];
  const thumbDir = path.resolve(__dirname, '../assets/thumbnails');

  const itemsHtml = (Array.isArray(items) ? items : []).map((item, idx) => {
    const itemTotal = item.subtotal || (Number(item.price) * Number(item.quantity));
    const thumbPath = resolveItemThumbnail(item);
    let imageCellHtml;

    if (thumbPath && fs.existsSync(thumbPath)) {
      const cid = `${cidPrefix}_${idx}`;
      attachments.push({ filename: path.basename(thumbPath), path: thumbPath, cid });
      imageCellHtml = `<img src="cid:${cid}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:contain;border-radius:10px;background-color:#1a1a24;border:1px solid #2a2a38;" />`;
    } else {
      imageCellHtml = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:56px;height:56px;border-radius:10px;background-color:#1a1a24;border:1px solid #2a2a38;text-align:center;">
          <tr><td style="vertical-align:middle;text-align:center;color:#FF1E27;font-size:11px;font-weight:900;letter-spacing:1px;font-family:monospace;">AVN</td></tr>
        </table>`;
    }

    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:10px;background-color:#171822;border-radius:12px;border:1px solid #252634;">
        <tr>
          <td style="padding:12px 14px;width:56px;vertical-align:middle;">${imageCellHtml}</td>
          <td style="padding:12px 12px 12px 0;vertical-align:middle;">
            <div style="font-size:13px;font-weight:800;color:#ffffff;letter-spacing:0.3px;text-transform:uppercase;">${item.name || ''}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Variant: <span style="color:#d1d5db;font-weight:600;">${item.variantTitle || 'Standard'}</span> &bull; Qty: <strong style="color:#ffffff;">${item.quantity}</strong></div>
          </td>
          <td style="padding:12px 16px 12px 0;vertical-align:middle;text-align:right;white-space:nowrap;">
            <div style="font-size:15px;font-weight:800;color:#ffffff;font-family:monospace;">${inrFormat(itemTotal)}</div>
          </td>
        </tr>
      </table>`;
  }).join('');

  return { attachments, itemsHtml };
};

// ---------------------------------------------------------------------------
// Order cancellation confirmation
// ---------------------------------------------------------------------------
export async function sendOrderCancellationEmail(email, order) {
  const orderNumber = order?.orderNumber || order?._id || 'ORD-UNKNOWN';
  const pricing = order?.pricing || {};
  const items = Array.isArray(order?.items) ? order.items : [];
  const cancellation = order?.cancellation || {};
  const provider = String(order?.paymentInfo?.provider || '').toUpperCase();
  const paymentStatus = String(order?.paymentInfo?.paymentStatus || '').toLowerCase();
  const wasPaid = provider !== 'COD' && paymentStatus === 'captured';

  const attachments = [];
  const thumbDir = path.resolve(__dirname, '../assets/thumbnails');
  const logoPath = path.join(thumbDir, 'avn-logo.png');
  const hasLogoAttachment = fs.existsSync(logoPath);
  if (hasLogoAttachment) {
    attachments.push({ filename: 'avn-logo.png', path: logoPath, cid: 'avn_brand_logo' });
  }

  const block = buildOrderItemsBlock(items, 'cancel_thumb');
  attachments.push(...block.attachments);

  const refundNotice = wasPaid
    ? `A refund of <strong style="color:#ffffff;">${inrFormat(pricing.totalPayable)}</strong> will be processed back to your original payment method within 5-7 business days. We will email you again once it is complete.`
    : `No payment was collected for this order, so there is nothing to refund.`;

  const bodyHtml = `
    <div style="padding:24px;">
      <div style="background-color:#171822;border:1px solid #252634;border-radius:12px;padding:18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;">
          <tr>
            <td style="color:#888894;padding:5px 0;">Order ID</td>
            <td style="color:#ffffff;padding:5px 0;text-align:right;font-family:monospace;font-weight:700;">${orderNumber}</td>
          </tr>
          ${cancellation.cancelledAt ? `<tr><td style="color:#888894;padding:5px 0;">Cancelled On</td><td style="color:#ffffff;padding:5px 0;text-align:right;font-weight:700;">${mailDate(cancellation.cancelledAt)}</td></tr>` : ''}
          ${cancellation.reason ? `<tr><td style="color:#888894;padding:5px 0;">Reason</td><td style="color:#ffffff;padding:5px 0;text-align:right;font-weight:700;">${cancellation.reason}</td></tr>` : ''}
        </table>
      </div>
    </div>

    <div style="padding:0 24px;">
      <div style="padding:14px 16px;background-color:${wasPaid ? 'rgba(16,185,129,0.08)' : 'rgba(148,163,184,0.08)'};border:1px solid ${wasPaid ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.3)'};border-radius:12px;font-size:12px;color:#d1d5db;line-height:1.5;">
        ${refundNotice}
      </div>
    </div>

    <div style="padding:20px 24px 10px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:12px;border-bottom:1px solid #22232e;padding-bottom:8px;">
        <tr>
          <td style="color:#ffffff;font-size:11px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;">Cancelled Items</td>
          <td style="text-align:right;color:#888894;font-size:11px;font-weight:700;">${items.length} ${items.length === 1 ? 'ITEM' : 'ITEMS'}</td>
        </tr>
      </table>
      ${block.itemsHtml}
    </div>`;

  const html = buildBrandShell({
    badgeText: 'Order Cancelled',
    badgeTone: 'red',
    heading: 'Your Order Has Been Cancelled',
    intro: `Order <strong style="color:#FF1E27;font-family:monospace;">#${orderNumber}</strong> has been cancelled. If this wasn't you, please contact us right away.`,
    bodyHtml,
    hasLogo: hasLogoAttachment,
  });

  try {
    const transporter = await getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: `"AVN Athletics" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject: `Order Cancelled: ${orderNumber} | AVN Athletics`,
        attachments,
        html,
      });
      console.log(`✉️ [AVN Athletics] Cancellation email dispatched to ${email}`);
      return { success: true, method: 'smtp' };
    }
  } catch (error) {
    console.warn('⚠️ Cancellation email SMTP dispatch fallback:', error.message);
  }

  return { success: true, method: 'console' };
}

// ---------------------------------------------------------------------------
// Refund processed confirmation
// ---------------------------------------------------------------------------
export async function sendRefundConfirmationEmail(email, order) {
  const orderNumber = order?.orderNumber || order?._id || 'ORD-UNKNOWN';
  const refundAmount = Number(order?.returnRequest?.refundAmount) || 0;
  const refundRef = order?.paymentInfo?.refundTransactionId || '';
  const refundedAt = order?.paymentInfo?.refundedAt || new Date();
  const account = order?.returnRequest?.refundAccountDetails || {};

  const attachments = [];
  const thumbDir = path.resolve(__dirname, '../assets/thumbnails');
  const logoPath = path.join(thumbDir, 'avn-logo.png');
  const hasLogoAttachment = fs.existsSync(logoPath);
  if (hasLogoAttachment) {
    attachments.push({ filename: 'avn-logo.png', path: logoPath, cid: 'avn_brand_logo' });
  }

  // Mask the destination — never send a full account number by email.
  const mask = (value) => {
    const s = String(value || '');
    if (s.length <= 4) return s;
    return `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
  };
  const destination = account.method === 'upi' && account.upiId
    ? `UPI &bull; ${mask(account.upiId)}`
    : account.method === 'bank' && account.accountNumber
      ? `Bank transfer &bull; ${mask(account.accountNumber)}`
      : 'your original payment method';

  const row = (label, value) => `
    <tr>
      <td style="color:#888894;padding:5px 0;">${label}</td>
      <td style="color:#ffffff;padding:5px 0;text-align:right;font-weight:700;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <div style="padding:24px;">
      <div style="text-align:center;padding:20px;background-color:#171822;border:1px solid #252634;border-radius:12px;">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#888894;">Amount Refunded</div>
        <div style="font-size:32px;font-weight:900;color:#10B981;font-family:monospace;margin-top:6px;">${inrFormat(refundAmount)}</div>
      </div>
    </div>

    <div style="padding:0 24px 24px 24px;">
      <div style="background-color:#171822;border:1px solid #252634;border-radius:12px;padding:18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;">
          ${row('Order ID', `<span style="font-family:monospace;">${orderNumber}</span>`)}
          ${refundRef ? row('Refund Reference', `<span style="font-family:monospace;">${refundRef}</span>`) : ''}
          ${row('Refunded To', destination)}
          ${row('Processed On', mailDate(refundedAt))}
        </table>
      </div>
      <div style="margin-top:16px;font-size:12px;color:#9ca3af;line-height:1.5;">
        Depending on your bank or UPI provider, it may take up to 5-7 business days for the amount to reflect in your account.
      </div>
    </div>`;

  const html = buildBrandShell({
    badgeText: 'Refund Processed',
    badgeTone: 'green',
    heading: 'Your Refund Has Been Processed',
    intro: `We've completed the refund for order <strong style="color:#FF1E27;font-family:monospace;">#${orderNumber}</strong>.`,
    bodyHtml,
    hasLogo: hasLogoAttachment,
  });

  try {
    const transporter = await getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: `"AVN Athletics" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject: `Refund Processed: ${orderNumber} | AVN Athletics`,
        attachments,
        html,
      });
      console.log(`✉️ [AVN Athletics] Refund email dispatched to ${email}`);
      return { success: true, method: 'smtp' };
    }
  } catch (error) {
    console.warn('⚠️ Refund email SMTP dispatch fallback:', error.message);
  }

  return { success: true, method: 'console' };
}

/**
 * Password-reset email — a single-use link the customer clicks to set a new password.
 */
export const sendPasswordResetEmail = async ({ to, name, resetUrl, expiresMinutes = 30 }) => {
  const safeName = name || 'there';

  const attachments = [];
  const thumbDir = path.resolve(__dirname, '../assets/thumbnails');
  const logoPath = path.join(thumbDir, 'avn-logo.png');
  const hasLogoAttachment = fs.existsSync(logoPath);
  if (hasLogoAttachment) {
    attachments.push({ filename: 'avn-logo.png', path: logoPath, cid: 'avn_brand_logo' });
  }

  const bodyHtml = `
    <div style="padding:20px 24px 10px 24px;">
      <p style="color:#c9c9d4;font-size:14px;line-height:1.6;margin:0 0 14px 0;">
        Hi ${safeName}, we received a request to reset your AVN Athletics password.
        Click the button below to choose a new one.
      </p>
      <div style="text-align:center;margin:22px 0;">
        <a href="${resetUrl}" style="display:inline-block;background-color:#FF1E27;color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.5px;text-transform:uppercase;padding:14px 28px;border-radius:12px;">Reset My Password</a>
      </div>
      <p style="color:#888894;font-size:12px;line-height:1.6;margin:0 0 8px 0;">
        This link expires in ${expiresMinutes} minutes and can be used once.
      </p>
      <p style="color:#888894;font-size:12px;line-height:1.6;margin:0;">
        If you didn't request this, you can safely ignore this email - your password will not change.
      </p>
    </div>`;

  const html = buildBrandShell({
    badgeText: 'Password Reset',
    badgeTone: 'red',
    heading: 'Reset Your Password',
    intro: 'Use the button below to set a new password for your AVN Athletics account.',
    bodyHtml,
    hasLogo: hasLogoAttachment,
  });

  try {
    const transporter = await getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: `"AVN Athletics" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to,
        subject: 'Reset your AVN Athletics password',
        attachments,
        html,
      });
      console.log(`[AVN Athletics] Password reset email dispatched to ${to}`);
      return { success: true, method: 'smtp' };
    }
  } catch (error) {
    console.warn('Password reset email SMTP dispatch fallback:', error.message);
  }

  return { success: true, method: 'console' };
};

/**
 * Staff welcome email — the sign-in credentials plus a single-use link to set a
 * password of their own. Sent when a super-admin creates a staff account.
 */
export const sendStaffWelcomeEmail = async ({ to, name, email, password, role, loginUrl, setPasswordUrl }) => {
  const attachments = [];
  const thumbDir = path.resolve(__dirname, '../assets/thumbnails');
  const logoPath = path.join(thumbDir, 'avn-logo.png');
  const hasLogoAttachment = fs.existsSync(logoPath);
  if (hasLogoAttachment) {
    attachments.push({ filename: 'avn-logo.png', path: logoPath, cid: 'avn_brand_logo' });
  }

  const row = (label, value) => `
    <tr>
      <td style="color:#888894;padding:6px 0;">${label}</td>
      <td style="color:#ffffff;padding:6px 0;text-align:right;font-weight:700;font-family:monospace;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <div style="padding:20px 24px 10px 24px;">
      <p style="color:#c9c9d4;font-size:14px;line-height:1.6;margin:0 0 16px 0;">
        Hi ${name || 'there'}, an AVN Management Portal account has been created for you.
        Here are your sign-in details.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#0f1018;border:1px solid #22232e;border-radius:12px;">
        <tr><td style="padding:14px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
            ${row('Email', email)}
            ${row('Temporary password', password)}
            ${row('Role', role)}
          </table>
        </td></tr>
      </table>
      <div style="text-align:center;margin:22px 0 10px 0;">
        <a href="${loginUrl}" style="display:inline-block;background-color:#2563EB;color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.5px;text-transform:uppercase;padding:14px 28px;border-radius:12px;">Sign In to the Portal</a>
      </div>
      <div style="text-align:center;margin:10px 0 18px 0;">
        <a href="${setPasswordUrl}" style="display:inline-block;color:#FF1E27;border:1px solid #FF1E27;text-decoration:none;font-weight:800;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;padding:12px 24px;border-radius:12px;">Change My Password</a>
      </div>
      <p style="color:#888894;font-size:12px;line-height:1.6;margin:0;">
        For your security, please replace the temporary password using the button above.
        That link is single-use and expires in 30 minutes.
      </p>
    </div>`;

  const html = buildBrandShell({
    badgeText: 'Welcome Aboard',
    badgeTone: 'green',
    heading: 'Your Staff Account Is Ready',
    intro: 'Sign in to the AVN Management Portal with the credentials below.',
    bodyHtml,
    hasLogo: hasLogoAttachment,
  });

  try {
    const transporter = await getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: `"AVN Athletics" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to,
        subject: 'Your AVN Management Portal credentials',
        attachments,
        html,
      });
      console.log(`[AVN Athletics] Staff welcome email dispatched to ${to}`);
      return { success: true, method: 'smtp' };
    }
  } catch (error) {
    console.warn('Staff welcome email SMTP dispatch fallback:', error.message);
  }

  return { success: true, method: 'console' };
};

// ---------------------------------------------------------------------------
// Return request decision (approved / rejected)
// ---------------------------------------------------------------------------
export async function sendReturnStatusEmail(email, order) {
  const orderNumber = order?.orderNumber || order?._id || 'ORD-UNKNOWN';
  const rr = order?.returnRequest || {};
  const items = Array.isArray(order?.items) ? order.items : [];
  const approved = rr.status === 'approved';
  const refundAmount = Number(rr.refundAmount) || 0;
  const isCod = String(order?.paymentInfo?.provider || '').toLowerCase() === 'cod';

  const attachments = [];
  const thumbDir = path.resolve(__dirname, '../assets/thumbnails');
  const logoPath = path.join(thumbDir, 'avn-logo.png');
  const hasLogoAttachment = fs.existsSync(logoPath);
  if (hasLogoAttachment) {
    attachments.push({ filename: 'avn-logo.png', path: logoPath, cid: 'avn_brand_logo' });
  }

  const block = buildOrderItemsBlock(items, 'return_thumb');
  attachments.push(...block.attachments);

  const decisionNotice = approved
    ? `A refund of <strong style="color:#ffffff;">${inrFormat(refundAmount)}</strong> has been approved. ${
        isCod
          ? 'It will be paid out to the UPI / bank details you provided with your request.'
          : 'It will be processed back to your original payment method.'
      } We will email you again once the refund has been recorded.`
    : `Your return request was declined, so no refund will be issued for this order.${
        rr.reviewNotes ? ` Reviewer note: <strong style="color:#ffffff;">${rr.reviewNotes}</strong>` : ''
      }`;

  const bodyHtml = `
    <div style="padding:24px;">
      <div style="background-color:#171822;border:1px solid #252634;border-radius:12px;padding:18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;">
          <tr>
            <td style="color:#888894;padding:5px 0;">Order ID</td>
            <td style="color:#ffffff;padding:5px 0;text-align:right;font-family:monospace;font-weight:700;">${orderNumber}</td>
          </tr>
          <tr>
            <td style="color:#888894;padding:5px 0;">Decision</td>
            <td style="color:${approved ? '#10B981' : '#FF1E27'};padding:5px 0;text-align:right;font-weight:800;text-transform:uppercase;">${approved ? 'Approved' : 'Declined'}</td>
          </tr>
          ${rr.reviewedAt ? `<tr><td style="color:#888894;padding:5px 0;">Reviewed On</td><td style="color:#ffffff;padding:5px 0;text-align:right;font-weight:700;">${mailDate(rr.reviewedAt)}</td></tr>` : ''}
          ${rr.reason ? `<tr><td style="color:#888894;padding:5px 0;">Your Reason</td><td style="color:#ffffff;padding:5px 0;text-align:right;font-weight:700;">${rr.reason}</td></tr>` : ''}
        </table>
      </div>
    </div>

    <div style="padding:0 24px;">
      <div style="padding:14px 16px;background-color:${approved ? 'rgba(16,185,129,0.08)' : 'rgba(255,30,39,0.08)'};border:1px solid ${approved ? 'rgba(16,185,129,0.3)' : 'rgba(255,30,39,0.3)'};border-radius:12px;font-size:12px;color:#d1d5db;line-height:1.5;">
        ${decisionNotice}
      </div>
    </div>

    <div style="padding:20px 24px 10px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:12px;border-bottom:1px solid #22232e;padding-bottom:8px;">
        <tr>
          <td style="color:#ffffff;font-size:11px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;">Returned Items</td>
          <td style="text-align:right;color:#888894;font-size:11px;font-weight:700;">${items.length} ${items.length === 1 ? 'ITEM' : 'ITEMS'}</td>
        </tr>
      </table>
      ${block.itemsHtml}
    </div>`;

  const html = buildBrandShell({
    badgeText: approved ? 'Return Approved' : 'Return Declined',
    badgeTone: approved ? 'green' : 'red',
    heading: approved ? 'Your Return Has Been Approved' : 'Your Return Request Was Declined',
    intro: approved
      ? `Good news — the return for order <strong style="color:#FF1E27;font-family:monospace;">#${orderNumber}</strong> has been approved.`
      : `We reviewed the return for order <strong style="color:#FF1E27;font-family:monospace;">#${orderNumber}</strong> and could not approve it.`,
    bodyHtml,
    hasLogo: hasLogoAttachment,
  });

  try {
    const transporter = await getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: `"AVN Athletics" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject: `Return ${approved ? 'Approved' : 'Declined'}: ${orderNumber} | AVN Athletics`,
        attachments,
        html,
      });
      console.log(`[AVN Athletics] Return status email dispatched to ${email}`);
      return { success: true, method: 'smtp' };
    }
  } catch (error) {
    console.warn('Return status email SMTP dispatch fallback:', error.message);
  }

  return { success: true, method: 'console' };
}
