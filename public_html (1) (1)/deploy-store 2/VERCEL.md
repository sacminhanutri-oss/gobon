# Colocar o checkout no SEU site: seudominio.com/pagamento

O checkout roda num **projeto próprio da Vercel** e o site do produto "empresta"
o caminho `/pagamento` para ele. Assim os dois ficam no mesmo domínio, sem subdomínio:

```
seudominio.com              → site do produto (como já é hoje)
seudominio.com/pagamento    → checkout com Pix
```

Você precisa fazer **2 coisas**, nesta ordem.

---

## Passo 1 — Criar o projeto do checkout na Vercel

1. Na Vercel: **Add New… → Project** e importe o repositório `gobon`.
2. Antes de clicar em Deploy, em **Root Directory** clique em **Edit** e digite exatamente:
   ```
   public_html (1) (1)/deploy-store
   ```
3. Confirme: **Build Command** = `npm run build` e **Node.js Version** = 22.
4. Em **Environment Variables**, cadastre (ambientes **Production** e **Preview**):

   | Name | Value |
   |---|---|
   | `PARADISE_SECRET_KEY` | sua chave secreta do Pix (a que começa com `sk_`) |
   | `PARADISE_ACCOUNT_ID` | `4404` |
   | `VITE_SUPABASE_URL` | `https://hwlqpgxqnziltsgexdoy.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_EQ6BISEw5JhNw8BBef9rhw_uS-qCOTF` |
   | `VITE_SUPABASE_PROJECT_ID` | `hwlqpgxqnziltsgexdoy` |
   | `CHECKOUT_BASE_PATH` | `/pagamento/` |

5. Clique em **Deploy** e espere aparecer **Ready**.
6. Copie o endereço do projeto: **Settings → Domains** (parece com
   `https://gobon-checkout.vercel.app`). Teste no navegador:
   `https://SEU-CHECKOUT.vercel.app/pagamento` — o checkout deve abrir ali.
   (A raiz `https://SEU-CHECKOUT.vercel.app/` mostra 404 — é normal.)

---

## Passo 2 — Ligar o `/pagamento` ao site do produto

1. No GitHub, na **raiz do repositório** `gobon` (fora da pasta deploy-store),
   crie um arquivo chamado `vercel.json` com este conteúdo — troque
   `SEU-CHECKOUT.vercel.app` pelo endereço copiado no Passo 1:

   ```json
   {
     "rewrites": [
       { "source": "/pagamento", "destination": "https://SEU-CHECKOUT.vercel.app/pagamento" },
       { "source": "/pagamento/:path*", "destination": "https://SEU-CHECKOUT.vercel.app/pagamento/:path*" }
     ]
   }
   ```

2. Faça o commit. A Vercel publica o produto sozinha em ~1 minuto.

## Passo 3 — Teste final

Abra `https://seudominio.com/pagamento` (ou `https://gobon-1ey6.vercel.app/pagamento`)
e gere um Pix de teste. O QR Code deve aparecer e a compra confirmar normalmente.

---

## Observações

- **Se o site do produto for Next.js**: em vez de `vercel.json`, adicione as mesmas
  `rewrites` no `next.config.js` do produto.
- **Mudar o caminho** (ex.: `/comprar`): troque `pagamento` nos 2 lugares
  (variável `CHECKOUT_BASE_PATH` e o `vercel.json`) e reimplante os dois projetos.
- **Atualizar o checkout depois**: baixe o ZIP novo aqui no Lovable e substitua o
  conteúdo da pasta deploy-store no GitHub — o projeto do checkout publica sozinho.
  O `vercel.json` do produto não precisa mudar.
- **Não aponte o domínio** para o projeto do checkout. Ele fica sem domínio próprio;
  quem empresta o endereço é o projeto do produto.
