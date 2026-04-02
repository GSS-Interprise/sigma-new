import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutGrid, Plus, Shield, Mail } from "lucide-react";
import { MeuPainelTab } from "@/components/suporte/MeuPainelTab";
import { NovoTicketForm } from "@/components/suporte/NovoTicketForm";
import { AdministracaoTab } from "@/components/suporte/AdministracaoTab";
import { AbaEmails } from "@/components/suporte/AbaEmails";
import { TicketDetailDialog } from "@/components/suporte/TicketDetailDialog";
import { usePermissions } from "@/hooks/usePermissions";

export default function Suporte() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("painel");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const { isAdmin, isLoadingRoles, userRoles } = usePermissions();
  const isExterno = userRoles?.some(r => r.role === 'externos');
  const hasFullAccess = isAdmin || isExterno;

  // Auto-open ticket from URL query param (e.g. /suporte?ticket=abc123)
  useEffect(() => {
    const ticketId = searchParams.get('ticket');
    if (ticketId) {
      setSelectedTicketId(ticketId);
      setIsDetailDialogOpen(true);
      // Clean the param so refreshing doesn't reopen
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Aguardar carregamento das permissões para evitar tela branca
  if (isLoadingRoles) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </AppLayout>
    );
  }

  const handleTicketCreated = (ticketId: string) => {
    setActiveTab("painel");
  };

  const handleTicketClick = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setIsDetailDialogOpen(true);
  };

  const headerActions = (
    <div>
      <h1 className="text-2xl font-bold">Solicitação de Suporte</h1>
      <p className="text-sm text-muted-foreground">Gerencie suas solicitações de suporte</p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="flex flex-col h-full min-h-0 space-y-4">

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 space-y-4">
          <TabsList>
            <TabsTrigger value="painel" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              Meu Painel
            </TabsTrigger>
            <TabsTrigger value="nova" className="gap-2">
              <Plus className="h-4 w-4" />
              Solicitação de Suporte
            </TabsTrigger>
            {hasFullAccess && (
              <>
                <TabsTrigger value="admin" className="gap-2">
                  <Shield className="h-4 w-4" />
                  Administração de Tickets
                </TabsTrigger>
                <TabsTrigger value="emails" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Emails
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="painel" className="space-y-4">
            <MeuPainelTab />
          </TabsContent>

          <TabsContent value="nova" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Novo Ticket de Suporte</CardTitle>
              </CardHeader>
              <CardContent>
                <NovoTicketForm onSuccess={handleTicketCreated} />
              </CardContent>
            </Card>
          </TabsContent>

          {hasFullAccess && (
            <>
              <TabsContent value="admin" className="flex-1 min-h-0">
                <AdministracaoTab onTicketClick={handleTicketClick} />
              </TabsContent>
              
              <TabsContent value="emails" className="flex-1 min-h-0">
                <AbaEmails />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      <TicketDetailDialog
        ticketId={selectedTicketId}
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
      />
    </AppLayout>
  );
}