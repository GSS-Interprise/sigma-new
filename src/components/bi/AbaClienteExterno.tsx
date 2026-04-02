import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Upload, FileWarning } from "lucide-react";
import { ClienteDashboard } from "./cliente-externo/ClienteDashboard";
import { ClienteImportacoes } from "./cliente-externo/ClienteImportacoes";
import { ClienteLogsImportacao } from "./cliente-externo/ClienteLogsImportacao";

interface AbaClienteExternoProps {
  clienteSlug: string;
  clienteNome: string;
}

export function AbaClienteExterno({ clienteSlug, clienteNome }: AbaClienteExternoProps) {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{clienteNome}</h2>
        <p className="text-sm text-muted-foreground">Painel de Business Intelligence</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="importacoes" className="gap-2">
            <Upload className="h-4 w-4" />
            Importações
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <FileWarning className="h-4 w-4" />
            Logs de Importação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <ClienteDashboard clienteSlug={clienteSlug} />
        </TabsContent>

        <TabsContent value="importacoes" className="mt-4">
          <ClienteImportacoes clienteSlug={clienteSlug} />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <ClienteLogsImportacao clienteSlug={clienteSlug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
