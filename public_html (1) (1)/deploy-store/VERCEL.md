# Hospedar na Vercel

Este projeto é um app **TanStack Start** (React + servidor embutido). Na Vercel ele roda como
função serverless (Nitro detecta a Vercel automaticamente durante o build — já configurado no
`vite.config.ts`).

## Passo a passo

1. **Suba o código para um repositório no GitHub**
   ```bash
   git init
   git add .
   git commit -m "Checkout STORE"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
   git push -u origin main
   ```

2. **Importe na Vercel**
   - Acesse vercel.com → **Add New… → Project** → selecione o repositório.
   - Build Command: `npm run build` (ou deixe a Vercel detectar)
   - Node.js Version: **22**
   - Clique em **Deploy**.

3. **Cadastre as variáveis de ambiente**
   Na Vercel: **Settings → Environment Variables** (marque Production, Preview e Development).
   Veja `.env.example` — os valores de Supabase já estão lá; para o gateway, use a sua
   chave secreta real (nunca commite a chave no Git):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`
   - `PARADISE_SECRET_KEY` (a sua chave `sk_...`)
   - `PARADISE_ACCOUNT_ID=4404`

   Depois de salvar, faça **Deployments → ⋯ → Redeploy** para o build pegar os valores.

4. **Pronto.** A URL da Vercel já serve o checkout completo, com Pix real.

## Notas importantes

- **Banco de dados**: ele continua hospedado no Lovable Cloud (mesma instância que serve o
  preview e o app publicado). A Vercel só roda o site; nenhuma migração é necessária.
- **Pix**: funciona na Vercel, desde que `PARADISE_SECRET_KEY` esteja cadastrada lá.
- **Build local**: `npm install && npm run build` — o resultado vai para a pasta de saída do Nitro.
- Cada `git push` para `main` gera um novo deploy automático.
