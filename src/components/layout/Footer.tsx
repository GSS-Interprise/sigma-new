import type { ReactNode } from "react";

/**
 * Rodapé do AppLayout. `acao` = o robô do Sigma no canto direito: o rodapé fica sempre na base da tela (o conteúdo rola
 * no <main> acima), então o robô parece flutuar no canto inferior direito sem nunca cobrir botão de tela.
 * `semTexto` = página que esconde o rodapé (conversas) mas precisa do robô: sobra só a faixa com ele.
 */
export function Footer({ acao, semTexto }: { acao?: ReactNode; semTexto?: boolean }) {
  return (
    <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm mt-auto flex-shrink-0">
      <div className={acao ? "flex min-h-12 items-center justify-end gap-4 px-4 py-1 md:px-6" : "container mx-auto px-6 py-3"}>
        <div className="flex items-center justify-end text-right">
          {!semTexto && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-primary">Sistema Integrado de Gestão Médica</span>
              {' '}&mdash; GSS &copy; {new Date().getFullYear()}
            </p>
          )}
        </div>
        {acao}
      </div>
    </footer>
  );
}
