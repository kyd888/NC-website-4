import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

// -----------------------------
// Types
// -----------------------------
export type ShippingAddress = {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type ReceiptItem = {
  productId: string;
  title: string;
  qty: number;
  priceCents: number;
  lineTotalCents: number;
  imageUrl?: string;
};

export type ReceiptEmailPayload = {
  orderId: string;
  totalCents: number;
  customerName?: string;
  customerEmail?: string;
  shippingAddress?: ShippingAddress;
  items: ReceiptItem[];
  paymentRef?: string;
};

export type VaultReleaseEmailPayload = {
  email: string;
  productId: string;
  productTitle: string;
  windowMinutes: number;
  releaseStartsAt: string; // ISO string
  releaseEndsAt: string;   // ISO string
  dropId?: string;
};

// -----------------------------
// Transport bootstrap with lazy init and verification
// -----------------------------
let transporterPromise: Promise<nodemailer.Transporter | null> | null = null;
let transportDisabled = false;

function buildTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;

  if (!host || !from) {
    if (!transportDisabled) {
      transportDisabled = true;
      console.warn("[mailer] SMTP_HOST and SMTP_FROM are required to send emails. Delivery disabled.");
    }
    return null;
  }

  const port = Number.parseInt(process.env.SMTP_PORT || "", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : secure ? 465 : 587,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return transporter;
}

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (transportDisabled) return null;
  if (!transporterPromise) {
    transporterPromise = (async () => {
      try {
        const transporter = buildTransporter();
        if (!transporter) return null;
        try {
          await transporter.verify();
        } catch (error: any) {
          console.warn("[mailer] transporter verification failed:", error?.message || error);
        }
        return transporter;
      } catch (error) {
        console.error("[mailer] Unable to initialize transporter:", error);
        transportDisabled = true;
        return null;
      }
    })();
  }
  return transporterPromise;
}

// -----------------------------
// Utilities
// -----------------------------
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const RECEIPT_FALLBACK_IMAGE =
  process.env.NC_RECEIPT_FALLBACK_IMAGE ||
  "https://via.placeholder.com/160x160/111111/FFFFFF?text=NC";

// Shorten long order IDs for display (e.g., ABCD…WXYZ)
function condenseOrderId(orderId: string) {
  const clean = (orderId || "").replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length <= 10) return clean || "N/A";
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

// Inline logo via CID attachment if the file exists
function getLogoAttachment() {
  const configuredPath = process.env.NC_LOGO_PATH;
  const fallbackPath = path.resolve(process.cwd(), "frontend", "public", "NC-Logo.png");
  const logoPath =
    configuredPath && configuredPath.trim().length > 0 ? configuredPath : fallbackPath;
  try {
    if (logoPath && fs.existsSync(logoPath)) {
      return { filename: "NC-Logo.png", path: logoPath, cid: "nc-logo" } as const;
    }
  } catch {}
  return null;
}

function formatCityStateZip(address?: ShippingAddress) {
  if (!address) return "";
  const city = address.city?.trim();
  const state = address.state?.trim();
  const zip = address.postalCode?.trim();
  if (!city && !state && !zip) return "";
  // City, ST ZIP
  return [
    [city, state].filter(Boolean).join(", "),
    zip,
  ].filter(Boolean).join(" ");
}

function formatAddress(address?: ShippingAddress) {
  if (!address) return "No shipping address provided.";
  const parts = [
    address.line1,
    address.line2,
    formatCityStateZip(address),
    address.country,
  ].filter((part) => part && String(part).trim().length > 0);
  return parts.join("\n");
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"]/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return ch;
    }
  });
}

function formatItemsText(items: ReceiptItem[]) {
  return items
    .map((item) => {
      const title = item.title || item.productId || "Item";
      const qty = Number.isFinite(item.qty) ? Number(item.qty) : 0;
      const subtotal = currencyFormatter.format((item.lineTotalCents || 0) / 100);
      return `- ${title} x${qty} | ${subtotal}`;
    })
    .join("\n");
}

