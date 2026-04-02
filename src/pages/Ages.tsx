import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, FileText, BarChart3, UserPlus, PieChart, Building2, Kanban } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import AgesCadastroTab from "@/components/ages/AgesCadastroTab";
import AgesClientesTab from "@/components/ages/AgesClientesTab";
import AgesContratosTab from "@/components/ages/AgesContratosTab";
import AgesProducaoTab from "@/components/ages/AgesProducaoTab";
import AgesLeadsTab from "@/components/ages/AgesLeadsTab";
import AgesRelatoriosTab from "@/components/ages/AgesRelatoriosTab";
import AgesAcompanhamentoTab from "@/components/ages/AgesAcompanhamentoTab";

const Ages = () => {
  const [activeTab, setActiveTab] = useState("cadastro");

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold text-foreground">AGES</h1>
        <p className="text-muted-foreground text-sm">
          Gestão de profissionais e licitações AGES
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col p-6 pt-4">
        <TabsList className="w-fit">
          <TabsTrigger value="cadastro" className="gap-2">
            <Users className="h-4 w-4" />
            Profissionais
          </TabsTrigger>
          <TabsTrigger value="clientes" className="gap-2">
            <Building2 className="h-4 w-4" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="contratos" className="gap-2">
            <FileText className="h-4 w-4" />
            Contratos
          </TabsTrigger>
          <TabsTrigger value="producao" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Produção
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Leads
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-2">
            <PieChart className="h-4 w-4" />
            Relatórios
          </TabsTrigger>
          <TabsTrigger value="acompanhamento" className="gap-2">
            <Kanban className="h-4 w-4" />
            Acompanhamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro" className="flex-1 mt-4">
          <AgesCadastroTab />
        </TabsContent>

        <TabsContent value="clientes" className="flex-1 mt-4">
          <AgesClientesTab />
        </TabsContent>

        <TabsContent value="contratos" className="flex-1 mt-4">
          <AgesContratosTab />
        </TabsContent>

        <TabsContent value="producao" className="flex-1 mt-4">
          <AgesProducaoTab />
        </TabsContent>

        <TabsContent value="leads" className="flex-1 mt-4">
          <AgesLeadsTab />
        </TabsContent>

        <TabsContent value="relatorios" className="flex-1 mt-4">
          <AgesRelatoriosTab />
        </TabsContent>

        <TabsContent value="acompanhamento" className="flex-1 mt-4">
          <AgesAcompanhamentoTab />
        </TabsContent>
      </Tabs>
      </div>
    </AppLayout>
  );
};

export default Ages;
