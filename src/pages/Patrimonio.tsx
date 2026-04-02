import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, FolderOpen, BarChart3 } from "lucide-react";
import { HomeTab } from "@/components/patrimonio/HomeTab";
import { CadastroTab } from "@/components/patrimonio/CadastroTab";
import { RelatoriosTab } from "@/components/patrimonio/RelatoriosTab";

export default function Patrimonio() {
  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Patrimônio</h1>
      <p className="text-sm text-muted-foreground">Gestão e controle de bens patrimoniais</p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4">

        <Tabs defaultValue="home" className="space-y-6">
          <TabsList>
            <TabsTrigger value="home">
              <Home className="mr-2 h-4 w-4" />
              Home
            </TabsTrigger>
            <TabsTrigger value="cadastro">
              <FolderOpen className="mr-2 h-4 w-4" />
              Cadastro
            </TabsTrigger>
            <TabsTrigger value="relatorios">
              <BarChart3 className="mr-2 h-4 w-4" />
              Relatórios
            </TabsTrigger>
          </TabsList>

          <TabsContent value="home">
            <HomeTab />
          </TabsContent>

          <TabsContent value="cadastro">
            <CadastroTab />
          </TabsContent>

          <TabsContent value="relatorios">
            <RelatoriosTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
