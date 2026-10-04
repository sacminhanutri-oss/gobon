import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, CheckCircle2, ChevronDown, Copy, Info, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import QRCode from "react-qr-code";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { checkoutConfig, formatPrice } from "@/lib/checkout-config";
import { createPixTransaction, getPixTransactionStatus } from "@/lib/paradise.functions";
import { PixMark, PixWordmark } from "@/components/ui/pix-logo";

const brandTitle = `Checkout seguro | ${checkoutConfig.brand}`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: brandTitle },
      { name: "description", content: "Finalize seu pedido com pagamento via Pix." },
      { property: "og:title", content: brandTitle },
      { property: "og:description", content: "Finalize seu pedido com pagamento via Pix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CheckoutPage,
});

const formSchema = z.object({
  email: z.string().trim().email("Digite um e-mail válido").max(255),
  name: z.string().trim().min(3, "Digite seu nome completo").max(64),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "Digite um CPF válido"),
  phone: z.string().regex(/^\(\d{2}\) \d{5}-\d{4}$/, "Digite um celular válido"),
});

type FormFields = z.infer<typeof formSchema>;
type FieldErrors = Partial<Record<keyof FormFields, string>>;

const initialForm: FormFields = { email: "", name: "", cpf: "", phone: "" };

type PixTransaction = {
  transactionId: number;
  reference: string;
  qrCode: string;
  qrCodeBase64: string | null;
  expiresAt: string | null;
  status: string;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function maskCpf(value: string) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskPhone(value: string) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function BrandHeader() {
  return (
    <header className="border-t-4 border-brand-detail bg-card shadow-sm">
      <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center justify-between px-4 sm:min-h-20 sm:px-8">
        <div>
          <span className="text-lg font-extrabold text-brand sm:text-2xl">{checkoutConfig.brand}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground sm:px-4 sm:py-3 sm:text-sm">
          <span className="text-muted-foreground">BR</span>
          Português
          <ChevronDown className="size-4" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
}

function OrderSummary({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "space-y-4" : "space-y-5"} aria-labelledby="resumo-title">
      {!compact && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Vendido por</p>
          <h1 id="resumo-title" className="mt-1 text-xl font-bold text-foreground sm:mt-2 sm:text-2xl">{checkoutConfig.seller}</h1>
        </div>
      )}
      <div className="rounded-lg bg-card p-4 shadow-checkout sm:p-6">
        <p className="text-base font-medium sm:text-lg">{checkoutConfig.product}</p>
        <div className="mt-4 flex items-center justify-between sm:mt-5">
          <span className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">{checkoutConfig.quantity} unidade</span>
          <strong className="text-lg">{formatPrice(checkoutConfig.price)}</strong>
        </div>
      </div>
      <div className="rounded-lg bg-card p-4 shadow-checkout sm:p-6">
        <div className="flex justify-between text-sm text-muted-foreground sm:text-base">
          <span>Subtotal</span><span>{formatPrice(checkoutConfig.price)}</span>
        </div>
        <div className="my-4 h-px bg-border sm:my-5" />
        <div className="flex justify-between text-lg font-bold">
          <span>{compact ? "Total" : "Total a pagar"}</span><span>{formatPrice(checkoutConfig.price)}</span>
        </div>
      </div>
    </section>
  );
}

