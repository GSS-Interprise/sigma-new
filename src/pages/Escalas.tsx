import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Upload, Settings } from "lucide-react";
import { EscalasCalendarioTab } from "@/components/escalas/EscalasCalendarioTab";
import { EscalasImportTab } from "@/components/escalas/EscalasImportTab";
import { EscalasConfigTab } from "@/components/escalas/EscalasConfigTab";
import { usePermissions } from "@/hooks/usePermissions";

export default function Escalas() {
  const { isAdmin } = usePermissions();

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Escalas</h1>
        <p className="text-sm text-muted-foreground">
          Visualize escalas sincronizadas do Dr. Escala (read-only)
        </p>
      </div>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4">
        <Tabs defaultValue="calendario" className="space-y-4">
          <TabsList>
            <TabsTrigger value="calendario" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Calendário
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="importacao" className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Importação
                </TabsTrigger>
                <TabsTrigger value="configuracoes" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Configurações
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="calendario">
            <EscalasCalendarioTab />
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="importacao">
                <EscalasImportTab />
              </TabsContent>
              <TabsContent value="configuracoes">
                <EscalasConfigTab />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
