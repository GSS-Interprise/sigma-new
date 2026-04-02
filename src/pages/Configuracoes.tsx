import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { UsuariosTab } from "@/components/configuracoes/UsuariosTab";
import { PermissoesTab } from "@/components/configuracoes/PermissoesTab";
import { HistoricoTab } from "@/components/configuracoes/HistoricoTab";
import { ChipsTab } from "@/components/configuracoes/ChipsTab";
import { WhatsAppTab } from "@/components/configuracoes/WhatsAppTab";
import { LogPermissoesTab } from "@/components/configuracoes/LogPermissoesTab";
import { ApiTokensTab } from "@/components/configuracoes/ApiTokensTab";
import { SetoresTab } from "@/components/configuracoes/SetoresTab";
import { MatrizPermissoesTab } from "@/components/configuracoes/MatrizPermissoesTab";
import { WebhookCentralTab } from "@/components/configuracoes/WebhookCentralTab";
import { usePermissions } from "@/hooks/usePermissions";

export default function Configuracoes() {
  const { isAdmin } = usePermissions();

  // Redirecionar não-admins
  if (!isAdmin) {
    return (
      <AppLayout>
        <Alert variant="destructive" className="m-8">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Acesso restrito a administradores. Você será redirecionado para a página inicial.
          </AlertDescription>
        </Alert>
        <Navigate to="/" replace />
      </AppLayout>
    );
  }

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Configurações</h1>
      <p className="text-sm text-muted-foreground">Gerencie usuários, permissões e histórico</p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4">

        <Tabs defaultValue="usuarios" className="w-full">
          <TabsList className="grid w-full grid-cols-10">
            <TabsTrigger value="usuarios">Usuários</TabsTrigger>
            <TabsTrigger value="permissoes">Permissões</TabsTrigger>
            <TabsTrigger value="matriz-permissoes">Matriz</TabsTrigger>
            <TabsTrigger value="log-permissoes">Log Permissões</TabsTrigger>
            <TabsTrigger value="setores">Setores</TabsTrigger>
            <TabsTrigger value="chips">Chips</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp API</TabsTrigger>
            <TabsTrigger value="api-tokens">API Tokens</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          
          <TabsContent value="usuarios" className="space-y-4">
            <UsuariosTab />
          </TabsContent>
          
          <TabsContent value="permissoes" className="space-y-4">
            <PermissoesTab />
          </TabsContent>

          <TabsContent value="matriz-permissoes" className="space-y-4">
            <MatrizPermissoesTab />
          </TabsContent>

          <TabsContent value="log-permissoes" className="space-y-4">
            <LogPermissoesTab />
          </TabsContent>

          <TabsContent value="setores" className="space-y-4">
            <SetoresTab />
          </TabsContent>
          
          <TabsContent value="chips" className="space-y-4">
            <ChipsTab />
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-4">
            <WhatsAppTab />
          </TabsContent>

          <TabsContent value="api-tokens" className="space-y-4">
            <ApiTokensTab />
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <WebhookCentralTab />
          </TabsContent>
          
          <TabsContent value="historico" className="space-y-4">
            <HistoricoTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
