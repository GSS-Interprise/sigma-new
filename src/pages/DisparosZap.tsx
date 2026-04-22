import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { DisparosCampanhasTab } from "@/components/disparos/DisparosCampanhasTab";
import { DisparosZapRanking } from "@/components/disparos/DisparosZapRanking";
import { DisparosNovoDialog } from "@/components/disparos/DisparosNovoDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";

export default function DisparosZap() {
  const [novoOpen, setNovoOpen] = useState(false);

  const headerActions = (
    <div className="flex items-center justify-between gap-3 w-full">
      <div>
        <h1 className="text-2xl font-bold">Disparos Zap</h1>
        <p className="text-sm text-muted-foreground">Gerencie disparos via WhatsApp</p>
      </div>
      <Button onClick={() => setNovoOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Adicionar Disparo
      </Button>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="disparos_zap">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 space-y-6">
          <DisparosZapRanking />
          <DisparosCampanhasTab />
        </div>
        <DisparosNovoDialog open={novoOpen} onOpenChange={setNovoOpen} />
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
