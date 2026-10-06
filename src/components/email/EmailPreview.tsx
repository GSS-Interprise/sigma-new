import { useState } from "react";
import { Monitor, Moon, Smartphone, Sun } from "lucide-react";

/**
 * Prévia do e-mail como o médico vai ver: computador ou celular, tema claro ou escuro.
 * É o HTML real do envio, num iframe sem script.
 *
 * Tema escuro: o iframe herda o `color-scheme` do elemento, então as regras
 * `@media (prefers-color-scheme: dark)` do próprio e-mail passam a valer. Isso mostra o
 * que o e-mail FAZ no escuro; o Gmail ainda pode inverter cores por conta própria — por
 * isso o teste de verdade continua sendo o "Enviar teste".
 */
export function EmailPreview({ html, assunto }: { html: string; assunto: string }) {
  const [tela, setTela] = useState<"desktop" | "celular">("desktop");
  const [escuro, setEscuro] = useState(false);

  const botao = (ativo: boolean) =>
    `inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs ${ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          <button type="button" className={botao(tela === "desktop")} onClick={() => setTela("desktop")}>
            <Monitor className="h-3.5 w-3.5" /> Computador
          </button>
          <button type="button" className={botao(tela === "celular")} onClick={() => setTela("celular")}>
            <Smartphone className="h-3.5 w-3.5" /> Celular
          </button>
        </div>
        <div className="flex rounded-md border p-0.5">
          <button type="button" className={botao(!escuro)} onClick={() => setEscuro(false)}>
            <Sun className="h-3.5 w-3.5" /> Claro
          </button>
          <button type="button" className={botao(escuro)} onClick={() => setEscuro(true)}>
            <Moon className="h-3.5 w-3.5" /> Escuro
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground truncate">
        Assunto · <span className="text-foreground">{assunto || "(sem assunto)"}</span>
      </p>
      <div className={`rounded-md border p-2 flex justify-center ${escuro ? "bg-[#1f1f1f]" : "bg-[#eef1f5]"}`}>
        <iframe
          title="Prévia do e-mail"
          srcDoc={html}
          sandbox=""
          style={{ colorScheme: escuro ? "dark" : "light", width: tela === "celular" ? 375 : "100%" }}
          className={`h-[560px] max-w-full rounded ${tela === "celular" ? "border shadow-sm" : ""} ${escuro ? "bg-[#121212]" : "bg-white"}`}
        />
      </div>
      {escuro && (
        <p className="text-[11px] text-muted-foreground">
          Mostra o que o próprio e-mail define para o tema escuro. Gmail e Outlook ainda podem ajustar as cores sozinhos —
          confirme com um envio de teste no celular.
        </p>
      )}
    </div>
  );
}
