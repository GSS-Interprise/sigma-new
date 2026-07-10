import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Bell } from "lucide-react";
import { toast } from "sonner";
import { subscribeToPush, pushEligible, isPushSubscribed } from "@/lib/webPush";

const DISMISS_KEY = "notif-prompt-dismissed";

// Banner proativo pra ATIVAR notificações push (desktop + mobile). Os navegadores
// modernos só abrem o pop-up nativo de permissão APÓS um clique do usuário — este
// banner é esse gatilho visível, pra ninguém precisar caçar o botão no sino.
export function NotificacaoPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!pushEligible()) return;                                  // iOS não-instalado → InstallPrompt cuida
      if (localStorage.getItem(DISMISS_KEY) === "1") return;        // já dispensou
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "denied") return;             // bloqueado no navegador → não insiste
      if (Notification.permission === "granted" && (await isPushSubscribed())) return; // já ativo neste dispositivo
      setShow(true);
    })();
  }, []);

  if (!show) return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "1"); setShow(false); };

  const ativar = async () => {
    setBusy(true);
    const r = await subscribeToPush();   // dispara o pop-up nativo + cria a inscrição
    setBusy(false);
    if (r.ok) { toast.success("Notificações ativadas! Você vai receber os avisos aqui."); setShow(false); }
    else toast.error(r.error || "Não foi possível ativar as notificações.");
  };

  return (
    <div className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto sm:w-[360px] pb-[env(safe-area-inset-bottom)]">
      <div className="rounded-xl border bg-card shadow-lg p-3 flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold">Ativar notificações</p>
          <p className="text-muted-foreground text-xs mt-0.5">Receba os avisos das mensagens e do financeiro, mesmo com o Sigma fechado.</p>
          <Button size="sm" className="mt-2 gap-1.5" onClick={ativar} disabled={busy}>
            <Bell className="h-4 w-4" /> {busy ? "Ativando..." : "Ativar notificações"}
          </Button>
        </div>
        <button onClick={dismiss} aria-label="Fechar" className="text-muted-foreground shrink-0 p-0.5"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
