import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Share, Download, Plus } from "lucide-react";
import { isStandalone, isIOS } from "@/lib/webPush";

const DISMISS_KEY = "pwa-install-dismissed";

// Banner de instalação do app (PWA). iOS não tem prompt nativo → mostra a instrução
// (Compartilhar → Adicionar à Tela de Início). Android → botão de instalar de verdade.
// No iPhone, instalar é PRÉ-REQUISITO pra receber notificações push.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (isStandalone()) return; // já instalado
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    if (ios) {
      setShow(true); // iOS: sempre mostra a instrução (não existe prompt)
      return;
    }
    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [ios]);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="m-3 rounded-xl border bg-card shadow-lg p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold">Instalar o Sigma no celular</p>
          {ios ? (
            <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
              Toque em <Share className="inline h-3.5 w-3.5 align-text-bottom" /> <b>Compartilhar</b> na barra do Safari e depois em{" "}
              <b>Adicionar à Tela de Início</b> <Plus className="inline h-3 w-3 align-text-bottom" />. Assim o app abre rápido e você recebe as notificações das mensagens.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs mt-1">Acesso rápido e notificações das mensagens do canal.</p>
              {deferred && (
                <Button size="sm" className="mt-2 gap-1.5" onClick={install}>
                  <Download className="h-4 w-4" /> Instalar
                </Button>
              )}
            </>
          )}
        </div>
        <button onClick={dismiss} aria-label="Fechar" className="text-muted-foreground shrink-0 p-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