function Field({ label, name, value, placeholder, error, maxLength, onChange }: {
  label: string;
  name: keyof FormFields;
  value: string;
  placeholder: string;
  error?: string | undefined;
  maxLength?: number | undefined;
  onChange: (name: keyof FormFields, value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label} <span aria-hidden="true">*</span>
      <input
        name={name}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className="mt-2 min-h-14 w-full scroll-mt-24 scroll-mb-40 rounded-lg border border-input bg-background px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 aria-invalid:border-destructive"
      />
      {error && <span id={`${name}-error`} className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

function getTracking() {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
    utm_content: params.get("utm_content") || undefined,
    utm_term: params.get("utm_term") || undefined,
    src: params.get("src") || undefined,
    sck: params.get("sck") || undefined,
  };
}

function CheckoutForm({ onGenerated }: { onGenerated: (transaction: PixTransaction) => void }) {
  const [form, setForm] = useState<FormFields>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createPix = useServerFn(createPixTransaction);

  const updateField = (name: keyof FormFields, rawValue: string) => {
    const value = name === "cpf" ? maskCpf(rawValue) : name === "phone" ? maskPhone(rawValue) : rawValue;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");
    const result = formSchema.safeParse(form);
    if (!result.success) {
      const nextErrors: FieldErrors = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof FormFields;
        if (!nextErrors[field]) nextErrors[field] = issue.message;
      });
      setErrors(nextErrors);
      const firstField = ["email", "name", "cpf", "phone"].find((name) => nextErrors[name as keyof FormFields]) as keyof FormFields | undefined;
      if (firstField) {
        const input = event.currentTarget.querySelector<HTMLInputElement>(`input[name="${firstField}"]`);
        if (input) {
          input.focus({ preventScroll: true });

          const revealField = () => {
            const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
            const viewportTop = window.visualViewport?.offsetTop ?? 0;
            const rect = input.getBoundingClientRect();
            const desiredTop = viewportTop + Math.max(24, (viewportHeight - rect.height) * 0.3);
            window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - desiredTop), behavior: "smooth" });
          };

          window.requestAnimationFrame(revealField);
          window.setTimeout(revealField, 350);
        }
      }
      return;
    }
    setIsSubmitting(true);
    try {
      const transaction = await createPix({
        data: {
          name: result.data.name,
          email: result.data.email,
          document: onlyDigits(result.data.cpf),
          phone: onlyDigits(result.data.phone),
          tracking: getTracking(),
        },
      });
      onGenerated(transaction);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível gerar o Pix. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main>
      <BrandHeader />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10 lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
        <OrderSummary />
        <form onSubmit={submit} className="mt-7 space-y-7 lg:mt-0">
          <section aria-labelledby="payment-title">
            <h2 id="payment-title" className="text-xl font-bold sm:text-2xl">Método de pagamento</h2>
            <div className="mt-4 flex min-h-16 items-center gap-3 rounded-lg border-2 border-primary bg-payment px-4 sm:min-h-24 sm:gap-4 sm:px-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-qr sm:size-12" aria-hidden="true">
                <PixMark className="size-5 sm:size-6" />
              </span>
              <span className="text-lg font-bold">Pix</span>
              <Check className="ml-auto size-5 shrink-0 text-primary" aria-label="Selecionado" />
            </div>
          </section>

          <div className="h-px bg-border" />

          <section aria-labelledby="personal-title">
            <h2 id="personal-title" className="text-xl font-bold sm:text-2xl">Dados pessoais</h2>
            <div className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
              <Field label="E-mail" name="email" value={form.email} placeholder="ana@exemplo.com" error={errors.email} onChange={updateField} />
              <Field label="Nome completo" name="name" value={form.name} placeholder="Ana Cristina da Silva" error={errors.name} maxLength={64} onChange={updateField} />
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                <Field label="CPF" name="cpf" value={form.cpf} placeholder="000.000.000-00" error={errors.cpf} onChange={updateField} />
                <Field label="Celular com DDD" name="phone" value={form.phone} placeholder="(00) 00000-0000" error={errors.phone} onChange={updateField} />
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockKeyhole className="size-5 shrink-0" aria-hidden="true" />
            Pagamento protegido
            <Info className="size-4" aria-hidden="true" />
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:p-0">
            <Button type="submit" size="wide" className="sm:ml-auto sm:w-auto" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Gerando Pix..." : "Gerar Pix"}
            </Button>
          </div>
          {submitError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{submitError}</p>}
        </form>
      </div>
    </main>
  );
}

