import { AppLayout } from "@/components/layout/AppLayout";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailCampanhasTab } from "@/components/disparos/EmailCampanhasTab";
import { EmailInteracoesTab } from "@/components/disparos/EmailInteracoesTab";

export default function DisparosEmail() {
  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Disparos Email</h1>
      <p className="text-sm text-muted-foreground">Gerencie disparos via Email</p>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="disparos_email">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 space-y-6">
          <Tabs defaultValue="envio">
            <TabsList>
              <TabsTrigger value="envio">Seleção e Disparo</TabsTrigger>
              <TabsTrigger value="interacao">Interações</TabsTrigger>
            </TabsList>
            <TabsContent value="envio" className="mt-4">
              <EmailCampanhasTab />
            </TabsContent>
            <TabsContent value="interacao" className="mt-4">
              <EmailInteracoesTab />
            </TabsContent>
          </Tabs>
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
