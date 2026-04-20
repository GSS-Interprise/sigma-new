import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SigZapConversasColumn } from "@/components/sigzap/SigZapConversasColumn";
import { SigZapMinhasConversasColumn } from "@/components/sigzap/SigZapMinhasConversasColumn";
import { SigZapChatColumn } from "@/components/sigzap/SigZapChatColumn";
import { SigZapDialog } from "@/components/sigzap/SigZapDialog";
import { SigZapTransferOverlay } from "@/components/sigzap/SigZapTransferOverlay";
import { Button } from "@/components/ui/button";
import { Settings, MessageCircle, Wrench, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { CaptacaoProtectedRoute } from "@/components/auth/CaptacaoProtectedRoute";
import { DisparoManualHeader } from "@/components/sigzap/manual/DisparoManualHeader";
import { DisparoManualLeadsColumn } from "@/components/sigzap/manual/DisparoManualLeadsColumn";
import { DisparoManualLeadPanel } from "@/components/sigzap/manual/DisparoManualLeadPanel";

const STORAGE_KEY = 'sigzap-selected-instances';

export default function DisparosSigZap() {
  const queryClient = useQueryClient();
  const [selectedConversaId, setSelectedConversaId] = useState<string | null>(null);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>(() => {
    // Load from localStorage on mount
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fixingDuplicates, setFixingDuplicates] = useState(false);
  const [draggingConversaId, setDraggingConversaId] = useState<string | null>(null);
  const [showTransferOverlay, setShowTransferOverlay] = useState(false);
  const [mode, setMode] = useState<"inbox" | "manual">("inbox");
  const [dmCampanhaId, setDmCampanhaId] = useState<string | null>(null);
  const [dmPropostaId, setDmPropostaId] = useState<string | null>(null);
  const [dmLeadId, setDmLeadId] = useState<string | null>(null);

  const handleTransfer = (conversaId: string) => {
    setDraggingConversaId(conversaId);
    setShowTransferOverlay(true);
  };

  const handleOpenChat = async (phone: string, instanceId: string) => {
    try {
      const digits = phone.replace(/\D/g, "");
      const normalizedPhone = digits.startsWith("55") ? digits : `55${digits}`;

      const { data: chip } = await supabase.from("chips").select("instance_name").eq("id", instanceId).single();
      if (!chip?.instance_name) { toast.error("Instância não encontrada"); return; }

      const { data: inst } = await supabase.from("sigzap_instances").select("id, name").eq("name", chip.instance_name).single();
      if (!inst) { toast.error("Instância SigZap não encontrada"); return; }

      const contactJid = `${normalizedPhone}@s.whatsapp.net`;
      const { data: u } = await supabase.auth.getUser();

      let { data: existingContact } = await supabase.from("sigzap_contacts").select("id").eq("instance_id", inst.id).eq("contact_jid", contactJid).maybeSingle();
      let contactId: string;
      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const { data: newContact, error } = await supabase.from("sigzap_contacts").insert({ instance_id: inst.id, contact_jid: contactJid, contact_phone: normalizedPhone }).select("id").single();
        if (error) throw error;
        contactId = newContact.id;
      }

      let { data: existingConv } = await supabase.from("sigzap_conversations").select("id").eq("instance_id", inst.id).eq("contact_id", contactId).maybeSingle();
      if (existingConv) {
        await supabase.from("sigzap_conversations").update({ assigned_user_id: u.user?.id, status: "in_progress", lead_id: dmLeadId }).eq("id", existingConv.id);
        setSelectedConversaId(existingConv.id);
      } else {
        const { data: newConv, error } = await supabase.from("sigzap_conversations").insert({ instance_id: inst.id, contact_id: contactId, assigned_user_id: u.user?.id, status: "in_progress", lead_id: dmLeadId }).select("id").single();
        if (error) throw error;
        setSelectedConversaId(newConv.id);
      }

      queryClient.invalidateQueries({ queryKey: ["sigzap-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["sigzap-chat-conversa"] });
      queryClient.invalidateQueries({ queryKey: ["sigzap-linked-lead"] });
    } catch (err: any) {
      toast.error("Erro ao abrir chat: " + err.message);
    }
  };

  // Persist instance selection
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedInstanceIds));
  }, [selectedInstanceIds]);

  // Listen for sigzap-open-conversa events from phone links
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.conversaId) {
        setSelectedConversaId(detail.conversaId);
      }
    };
    window.addEventListener('sigzap-open-conversa', handler);
    return () => window.removeEventListener('sigzap-open-conversa', handler);
  }, []);

  const handleFixDuplicates = async () => {
    try {
      setFixingDuplicates(true);
      const { data, error } = await supabase.functions.invoke("sigzap-dedupe-conversations", {
        body: {
          instance_ids: selectedInstanceIds,
          dry_run: false,
        },
      });

      if (error) throw error;

      // Evita ficar com conversa selecionada que pode ter sido removida
      setSelectedConversaId(null);

      await queryClient.invalidateQueries({ queryKey: ["sigzap-conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["sigzap-minhas-conversas"] });
      await queryClient.invalidateQueries({ queryKey: ["sigzap-chat-conversa"] });

      toast.success(
        `Duplicidades corrigidas: ${data?.merged_groups ?? 0} grupos (msgs: ${data?.moved_messages ?? 0})`,
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao corrigir duplicidades");
    } finally {
      setFixingDuplicates(false);
    }
  };

  const inboxHeaderActions = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <MessageCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">SIG Zap</h1>
          <p className="text-sm text-muted-foreground">Atendimento WhatsApp</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setMode("manual")}
          variant="outline"
          size="sm"
        >
          <Send className="h-4 w-4 mr-2" />
          Disparo Manual
        </Button>

        <Button
          onClick={handleFixDuplicates}
          variant="outline"
          size="sm"
          disabled={fixingDuplicates || selectedInstanceIds.length === 0}
          title={selectedInstanceIds.length === 0 ? "Selecione instâncias" : "Corrigir duplicidades"}
        >
          {fixingDuplicates ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Wrench className="h-4 w-4 mr-2" />
          )}
          Corrigir duplicados
        </Button>

        <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Configurações
        </Button>
      </div>
    </div>
  );

  const manualHeaderActions = (
    <DisparoManualHeader
      campanhaId={dmCampanhaId}
      propostaId={dmPropostaId}
      onChangeCampanha={setDmCampanhaId}
      onChangeProposta={(id) => {
        setDmPropostaId(id);
        setDmLeadId(null);
      }}
      onBack={() => {
        setMode("inbox");
        setDmLeadId(null);
      }}
    />
  );

  const headerActions = mode === "manual" ? manualHeaderActions : inboxHeaderActions;

  return (
    <CaptacaoProtectedRoute permission="seigzaps_config">
      <AppLayout headerActions={headerActions} hideFooter>
        {/* Container principal - 3 colunas */}
        <div 
          className="grid bg-card overflow-hidden flex-1"
          style={{ 
            gridTemplateColumns: '1fr 1fr 2fr',
          }}
        >
          {mode === "manual" ? (
            <>
              <DisparoManualLeadsColumn
                campanhaPropostaId={dmPropostaId}
                selectedLeadId={dmLeadId}
                onSelectLead={setDmLeadId}
              />
              <DisparoManualLeadPanel
                campanhaPropostaId={dmPropostaId}
                leadId={dmLeadId}
                onOpenChat={handleOpenChat}
              />
              <SigZapChatColumn conversaId={selectedConversaId} />
            </>
          ) : (
            <>
          {/* Coluna 1: Conversas LIVRES */}
          <SigZapConversasColumn
            selectedConversaId={selectedConversaId}
            onSelectConversa={setSelectedConversaId}
            selectedInstanceIds={selectedInstanceIds}
            onSelectInstances={setSelectedInstanceIds}
            onDragStart={(id) => {
              setDraggingConversaId(id);
              setShowTransferOverlay(true);
            }}
            onDragEnd={() => {
              setTimeout(() => {
                if (!draggingConversaId) return;
                setShowTransferOverlay(false);
                setDraggingConversaId(null);
              }, 200);
            }}
            onTransfer={handleTransfer}
          />

          {/* Coluna 2: MINHAS Conversas */}
          <SigZapMinhasConversasColumn
            selectedConversaId={selectedConversaId}
            onSelectConversa={setSelectedConversaId}
            selectedInstanceIds={selectedInstanceIds}
            onDragStart={(id) => {
              setDraggingConversaId(id);
              setShowTransferOverlay(true);
            }}
            onDragEnd={() => {
              setTimeout(() => {
                if (!draggingConversaId) return;
                setShowTransferOverlay(false);
                setDraggingConversaId(null);
              }, 200);
            }}
            onTransfer={handleTransfer}
          />

          {/* Coluna 3: Chat */}
          <SigZapChatColumn conversaId={selectedConversaId} />
            </>
          )}
        </div>
        
        <SigZapTransferOverlay
          visible={showTransferOverlay}
          draggingConversaId={draggingConversaId}
          onClose={() => {
            setShowTransferOverlay(false);
            setDraggingConversaId(null);
          }}
          onTransferComplete={() => {
            setShowTransferOverlay(false);
            setDraggingConversaId(null);
          }}
        />

        <SigZapDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </AppLayout>
    </CaptacaoProtectedRoute>
  );
}
