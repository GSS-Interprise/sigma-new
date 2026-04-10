import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { RegiaoInteresseModule } from "@/components/disparos/RegiaoInteresseModule";
import { MapPin } from "lucide-react";

export default function DisparosRegiaoInteresse() {
  const headerActions = (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <MapPin className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Banco de Interesse</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie leads encaminhados por região de interesse
        </p>
      </div>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="leads">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 space-y-4">
          <RegiaoInteresseModule />
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
