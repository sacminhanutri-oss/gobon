export const checkoutConfig = {
  brand: "STORE",
  seller: "TikTok",
  product: "Seu produto",
  price: 19.98,
  quantity: 1,
  currency: "BRL",
} as const;

export const formatPrice = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: checkoutConfig.currency,
  }).format(value);