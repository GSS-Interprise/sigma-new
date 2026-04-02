import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/usePermissions";
import { Navigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Componentes simplificados do novo módulo
import { MarketingDigitalTab } from "@/components/marketing/MarketingDigitalTab";
import { EventosSimplificadoTab } from "@/components/marketing/EventosSimplificadoTab";
import { TrafegoPagoSimplificadoTab } from "@/components/marketing/TrafegoPagoSimplificadoTab";
import { EndomarketingSimplificadoTab } from "@/components/marketing/EndomarketingSimplificadoTab";
import { BibliotecaSimplificadaTab } from "@/components/marketing/BibliotecaSimplificadaTab";
import { PlanejamentoSimplificadoTab } from "@/components/marketing/PlanejamentoSimplificadoTab";
import { BancoIdeiasSimplificadoTab } from "@/components/marketing/BancoIdeiasSimplificadoTab";
import { RelatoriosSimplificadoTab } from "@/components/marketing/RelatoriosSimplificadoTab";
import { PrioridadesKanbanTab } from "@/components/marketing/PrioridadesKanbanTab";

export default function Marketing() {
  const { canView, isAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useState("digital");

  if (!isAdmin && !canView('marketing')) {
    return (
      <AppLayout>
        <Alert variant="destructive" className="m-8">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para acessar este módulo.
          </AlertDescription>
        </Alert>
        <Navigate to="/" replace />
      </AppLayout>
    );
  }

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Marketing</h1>
      <p className="text-sm text-muted-foreground">Gerencie campanhas, conteúdos e eventos</p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList className="inline-flex w-max">
              <TabsTrigger value="digital">Marketing Digital</TabsTrigger>
              <TabsTrigger value="eventos">Eventos</TabsTrigger>
              <TabsTrigger value="trafego">Tráfego Pago</TabsTrigger>
              <TabsTrigger value="endomarketing">Endomarketing</TabsTrigger>
              <TabsTrigger value="biblioteca">Biblioteca</TabsTrigger>
              <TabsTrigger value="planejamento">Planejamento</TabsTrigger>
              <TabsTrigger value="ideias">Banco de Ideias</TabsTrigger>
              <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
              <TabsTrigger value="prioridades">Prioridades</TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <TabsContent value="digital" className="mt-6">
            <MarketingDigitalTab />
          </TabsContent>

          <TabsContent value="eventos" className="mt-6">
            <EventosSimplificadoTab />
          </TabsContent>

          <TabsContent value="trafego" className="mt-6">
            <TrafegoPagoSimplificadoTab />
          </TabsContent>

          <TabsContent value="endomarketing" className="mt-6">
            <EndomarketingSimplificadoTab />
          </TabsContent>

          <TabsContent value="biblioteca" className="mt-6">
            <BibliotecaSimplificadaTab />
          </TabsContent>

          <TabsContent value="planejamento" className="mt-6">
            <PlanejamentoSimplificadoTab />
          </TabsContent>

          <TabsContent value="ideias" className="mt-6">
            <BancoIdeiasSimplificadoTab />
          </TabsContent>

          <TabsContent value="relatorios" className="mt-6">
            <RelatoriosSimplificadoTab />
          </TabsContent>

          <TabsContent value="prioridades" className="mt-6">
            <PrioridadesKanbanTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
