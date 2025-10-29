import nodemailer from "nodemailer";
import fs from "fs";

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

// Shorten long order IDs for display (e.g., ABCD…WXYZ)
function condenseOrderId(orderId: string) {
  const clean = (orderId || "").replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length <= 10) return clean || "N/A";
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

// Inline logo via CID attachment if the file exists
function getLogoAttachment() {
  const logoPath = process.env.NC_LOGO_PATH || "C:\Users\keena\Downloads\NC_website\frontend\public\NC-Logo.png";
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
      const qty = Number.isFinite(item.qty) ? item.qty : 0;
      const subtotal = currencyFormatter.format((item.lineTotalCents || 0) / 100);
      // Example: - Hoodie x2 | $80.00
      return `- ${title} x${qty} | ${subtotal}`;
    })
    .join("\n");
}

function formatItemsHtml(items: ReceiptItem[]) {
  const rows = items
    .map((item) => {
      const title = escapeHtml(item.title || item.productId || "Item");
      const qty = String(item.qty ?? 0);
      const subtotal = currencyFormatter.format((item.lineTotalCents || 0) / 100);
      return `<tr>
        <td style="padding:8px 0;">${title}</td>
        <td style="text-align:center;padding:8px 0;">${qty}</td>
        <td style="text-align:right;padding:8px 0;">${escapeHtml(subtotal)}</td>
      </tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-family:Arial,sans-serif;font-size:14px;">
    <thead>
      <tr>
        <th style="text-align:left;border-bottom:1px solid #ddd;padding:6px 0;">Item</th>
        <th style="text-align:center;border-bottom:1px solid #ddd;padding:6px 0;">Qty</th>
        <th style="text-align:right;border-bottom:1px solid #ddd;padding:6px 0;">Subtotal</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
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
  const subject = `Your NC order ${condenseOrderId(payload.orderId)}`;
  const greeting = payload.customerName ? `Hi ${payload.customerName},` : "Hi there,";
  const itemsText = formatItemsText(payload.items || []);
  const totalText = currencyFormatter.format((payload.totalCents || 0) / 100);
  const addressText = formatAddress(payload.shippingAddress);

  const textBody = `${greeting}

Thanks for your purchase. Here are your order details:

Order ID: ${payload.orderId}
${payload.paymentRef ? `Payment reference: ${payload.paymentRef}\n` : ""}Items:\n${itemsText}

Order total: ${totalText}

Shipping to:
${addressText}

We will reach out when your order ships. If you have any questions, reply to this email.

The NC team`;

  const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;">
    <div style="text-align:center;margin-bottom:12px;">
      <img src="cid:nc-logo" alt="NC" style="max-width:180px;height:auto;"/>
    </div>
    <p>${escapeHtml(greeting)}</p>
    <p>Thanks for your purchase. Here are your order details:</p>
    <p><strong>Order ID:</strong> ${escapeHtml(condenseOrderId(payload.orderId))}<br/>
    ${payload.paymentRef ? `<strong>Payment reference:</strong> ${escapeHtml(payload.paymentRef)}<br/>` : ""}
    <strong>Items:</strong></p>
    ${formatItemsHtml(payload.items || [])}
    <p><strong>Order total:</strong> ${escapeHtml(totalText)}</p>
    <p><strong>Shipping to:</strong><br/>${escapeHtml(addressText).replace(/\n/g, "<br/>")}</p>
    <p>We will reach out when your order ships. If you have any questions, reply to this email.</p>
    <p>The NC team</p>
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
