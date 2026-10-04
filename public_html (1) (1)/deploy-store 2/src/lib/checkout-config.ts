export const checkoutConfig = {
  brand: "STORE",
  seller: "TikTok",
  product: "Seu produto",
  price: 19.98,
  quantity: 1,
  currency: "BRL",
  // Página para onde o cliente é levado assim que o pagamento é aprovado.
  upsellUrl: "https://gobon-1ey6.vercel.app/up1",
} as const;

export const formatPrice = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: checkoutConfig.currency,
  }).format(value);
