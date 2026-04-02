import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { DisparosCampanhasTab } from "@/components/disparos/DisparosCampanhasTab";
import { DisparosZapRanking } from "@/components/disparos/DisparosZapRanking";

export default function DisparosZap() {
  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Disparos Zap</h1>
      <p className="text-sm text-muted-foreground">Gerencie disparos via WhatsApp</p>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="disparos_zap">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 space-y-6">
          <DisparosZapRanking />
          <DisparosCampanhasTab />
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
