import { AppLayout } from "@/components/layout/AppLayout";
import { ContratosCaptacaoTab } from "@/components/disparos/ContratosCaptacaoTab";
import { FileText } from "lucide-react";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";

export default function DisparosContratos() {
  const headerActions = (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-primary/10 rounded-lg">
        <FileText className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Contratos de Captação</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie contratos, serviços e propostas de captação
        </p>
      </div>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="contratos_servicos">
      <AppLayout headerActions={headerActions}>
        <div className="p-4">
          <ContratosCaptacaoTab />
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
