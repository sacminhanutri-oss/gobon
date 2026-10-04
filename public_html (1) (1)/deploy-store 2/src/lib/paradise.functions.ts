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
    return { status };
  });
