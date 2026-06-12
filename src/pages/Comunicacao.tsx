import { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Hash, MessageSquare, Lock, Shield } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CanalList } from "@/components/comunicacao/CanalList";
import { MensagemArea } from "@/components/comunicacao/MensagemArea";
import { NovoCanalDialog } from "@/components/comunicacao/NovoCanalDialog";
import { NovaDMDialog } from "@/components/comunicacao/NovaDMDialog";
import { MonitoramentoAdm } from "@/components/comunicacao/MonitoramentoAdm";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useSearchParams } from "react-router-dom";

export default function Comunicacao() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [canalSelecionado, setCanalSelecionado] = useState<string | null>(null);
  const [mensagemAlvo, setMensagemAlvo] = useState<string | null>(null);
  const [novoCanalOpen, setNovoCanalOpen] = useState(false);
  const [novaDMOpen, setNovaDMOpen] = useState(false);
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<"comunicacao" | "monitoramento">("comunicacao");
  const [tabSidebar, setTabSidebar] = useState<"canais" | "privado">("canais");

  // Handle canal from URL query param
  useEffect(() => {
    const canalFromUrl = searchParams.get("canal");
    const mensagemFromUrl = searchParams.get("mensagem");
    if (canalFromUrl) {
      setCanalSelecionado(canalFromUrl);
      if (mensagemFromUrl) setMensagemAlvo(mensagemFromUrl);
      setSearchParams({}, { replace: true }); // Clean URL
    }
  }, [searchParams, setSearchParams]);


  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: Infinity,
  });

  const { data: canais } = useQuery({
    queryKey: ["comunicacao-canais"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      // Sempre mostra apenas canais/DMs em que o usuário participa
      // (mesmo admin: o monitoramento de DMs alheias fica na aba "Monitoramento ADM")
      const { data, error } = await supabase
        .from("comunicacao_canais")
        .select(`*, comunicacao_participantes!inner(user_id, ultima_leitura)`)
        .eq("comunicacao_participantes.user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const canaisGrupo = useMemo(() => canais?.filter(c => c.tipo === "grupo") || [], [canais]);
  const canaisDireto = useMemo(() => canais?.filter(c => c.tipo === "direto") || [], [canais]);

  // Auto-select first channel
  useEffect(() => {
    if (canais && canais.length > 0 && !canalSelecionado) {
      setCanalSelecionado(canais[0].id);
    }
  }, [canais, canalSelecionado]);

  // Open or create DM with a user (used when clicking on a username in messages)
  const openDMWithUser = useCallback(async (targetUserId: string) => {
    if (!currentUser) return;

    // Search existing DM channels
    const { data: existingCanais } = await supabase
      .from("comunicacao_canais")
      .select(`id, comunicacao_participantes(user_id)`)
      .eq("tipo", "direto");

    if (existingCanais) {
      for (const canal of existingCanais) {
        const participantIds = (canal.comunicacao_participantes as any[]).map((p: any) => p.user_id);
        if (
          participantIds.length === 2 &&
          participantIds.includes(currentUser.id) &&
          participantIds.includes(targetUserId)
        ) {
          setCanalSelecionado(canal.id);
          return;
        }
      }
    }

    // If no existing DM, get user info and create one
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("nome_completo")
      .eq("id", targetUserId)
      .single();

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("nome_completo")
      .eq("id", currentUser.id)
      .single();

    const nomeCanal = `${myProfile?.nome_completo || "Eu"} & ${targetProfile?.nome_completo || "Usuário"}`;

    const { data: canal, error } = await supabase
      .from("comunicacao_canais")
      .insert({ nome: nomeCanal, tipo: "direto", criado_por: currentUser.id })
      .select()
      .single();

    if (error || !canal) return;

    await supabase
      .from("comunicacao_participantes")
      .insert([
        { canal_id: canal.id, user_id: currentUser.id },
        { canal_id: canal.id, user_id: targetUserId },
      ]);

    queryClient.invalidateQueries({ queryKey: ["comunicacao-canais"] });
    setCanalSelecionado(canal.id);
  }, [currentUser, queryClient]);

  const headerActions = (
    <div className="flex items-center gap-4 w-full">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Comunicação</h1>
        <p className="text-sm text-muted-foreground hidden md:block">Mensagens e canais internos</p>
      </div>
      {isAdmin && (
        <Tabs value={vista} onValueChange={(v) => setVista(v as any)} className="ml-auto">
          <TabsList>
            <TabsTrigger value="comunicacao" className="gap-1 data-[state=active]:bg-green-600 data-[state=active]:text-white">
              <MessageSquare className="h-3.5 w-3.5" /> Comunicação
            </TabsTrigger>
            <TabsTrigger value="monitoramento" className="gap-1 data-[state=active]:bg-green-600 data-[state=active]:text-white">
              <Shield className="h-3.5 w-3.5" /> Monitoramento ADM
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="chat-surface flex flex-col h-full min-h-0">
      {isAdmin && vista === "monitoramento" ? (
        <MonitoramentoAdm />
      ) : (
      <div className="flex h-full min-h-0 overflow-hidden gap-3 p-3">
        {/* Área principal de mensagens (esquerda) */}
        <div className="flex-1 flex flex-col min-w-0 chat-card overflow-hidden">
          {canalSelecionado ? (
            <MensagemArea 
              canalId={canalSelecionado} 
              onOpenDM={openDMWithUser}
              targetMensagemId={mensagemAlvo}
              onTargetMensagemHandled={() => setMensagemAlvo(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Hash className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Selecione um canal para começar</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar de canais (direita) com abas Canais / Privado */}
        <div className="w-80 chat-card flex flex-col min-h-0 overflow-hidden">
          <Tabs value={tabSidebar} onValueChange={(v) => setTabSidebar(v as any)} className="flex flex-col h-full min-h-0">
            <div className="flex items-center gap-2 p-3 chat-divider border-b shrink-0">
              <TabsList className="grid grid-cols-2 flex-1">
                <TabsTrigger value="canais" className="chat-tab gap-1.5 font-semibold">
                  <Hash className="h-3.5 w-3.5" /> Canais
                </TabsTrigger>
                <TabsTrigger value="privado" className="chat-tab gap-1.5 font-semibold">
                  <MessageSquare className="h-3.5 w-3.5" /> Privado
                </TabsTrigger>
              </TabsList>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 w-9 p-0 shrink-0 rounded-full hover:bg-[rgb(var(--chat-cream))]"
                onClick={() => (tabSidebar === "canais" ? setNovoCanalOpen(true) : setNovaDMOpen(true))}
                title={tabSidebar === "canais" ? "Novo canal" : "Nova conversa privada"}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <TabsContent
              value="canais"
              className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden py-2"
            >
              <CanalList
                canais={canaisGrupo}
                canalSelecionado={canalSelecionado}
                onSelectCanal={setCanalSelecionado}
              />
            </TabsContent>

            <TabsContent
              value="privado"
              className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden py-2"
            >
              <CanalList
                canais={canaisDireto}
                canalSelecionado={canalSelecionado}
                onSelectCanal={setCanalSelecionado}
                isAdmin={isAdmin}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      )}
      </div>

      <NovoCanalDialog
        open={novoCanalOpen}
        onOpenChange={setNovoCanalOpen}
      />
      <NovaDMDialog
        open={novaDMOpen}
        onOpenChange={setNovaDMOpen}
        onDMCreated={(canalId) => setCanalSelecionado(canalId)}
      />
    </AppLayout>
  );
}
