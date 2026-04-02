import { AppLayout } from "@/components/layout/AppLayout";
import { useState } from "react";
import { Eye, ShieldAlert } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { MonitorCaptadoresList } from "@/components/monitor/MonitorCaptadoresList";
import { MonitorConversasList } from "@/components/monitor/MonitorConversasList";
import { MonitorChatColumn } from "@/components/monitor/MonitorChatColumn";

export default function DisparosMonitor() {
  const { isAdmin, isLoadingRoles } = usePermissions();
  const [selectedCaptadorId, setSelectedCaptadorId] = useState<string | null>(null);
  const [selectedConversaId, setSelectedConversaId] = useState<string | null>(null);

  const headerActions = (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Eye className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Monitor</h1>
        <p className="text-sm text-muted-foreground">Supervisão de captadores</p>
      </div>
    </div>
  );

  if (isLoadingRoles) {
    return (
      <AppLayout headerActions={headerActions}>
        <div className="p-4 flex items-center justify-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout headerActions={headerActions}>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <ShieldAlert className="h-16 w-16 text-destructive/50" />
          <h2 className="text-xl font-semibold">Acesso Restrito</h2>
          <p className="text-muted-foreground">Apenas administradores podem acessar o Monitor.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout headerActions={headerActions} hideFooter>
      <div
        className="grid bg-card overflow-hidden flex-1"
        style={{ gridTemplateColumns: "250px 1fr 2fr" }}
      >
        {/* Col 1: Captadores */}
        <MonitorCaptadoresList
          selectedCaptadorId={selectedCaptadorId}
          onSelectCaptador={(id) => {
            setSelectedCaptadorId(id);
            setSelectedConversaId(null);
          }}
        />

        {/* Col 2: Conversas do captador */}
        <MonitorConversasList
          captadorId={selectedCaptadorId}
          selectedConversaId={selectedConversaId}
          onSelectConversa={setSelectedConversaId}
        />

        {/* Col 3: Chat (read + respond without assigning) */}
        <MonitorChatColumn conversaId={selectedConversaId} />
      </div>
    </AppLayout>
  );
}
