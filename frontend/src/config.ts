const rawBackendUrl = import.meta.env.VITE_BACKEND_URL;
export const backendUrl = rawBackendUrl ? rawBackendUrl.replace(/\/+$/g, "") : undefined;

if (!backendUrl) {
  console.warn("VITE_BACKEND_URL not set");
}

export function requireBackendUrl(): string {
  if (!backendUrl) {
    throw new Error("VITE_BACKEND_URL is not configured");
  }
  return backendUrl;
}

export const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';
