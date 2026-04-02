import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContratosTemporariosKanban } from "./ContratosTemporariosKanban";
import { CaptacaoPropostasTab } from "./CaptacaoPropostasTab";
import { LayoutGrid, FileText } from "lucide-react";

export function ContratosCaptacaoTab() {
  return (
    <Tabs defaultValue="kanban" className="space-y-4">
      <TabsList>
        <TabsTrigger value="kanban" className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          Kanban
        </TabsTrigger>
        <TabsTrigger value="propostas" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Propostas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="kanban">
        <ContratosTemporariosKanban />
      </TabsContent>

      <TabsContent value="propostas">
        <CaptacaoPropostasTab />
      </TabsContent>
    </Tabs>
  );
}
