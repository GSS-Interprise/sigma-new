import { AppLayout } from "@/components/layout/AppLayout";
import { LeadsTab } from "@/components/medicos/LeadsTab";
import { LeadImportHistoryTab } from "@/components/medicos/LeadImportHistoryTab";
import { ImportMonitorTab } from "@/components/medicos/ImportMonitorTab";
import { AbaBloqueioTemporario } from "@/components/disparos/AbaBloqueioTemporario";
import { ListasDisparoTab } from "@/components/disparos/ListasDisparoTab";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, FileUp, Activity, ShieldAlert, ListChecks } from "lucide-react";

export default function DisparosLeads() {
  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Leads</h1>
      <p className="text-sm text-muted-foreground">Gerencie seus leads de médicos</p>
    </div>
  );

  return (
    <CaptacaoProtectedRoute permission="leads">
      <AppLayout headerActions={headerActions}>
        {/* Wrapper que ocupa o espaço disponível com scroll interno */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Tabs defaultValue="leads" className="w-full flex-1 min-h-0 flex flex-col">
            <div className="px-4 pt-4">
              <TabsList>
                <TabsTrigger value="leads" className="gap-2">
                  <Users className="h-4 w-4" />
                  Leads
                </TabsTrigger>
                <TabsTrigger value="listas" className="gap-2">
                  <ListChecks className="h-4 w-4" />
                  Lista para disparo
                </TabsTrigger>
                <TabsTrigger value="imports" className="gap-2">
                  <FileUp className="h-4 w-4" />
                  Imports
                </TabsTrigger>
                <TabsTrigger value="monitor" className="gap-2">
                  <Activity className="h-4 w-4" />
                  Monitor
                </TabsTrigger>
                <TabsTrigger value="bloqueio" className="gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  Bloqueio Temporário
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Aba Leads — usa flex-1 para ocupar espaço disponível */}
            <TabsContent value="leads" className="flex-1 min-h-0 flex flex-col mt-0 pt-4 px-4 data-[state=inactive]:hidden">
              <LeadsTab />
            </TabsContent>

            <TabsContent value="listas" className="flex-1 min-h-0 overflow-auto mt-0 pt-4 px-4 pb-6 data-[state=inactive]:hidden">
              <ListasDisparoTab />
            </TabsContent>

            {/* Abas com scroll normal */}
            <TabsContent value="imports" className="flex-1 min-h-0 overflow-auto mt-0 pt-4 px-4 pb-6 data-[state=inactive]:hidden">
              <LeadImportHistoryTab />
            </TabsContent>

            <TabsContent value="monitor" className="flex-1 min-h-0 overflow-y-auto mt-0 pt-4 px-4 pb-6 data-[state=inactive]:hidden">
              <ImportMonitorTab />
            </TabsContent>

            <TabsContent value="bloqueio" className="flex-1 min-h-0 overflow-auto mt-0 pt-4 px-4 pb-6 data-[state=inactive]:hidden">
              <AbaBloqueioTemporario />
            </TabsContent>
          </Tabs>
        </div>
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