function formatItemsHtml(items: ReceiptItem[]) {
  if (!items.length) {
    return `<div style="padding:12px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;">No items found for this order.</div>`;
  }

  const rows = items
    .map((item) => {
      const title = escapeHtml(item.title || item.productId || "Item");
      const qty = String(item.qty ?? 0);
      const subtotal = currencyFormatter.format((item.lineTotalCents || 0) / 100);
      const imageSrc = escapeHtml(
        item.imageUrl && /^https?:\/\//i.test(item.imageUrl)
          ? item.imageUrl
          : RECEIPT_FALLBACK_IMAGE,
      );
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid rgba(17,17,17,.08);">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="width:96px;padding-right:16px;vertical-align:top;">
                <div style="width:96px;height:96px;border-radius:22px;overflow:hidden;background:#111;">
                  <img src="${imageSrc}" alt="${title}" style="display:block;width:96px;height:96px;object-fit:cover;"/>
                </div>
              </td>
              <td style="vertical-align:top;">
                <div style="font-weight:600;font-size:15px;letter-spacing:-0.01em;color:#111;">${title}</div>
                <div style="margin-top:8px;font-size:12px;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;">Qty ${qty}</div>
                <div style="margin-top:12px;font-weight:600;font-size:14px;color:#111;">${escapeHtml(subtotal)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0;">${rows}</table>`;
}

function formatWindowLabel(minutes: number) {
  const safeMinutes = Math.max(1, Math.floor(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// -----------------------------
// Mailers
// -----------------------------
export async function sendReceiptEmail(payload: ReceiptEmailPayload) {
  if (!payload.customerEmail) return false;
  const transporter = await getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM!; // expected to be like Name <noreply@example.com>
  const orderLabel = condenseOrderId(payload.orderId);
  const subject = `Your NC order ${orderLabel}`;
  const greeting = payload.customerName ? `Hi ${payload.customerName},` : "Hi there,";
  const itemsText = formatItemsText(payload.items || []);
  const totalText = currencyFormatter.format((payload.totalCents || 0) / 100);
  const addressText = formatAddress(payload.shippingAddress);
  const siteUrl =
    process.env.FRONTEND_ORIGIN ??
    process.env.BACKEND_ORIGIN ??
    "https://nc-website.com";

  const textBody = `${greeting}

Thanks for your purchase. Here are your order details:

Order ID: ${payload.orderId}
${payload.paymentRef ? `Payment reference: ${payload.paymentRef}\n` : ""}Items:\n${itemsText}

Order total: ${totalText}

Shipping to:
${addressText}

We will reach out when your order ships. If you have any questions, reply to this email.

Visit us: ${siteUrl}

The NC team`;

  const addressHtml = escapeHtml(addressText).replace(/\n/g, "<br/>");
  const htmlBody = `
  <div style="margin:0;padding:0;background:#f2f2ee;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-radius:32px;background:#ffffff;padding:40px 36px;box-shadow:0 28px 60px rgba(17,17,17,.08);font-family:Arial,sans-serif;color:#111;">
            <tr>
              <td style="text-align:center;padding-bottom:20px;">
                <img src="cid:nc-logo" alt="NC logo" style="max-width:160px;height:auto;display:inline-block;"/>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding-bottom:6px;">
                <div style="font-size:12px;letter-spacing:0.32em;text-transform:uppercase;color:#6b6b6b;">Order Receipt</div>
                <div style="margin-top:10px;font-size:26px;font-weight:700;letter-spacing:-0.03em;">#${escapeHtml(orderLabel)}</div>
              </td>
            </tr>
            ${
              payload.paymentRef
                ? `<tr><td style="text-align:center;font-size:12px;color:#6b7280;padding-bottom:18px;">
                    Payment reference: <span style="font-weight:600;color:#111;">${escapeHtml(payload.paymentRef)}</span>
                  </td></tr>`
                : ""
            }
            <tr>
              <td style="padding:24px 0;border-top:1px solid rgba(17,17,17,.08);border-bottom:1px solid rgba(17,17,17,.08);">
                ${formatItemsHtml(payload.items || [])}
              </td>
            </tr>
            <tr>
              <td style="padding-top:28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="width:50%;padding-right:14px;vertical-align:top;">
                      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.28em;color:#6b7280;">Order Summary</div>
                      <div style="margin-top:14px;font-size:16px;font-weight:700;">${escapeHtml(totalText)}</div>
                      <div style="margin-top:10px;font-size:13px;color:#6b7280;line-height:1.6;">${escapeHtml(
                        payload.items?.length === 1
                          ? "1 item"
                          : `${payload.items?.length ?? 0} items`,
                      )}</div>
                    </td>
                    <td style="width:50%;padding-left:14px;vertical-align:top;">
                      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.28em;color:#6b7280;">Shipping Address</div>
                      <div style="margin-top:14px;font-size:14px;line-height:1.7;color:#111;">${addressHtml}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-top:32px;text-align:center;">
                <a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:#111;color:#ffffff;text-decoration:none;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;font-size:12px;">Visit NC Studio</a>
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;font-size:13px;line-height:1.7;color:#111;">
                <p style="margin:0 0 18px 0;">${escapeHtml(
                  greeting,
                )}</p>
                <p style="margin:0 0 18px 0;">Thanks for your purchase. We’ll reach out as soon as your order ships. If you have any questions, simply reply to this email.</p>
                <p style="margin:0;">The NC team</p>
              </td>
            </tr>
            <tr>
              <td style="padding-top:28px;font-size:11px;color:#9ca3af;text-align:center;letter-spacing:0.24em;text-transform:uppercase;">
                ${escapeHtml(siteUrl)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;

  try {
    const maybeLogo = getLogoAttachment();
    await transporter.sendMail({
      from,
      to: payload.customerEmail,
      subject,
      text: textBody,
      html: htmlBody,
      attachments: maybeLogo ? [maybeLogo] : undefined,
    });
    return true;
  } catch (error) {
    console.error("[mailer] Failed to send receipt email:", error);
    return false;
  }
}

export async function sendVaultReleaseEmail(payload: VaultReleaseEmailPayload) {
  if (!payload.email) return false;
  const transporter = await getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM!;
  const windowLabel = formatWindowLabel(payload.windowMinutes);
  // Avoid dashes for style. Use a vertical bar.
  const subject = `${payload.productTitle} | limited restock live for ${windowLabel}`;
  const startsAt = formatDateTime(payload.releaseStartsAt);
  const endsAt = formatDateTime(payload.releaseEndsAt);
  const linkBase = process.env.FRONTEND_ORIGIN ?? process.env.BACKEND_ORIGIN ?? "";
  const link = linkBase || "https://nc.example.com";

  const textBody = [
    `Your saved item ${payload.productTitle} is live in the Vault.`,
    "",
    `This limited restock window lasts for ${windowLabel} and closes at ${endsAt}.`,
    "",
    `Link: ${link}`,
    "",
    `Drop ID: ${payload.dropId ?? "N/A"}`,
    "",
    `Vault opened: ${startsAt}`,
    `Vault closes: ${endsAt}`,
    "",
    "Go now before it locks again.",
    "",
    "The NC team",
  ].filter(Boolean).join("\n");

  const htmlBody = `<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;\">\n    <p><strong>${escapeHtml(payload.productTitle)}</strong> is back in the Vault.</p>\n    <p>This mystery release is open for <strong>${escapeHtml(windowLabel)}</strong> and closes at <strong>${escapeHtml(endsAt)}</strong>.</p>\n    <p><a href=\"${escapeHtml(link)}\" style=\"color:#111;text-decoration:underline;\">Jump in now</a> before it locks again.</p>\n    <p style=\"font-size:12px;color:#6b7280;margin-top:18px;\">\n      Drop ID: ${escapeHtml(payload.dropId ?? "N/A")}<br/>\n      Vault opened: ${escapeHtml(startsAt)}<br/>\n      Vault closes: ${escapeHtml(endsAt)}\n    </p>\n    <p>The NC team</p>\n  </div>`;

  try {
    await transporter.sendMail({
      from,
      to: payload.email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    return true;
  } catch (error) {
    console.error("[mailer] Failed to send vault release email:", error);
    return false;
  }
}

// Optional helper to quickly test env at startup. Call once if desired.
export async function verifyMailerOnce() {
  const t = await getTransporter();
  return Boolean(t);
}
