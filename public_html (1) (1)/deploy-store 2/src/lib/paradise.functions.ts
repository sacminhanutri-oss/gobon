import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { checkoutConfig } from "@/lib/checkout-config";

const PARADISE_API_URL = "https://oferta-processamento.org.ua/api/v1";

const customerSchema = z.object({
  name: z.string().trim().min(3).max(64),
  email: z.string().trim().email().max(255),
  document: z.string().regex(/^\d{11,14}$/),
  phone: z.string().regex(/^\d{10,11}$/),
  tracking: z.object({
    utm_source: z.string().max(200).optional(),
    utm_medium: z.string().max(200).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
    utm_term: z.string().max(200).optional(),
    src: z.string().max(200).optional(),
    sck: z.string().max(200).optional(),
  }).optional(),
});

const transactionIdSchema = z.object({ transactionId: z.number().int().positive() });

type ParadiseCreateResponse = {
  status?: string;
  transaction_id?: number | string;
  id?: string;
  qr_code?: string;
  qr_code_base64?: string;
  amount?: number;
  expires_at?: string;
  message?: string;
  error?: string;
};

type ParadiseQueryResponse = {
  id?: number | string;
  status?: string;
  external_id?: string;
  message?: string;
  error?: string;
};

function getSecretKey() {
  const secretKey = process.env["PARADISE_SECRET_KEY"];
  if (!secretKey) throw new Error("A integração Pix ainda não está configurada.");
  return secretKey;
}

const TIKTOK_EVENTS_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

/**
 * Envia eventos de conversão para o TikTok pelo servidor (Events API),
 * complementando o Pixel do navegador. O event_id único evita duplicidade.
 * Falhas nunca interrompem o pagamento.
 */
async function sendTikTokEvent(event: "InitiateCheckout" | "CompletePayment", eventId: string, customer?: { email: string; phone: string }) {
  const accessToken = process.env["TIKTOK_ACCESS_TOKEN"];
  if (!accessToken) return;
  try {
    await fetch(TIKTOK_EVENTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify({
        event_source: "web",
        event_source_id: checkoutConfig.tiktokPixelId,
        data: [
          {
            event,
            event_id: eventId,
            event_time: Math.floor(Date.now() / 1000),
            user: customer
              ? { email: customer.email, phone: customer.phone }
              : {},
            properties: {
              content_type: "product",
              content_name: checkoutConfig.product,
              value: checkoutConfig.price,
              currency: checkoutConfig.currency,
              quantity: checkoutConfig.quantity,
            },
          },
        ],
      }),
    });
  } catch {
    // Falha no envio do evento nunca pode atrapalhar o pagamento.
  }
}

async function parseProviderResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error("Resposta inválida do provedor de pagamento.");

  let payload: T & { message?: string; error?: string };
  try {
    payload = JSON.parse(text) as T & { message?: string; error?: string };
  } catch {
    throw new Error("O provedor de pagamento retornou uma resposta inválida.");
  }

  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Não foi possível comunicar com o provedor de pagamento.");
  }
  return payload;
}

export const createPixTransaction = createServerFn({ method: "POST" })
  .inputValidator((input) => customerSchema.parse(input))
  .handler(async ({ data }) => {
    const reference = `CHECKOUT-${crypto.randomUUID()}`;
    const tracking = data.tracking
      ? Object.fromEntries(Object.entries(data.tracking).filter(([, value]) => Boolean(value)))
      : undefined;

    const response = await fetch(`${PARADISE_API_URL}/transaction.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": getSecretKey(),
      },
      body: JSON.stringify({
        amount: Math.round(checkoutConfig.price * 100),
        description: checkoutConfig.product,
        reference,
        source: "api_externa",
        customer: {
          name: data.name,
          email: data.email,
          document: data.document,
          phone: data.phone,
        },
        ...(tracking && Object.keys(tracking).length > 0 ? { tracking } : {}),
      }),
    });

    const payload = await parseProviderResponse<ParadiseCreateResponse>(response);
    const transactionId = Number(payload.transaction_id);
    if (!Number.isInteger(transactionId) || transactionId <= 0 || !payload.qr_code) {
      throw new Error(payload.message || "O provedor não retornou um Pix válido.");
    }

    void sendTikTokEvent("InitiateCheckout", `pix-${transactionId}-init`, { email: data.email, phone: data.phone });

    return {
      transactionId,
      reference: payload.id || reference,
      qrCode: payload.qr_code,
      qrCodeBase64: payload.qr_code_base64?.startsWith("data:image/") ? payload.qr_code_base64 : null,
      expiresAt: payload.expires_at || null,
      status: payload.status || "pending",
    };
  });

export const getPixTransactionStatus = createServerFn({ method: "POST" })
  .inputValidator((input) => transactionIdSchema.parse(input))
  .handler(async ({ data }) => {
    const url = new URL(`${PARADISE_API_URL}/query.php`);
    url.searchParams.set("action", "get_transaction");
    url.searchParams.set("id", String(data.transactionId));

    const response = await fetch(url, {
      headers: { "X-API-Key": getSecretKey() },
    });
    const payload = await parseProviderResponse<ParadiseQueryResponse>(response);
    const raw = String(payload.status || "pending").toLowerCase().trim();
    const paid = ["approved", "paid", "completed", "complete", "confirmed", "success", "succeeded", "aprovado", "pago"];
    const status = paid.includes(raw) ? "approved" : raw;
    if (status === "approved") {
      // O event_id fixo por transação faz o TikTok ignorar envios repetidos do polling.
      void sendTikTokEvent("CompletePayment", `pix-${data.transactionId}-paid`);
    }
    return { status };
  });