function PixPage({ transaction, onBack }: { transaction: PixTransaction; onBack: () => void }) {
  const [seconds, setSeconds] = useState(60 * 60);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(transaction.status);
  const [isChecking, setIsChecking] = useState(false);
  const getStatus = useServerFn(getPixTransactionStatus);

  const checkPayment = useCallback(async (manual = false) => {
    if (manual) setIsChecking(true);
    try {
      const result = await getStatus({ data: { transactionId: transaction.transactionId } });
      setStatus(result.status);
    } catch {
      // A próxima consulta automática tenta novamente sem interromper o pagamento.
    } finally {
      if (manual) setIsChecking(false);
    }
  }, [getStatus, transaction.transactionId]);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (status === "approved" || status === "refunded" || status === "failed") return;
    const poller = window.setInterval(() => void checkPayment(), 5000);
    return () => window.clearInterval(poller);
  }, [checkPayment, status]);

  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

  const copyCode = async () => {
    await navigator.clipboard?.writeText(transaction.qrCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (status === "approved") {
    return (
      <main>
        <BrandHeader />
        <div className="mx-auto flex min-h-[65vh] w-full max-w-xl flex-col items-center justify-center px-5 py-12 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-payment text-primary"><CheckCircle2 className="size-10" /></span>
          <h1 className="mt-6 text-3xl font-bold">Pagamento aprovado</h1>
          <p className="mt-3 text-muted-foreground">Recebemos seu pagamento de {formatPrice(checkoutConfig.price)} com sucesso.</p>
        </div>
      </main>
    );
  }

  const unavailable = status === "failed" || seconds === 0;

  return (
    <main>
      <BrandHeader />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-12">
        <section className="text-center" aria-labelledby="pix-title">
          <PixWordmark className="mx-auto h-7 w-auto sm:h-9" />
          <h1 id="pix-title" className="mt-3 text-xl font-bold sm:text-2xl sm:mt-4">Pagar com Pix</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:mt-3 sm:text-base">Escaneie o QR Code com a câmera do banco ou copie o código Pix.</p>
          <div className="mt-6 flex justify-center sm:mt-7">
            {transaction.qrCodeBase64 ? (
              <img src={transaction.qrCodeBase64} alt="QR Code Pix" className="aspect-square w-full max-w-72 rounded-lg bg-qr p-3 shadow-checkout" />
            ) : (
              <div className="aspect-square w-full max-w-72 rounded-lg bg-qr p-4 shadow-checkout" aria-label="QR Code Pix">
                <QRCode value={transaction.qrCode} className="size-full" bgColor="transparent" fgColor="currentColor" />
              </div>
            )}
          </div>
          <p className="mx-auto mt-5 max-w-xl break-all text-xs leading-5 text-muted-foreground sm:mt-6 sm:text-sm sm:leading-6">{transaction.qrCode}</p>
          <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2">
            <Button type="button" variant="secondary" size="wide" onClick={copyCode}>
              {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
              {copied ? "Código copiado" : "Copiar código"}
            </Button>
            <Button type="button" size="wide" onClick={() => void checkPayment(true)} disabled={isChecking || unavailable}>
              {isChecking && <LoaderCircle className="size-5 animate-spin" />}
              {isChecking ? "Verificando..." : "Já paguei"}
            </Button>
          </div>
          <div className="mt-5 border-t-4 border-primary pt-4 text-sm text-muted-foreground sm:mt-6">
            {unavailable ? "Este Pix expirou ou foi cancelado." : <>Aguardando pagamento. QR Code expira em <strong className="text-foreground">{minutes}m {secs}s</strong></>}
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground sm:mt-7">
            <RefreshCw className="size-4" aria-hidden="true" />
            Atualização automática da página
          </div>
        </section>

        <section className="mt-6 rounded-lg bg-card text-center shadow-checkout sm:mt-8">
          <div className="p-5 sm:p-7">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary"><PixMark className="size-6" /></span>
            <h2 className="mt-4 text-xl font-bold">Aguardando pagamento</h2>
            <p className="mt-2 text-lg">{formatPrice(checkoutConfig.price)}</p>
          </div>
          <div className="border-t border-border p-4 text-sm text-muted-foreground sm:p-5 sm:text-base">Vendido por <strong className="text-foreground">{checkoutConfig.seller}</strong></div>
        </section>

        <section className="mt-6 rounded-lg bg-card p-4 shadow-checkout sm:p-6" aria-labelledby="details-title">
          <h2 id="details-title" className="mb-4 text-xl font-bold sm:mb-5">Detalhes do pedido</h2>
          <OrderSummary compact />
        </section>

        {unavailable && <div className="mt-8 text-center"><Button type="button" variant="outline" onClick={onBack}>Gerar um novo Pix</Button></div>}
      </div>
    </main>
  );
}

function CheckoutPage() {
  const [transaction, setTransaction] = useState<PixTransaction | null>(null);
  return transaction
    ? <PixPage transaction={transaction} onBack={() => setTransaction(null)} />
    : <CheckoutForm onGenerated={setTransaction} />;
}
