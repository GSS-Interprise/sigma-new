import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { DisparosCampanhasTab } from "@/components/disparos/DisparosCampanhasTab";
import { Megaphone } from "lucide-react";

export default function DisparosCampanhas() {
  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Megaphone className="h-6 w-6" />
        Campanhas
      </h1>
      <p className="text-sm text-muted-foreground">
        Crie e gerencie campanhas de disparo
      </p>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="disparos_zap">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          <DisparosCampanhasTab />
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
