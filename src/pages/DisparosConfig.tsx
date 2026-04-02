import { AppLayout } from "@/components/layout/AppLayout";
import { InstanciaConfigTab } from "@/components/configuracoes/InstanciaConfigTab";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { WebhookDisparosTab } from "@/components/disparos/WebhookDisparosTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Webhook } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

export default function DisparosConfig() {
  const { isAdmin, isLoadingRoles } = usePermissions();

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Configuração WhatsApp</h1>
      <p className="text-sm text-muted-foreground">Gerencie instâncias e webhooks</p>
    </div>
  );

  // Aguardar carregamento das permissões
  if (isLoadingRoles) {
    return (
      <AppLayout headerActions={headerActions}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <CaptacaoProtectedRoute permission="seigzaps_config">
      <AppLayout headerActions={headerActions}>
        <div className="p-4 space-y-6">
          <Tabs defaultValue="instancias">
            <TabsList>
              <TabsTrigger value="instancias" className="gap-2">
                <Settings className="h-4 w-4" />
                Instâncias
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="webhook-disparos" className="gap-2">
                  <Webhook className="h-4 w-4" />
                  Webhook Disparos
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="instancias" className="mt-4">
              <InstanciaConfigTab />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="webhook-disparos" className="mt-4">
                <WebhookDisparosTab />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}