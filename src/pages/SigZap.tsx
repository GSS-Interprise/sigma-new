import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { MessageCircle, Settings } from "lucide-react";
import { SigZapDialog } from "@/components/sigzap/SigZapDialog";
import { ConversasList } from "@/components/sigzap/ConversasList";
import { MensagensView } from "@/components/sigzap/MensagensView";
import { useQueryClient } from "@tanstack/react-query";

export default function SigZap() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedConversaId, setSelectedConversaId] = useState<string | undefined>();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: /sigzap?conversa=<id>
  useEffect(() => {
    const conv = searchParams.get("conversa");
    if (conv) {
      setSelectedConversaId(conv);
      searchParams.delete("conversa");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleTestSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['conversas'] });
    if (selectedConversaId) {
      queryClient.invalidateQueries({ queryKey: ['mensagens', selectedConversaId] });
    }
  };

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <MessageCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">SigZap</h1>
          <p className="text-sm text-muted-foreground">Integração WhatsApp</p>
        </div>
      </div>
      
      <Button
        variant="outline"
        size="icon"
        onClick={() => setDialogOpen(true)}
        className="h-9 w-9"
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-6">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <h3 className="text-sm font-semibold mb-4">Conversas</h3>
            <ConversasList
              onSelectConversa={setSelectedConversaId}
              selectedConversaId={selectedConversaId}
            />
          </div>

          <div className="lg:col-span-2">
            {selectedConversaId ? (
              <MensagensView conversaId={selectedConversaId} />
            ) : (
              <div className="h-[600px] flex items-center justify-center border-2 border-dashed rounded-lg bg-card">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Selecione uma conversa para ver as mensagens
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <SigZapDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        onTestSuccess={handleTestSuccess}
      />
    </AppLayout>
  );
}
