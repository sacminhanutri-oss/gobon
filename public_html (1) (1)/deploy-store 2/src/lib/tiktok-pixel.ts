/**
 * Pixel do TikTok — instalação limpa.
 *
 * Carrega o script oficial do TikTok (ttq) no navegador e expõe
 * funções para disparar os eventos do funil de vendas:
 *   - trackViewContent()       → cliente abriu o checkout
 *   - trackInitiateCheckout()  → cliente gerou o Pix
 *   - trackCompletePayment()   → pagamento aprovado (conversão)
 *
 * Tudo roda só no navegador; no servidor vira no-op.
 * Falhas no pixel nunca podem atrapalhar o pagamento.
 */
import { checkoutConfig } from "@/lib/checkout-config";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ttq = any;

declare global {
  interface Window {
    ttq?: Ttq;
    TiktokAnalyticsObject?: string;
  }
}

let ready: Promise<void> | null = null;

/** Carrega o script oficial do TikTok uma única vez. */
function loadPixel(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }
  const pixelId = checkoutConfig.tiktokPixelId;
  if (!pixelId) return Promise.resolve();
  if (ready) return ready;

  ready = new Promise((resolve) => {
    const w = window;

    // Stub oficial do TikTok (mesmo padrão do snippet de instalação).
    const ttq: Ttq = (w.ttq = w.ttq || []);
    if (!ttq.methods) {
      ttq.methods = [
        "page", "track", "identify", "instances", "debug", "on", "off", "once",
        "ready", "alias", "group", "enableCookie", "disableCookie",
        "holdConsent", "revokeConsent", "grantConsent",
      ];
      ttq.setAndDefer = (obj: Ttq, method: string) => {
        obj[method] = (...args: unknown[]) => {
          obj.push([method, ...args]);
        };
      };
      for (const method of ttq.methods as string[]) {
        ttq.setAndDefer(ttq, method);
      }
      ttq.instance = (id: string) => {
        const track = (ttq._i[id] = ttq._i[id] || []);
        for (const method of ttq.methods as string[]) {
          ttq.setAndDefer(track, method);
        }
        return track;
      };
      ttq._i = {};
      ttq.load = (id: string) => {
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`;
        script.onload = () => resolve();
        script.onerror = () => resolve();
        const first = document.getElementsByTagName("script")[0];
        first?.parentNode?.insertBefore(script, first);
      };
    }

    if (ttq.loaded) {
      resolve();
      return;
    }
    ttq.load(pixelId);
    ttq.loaded = true;
    // Segurança: nunca deixar o pagamento esperando o pixel.
    window.setTimeout(resolve, 3000);
  });

  return ready;
}

/** Dados da compra enviados em todos os eventos. */
const paymentData = () => ({
  content_type: "product",
  content_name: checkoutConfig.product,
  value: checkoutConfig.price,
  currency: checkoutConfig.currency,
  quantity: checkoutConfig.quantity,
});

function track(event: "ViewContent" | "InitiateCheckout" | "CompletePayment") {
  void loadPixel().then(() => {
    try {
      window.ttq?.track(event, paymentData());
    } catch {
      // Falha no pixel nunca pode atrapalhar o pagamento.
    }
  });
}

/** Cliente abriu o checkout. */
export function trackViewContent() {
  track("ViewContent");
}

/** Cliente gerou o Pix (iniciou o pagamento). */
export function trackInitiateCheckout() {
  track("InitiateCheckout");
}

/** Pagamento aprovado: evento de venda para as campanhas. */
export function trackCompletePayment() {
  track("CompletePayment");
}
