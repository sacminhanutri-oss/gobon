/**
 * Símbolo do Pix fornecido pelo usuário (versão verde-água sólida).
 * PixMark: apenas o símbolo; PixWordmark: símbolo + texto "pix".
 */
import pixSymbol from "@/assets/pix-symbol.png";

export const PIX_COLOR = "#4EB8AC";

export function PixMark({ className }: { className?: string }) {
  return (
    <img
      src={pixSymbol}
      alt=""
      aria-hidden="true"
      className={className}
      draggable={false}
    />
  );
}

export function PixWordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`} aria-hidden="true">
      <img src={pixSymbol} alt="" className="h-6 w-auto sm:h-7" draggable={false} />
      <span className="text-2xl font-extrabold leading-none tracking-tight sm:text-3xl" style={{ color: PIX_COLOR }}>
        pix
      </span>
    </span>
  );
}
