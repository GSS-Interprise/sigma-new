import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CorpoClinicoTab } from "@/components/medicos/CorpoClinicoTab";
import { LeadsTab } from "@/components/medicos/LeadsTab";
import { AusenciaTab } from "@/components/medicos/AusenciaTab";
import { RemuneracaoTab } from "@/components/medicos/RemuneracaoTab";
import { KanbanTab } from "@/components/medicos/KanbanTab";
import { MigracaoMedicosAdmin } from "@/components/medicos/MigracaoMedicosAdmin";
import { Users, UserPlus, CalendarOff, DollarSign, Kanban, Database } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function Medicos() {
  const { user } = useAuth();
  
  // Check if user is admin
  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Médicos</h1>
      <p className="text-sm text-muted-foreground">Gerencie corpo clínico e leads</p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 flex-1 min-h-0 flex flex-col gap-4">

        <Tabs defaultValue="kanban" className="w-full flex-1 min-h-0 flex flex-col">
          <TabsList className={`grid w-full flex-shrink-0 ${isAdmin ? 'grid-cols-6' : 'grid-cols-5'}`}>
            <TabsTrigger value="kanban" className="gap-2">
              <Kanban className="h-4 w-4" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="corpo-clinico" className="gap-2">
              <Users className="h-4 w-4" />
              Corpo Clínico
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Leads
            </TabsTrigger>
            <TabsTrigger value="ausencia" className="gap-2">
              <CalendarOff className="h-4 w-4" />
              Ausência
            </TabsTrigger>
            <TabsTrigger value="remuneracao" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Remuneração
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="migracao" className="gap-2">
                <Database className="h-4 w-4" />
                Migração
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="kanban" className="flex-1 min-h-0 mt-4 data-[state=active]:flex flex-col">
            <KanbanTab />
          </TabsContent>

          <TabsContent value="corpo-clinico" className="flex-1 min-h-0 mt-4 data-[state=active]:flex flex-col overflow-auto">
            <CorpoClinicoTab />
          </TabsContent>

          <TabsContent value="leads" className="flex-1 min-h-0 mt-4 data-[state=active]:flex flex-col">
            <LeadsTab />
          </TabsContent>

          <TabsContent value="ausencia" className="flex-1 min-h-0 mt-4 data-[state=active]:flex flex-col overflow-auto">
            <AusenciaTab />
          </TabsContent>

          <TabsContent value="remuneracao" className="flex-1 min-h-0 mt-4 data-[state=active]:flex flex-col overflow-auto">
            <RemuneracaoTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="migracao" className="flex-1 min-h-0 mt-4 data-[state=active]:flex flex-col overflow-auto">
              <MigracaoMedicosAdmin />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
