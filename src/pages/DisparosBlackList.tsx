import { AppLayout } from "@/components/layout/AppLayout";
import { AbaBlackList } from "@/components/disparos/AbaBlackList";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";

export default function DisparosBlackList() {
  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Black List</h1>
      <p className="text-sm text-muted-foreground">Gerencie contatos bloqueados</p>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="blacklist">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 space-y-6">
          <AbaBlackList />
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
