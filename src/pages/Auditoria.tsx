import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditoriaOverview } from "@/components/auditoria/AuditoriaOverview";
import { AuditoriaPermissoes } from "@/components/auditoria/AuditoriaPermissoes";
import { AuditoriaDocumentos } from "@/components/auditoria/AuditoriaDocumentos";
import { AuditoriaRadiologia } from "@/components/auditoria/AuditoriaRadiologia";
import { AuditoriaLicitacoes } from "@/components/auditoria/AuditoriaLicitacoes";
import { AuditoriaDisparos } from "@/components/auditoria/AuditoriaDisparos";
import { AuditoriaLogsGerais } from "@/components/auditoria/AuditoriaLogsGerais";
import { Shield, FileText, Activity, Gavel, Send, Database } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Navigate } from "react-router-dom";

export default function Auditoria() {
  const [activeTab, setActiveTab] = useState("overview");
  const { isAdmin } = usePermissions();

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Sistema de Auditoria</h1>
          <p className="text-muted-foreground">
            Acompanhe todas as ações realizadas no sistema com rastreabilidade completa
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="overview">
              <Activity className="h-4 w-4 mr-2" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="logs-gerais">
              <Database className="h-4 w-4 mr-2" />
              Logs Gerais
            </TabsTrigger>
            <TabsTrigger value="permissoes">
              <Shield className="h-4 w-4 mr-2" />
              Permissões
            </TabsTrigger>
            <TabsTrigger value="documentos">
              <FileText className="h-4 w-4 mr-2" />
              Documentos
            </TabsTrigger>
            <TabsTrigger value="radiologia">
              <Activity className="h-4 w-4 mr-2" />
              Radiologia
            </TabsTrigger>
            <TabsTrigger value="licitacoes">
              <Gavel className="h-4 w-4 mr-2" />
              Licitações
            </TabsTrigger>
            <TabsTrigger value="disparos">
              <Send className="h-4 w-4 mr-2" />
              Disparos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <AuditoriaOverview />
          </TabsContent>

          <TabsContent value="logs-gerais" className="space-y-4">
            <AuditoriaLogsGerais />
          </TabsContent>

          <TabsContent value="permissoes" className="space-y-4">
            <AuditoriaPermissoes />
          </TabsContent>

          <TabsContent value="documentos" className="space-y-4">
            <AuditoriaDocumentos />
          </TabsContent>

          <TabsContent value="radiologia" className="space-y-4">
            <AuditoriaRadiologia />
          </TabsContent>

          <TabsContent value="licitacoes" className="space-y-4">
            <AuditoriaLicitacoes />
          </TabsContent>

          <TabsContent value="disparos" className="space-y-4">
            <AuditoriaDisparos />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
