import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoKanban } from "@/components/disparos/CaptacaoKanban";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { LeadStatusManager } from "@/components/disparos/LeadStatusManager";

export default function DisparosAcompanhamento() {
  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Acompanhamento</h1>
        <p className="text-sm text-muted-foreground">Acompanhe o funil de captação</p>
      </div>
      <LeadStatusManager modulo="disparos" />
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="acompanhamento">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 h-[calc(100vh-80px)] overflow-hidden">
          <CaptacaoKanban />
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
