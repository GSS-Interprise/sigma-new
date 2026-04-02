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
      <div className="p-4 space-y-6">

        <Tabs defaultValue="kanban" className="w-full">
          <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-6' : 'grid-cols-5'}`}>
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

          <TabsContent value="kanban" className="space-y-6">
            <KanbanTab />
          </TabsContent>

          <TabsContent value="corpo-clinico" className="space-y-6">
            <CorpoClinicoTab />
          </TabsContent>

          <TabsContent value="leads" className="space-y-6">
            <LeadsTab />
          </TabsContent>

          <TabsContent value="ausencia" className="space-y-6">
            <AusenciaTab />
          </TabsContent>

          <TabsContent value="remuneracao" className="space-y-6">
            <RemuneracaoTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="migracao" className="space-y-6">
              <MigracaoMedicosAdmin />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
