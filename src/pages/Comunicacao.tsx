import { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Hash, MessageSquare, Lock, Shield, Search, ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CanalList } from "@/components/comunicacao/CanalList";
import { MensagemArea } from "@/components/comunicacao/MensagemArea";
import { NovoCanalDialog } from "@/components/comunicacao/NovoCanalDialog";
import { NovaDMDialog } from "@/components/comunicacao/NovaDMDialog";
import { MonitoramentoAdm } from "@/components/comunicacao/MonitoramentoAdm";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
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
  const [sidebarSearch, setSidebarSearch] = useState("");
  const isMobile = useIsMobile();

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

  const onlineUsers = useOnlinePresence(currentUser?.id);

  // Busca de PESSOAS (na aba Privado) pra iniciar uma conversa nova — não só filtrar DMs existentes.
  const { data: pessoasBusca = [] } = useQuery({
    queryKey: ["comunicacao-buscar-pessoas", sidebarSearch, currentUser?.id],
    queryFn: async () => {
      if (!currentUser || sidebarSearch.trim().length < 2) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .ilike("nome_completo", `%${sidebarSearch.trim()}%`)
        .neq("id", currentUser.id)
        .eq("status", "ativo")
        .order("nome_completo")
        .limit(15);
      return data ?? [];
    },
    enabled: tabSidebar === "privado" && sidebarSearch.trim().length >= 2,
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

  // Auto-select first channel (só no desktop; no mobile começa na lista de canais)
  useEffect(() => {
    if (!isMobile && canais && canais.length > 0 && !canalSelecionado) {
      setCanalSelecionado(canais[0].id);
    }
  }, [canais, canalSelecionado, isMobile]);

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
    <div className="flex items-center gap-4 w-full min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-lg sm:text-2xl font-bold truncate">Comunicação</h1>
        <p className="text-sm text-muted-foreground hidden md:block">Mensagens e canais internos</p>
      </div>
      {isAdmin && (
        <Tabs value={vista} onValueChange={(v) => setVista(v as any)} className="ml-auto hidden md:block">
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
        <div className={cn(
          "flex-1 flex-col min-w-0 chat-card overflow-hidden",
          isMobile ? (canalSelecionado ? "flex" : "hidden") : "flex"
        )}>
          {isMobile && canalSelecionado && (
            <button
              onClick={() => setCanalSelecionado(null)}
              className="flex items-center gap-1.5 px-3 py-2 border-b text-sm font-medium shrink-0"
            >
              <ArrowLeft className="h-4 w-4" /> Canais
            </button>
          )}
          {canalSelecionado ? (
            <MensagemArea
              canalId={canalSelecionado}
              onOpenDM={openDMWithUser}
              targetMensagemId={mensagemAlvo}
              onTargetMensagemHandled={() => setMensagemAlvo(null)}
              onlineUsers={onlineUsers}
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

        {/* Sidebar de canais (direita) com abas Canais / Privado — no mobile vira tela cheia */}
        <div className={cn(
          "chat-card flex-col min-h-0 overflow-hidden",
          isMobile ? (canalSelecionado ? "hidden" : "flex w-full") : "flex w-80"
        )}>
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

            <div className="px-3 pt-3 pb-1 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder={tabSidebar === "canais" ? "Buscar canais..." : "Buscar pessoas..."}
                  className="h-8 pl-8 text-sm bg-[rgb(var(--chat-cream))]/40 border-[rgb(var(--chat-border))]"
                />
              </div>
            </div>

            <TabsContent
              value="canais"
              className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden py-2"
            >
              <CanalList
                canais={canaisGrupo}
                canalSelecionado={canalSelecionado}
                onSelectCanal={setCanalSelecionado}
                searchTerm={sidebarSearch}
                onlineUsers={onlineUsers}
              />
            </TabsContent>

            <TabsContent
              value="privado"
              className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden py-2"
            >
              {sidebarSearch.trim().length >= 2 && pessoasBusca.length > 0 && (
                <div className="px-2 pb-2 shrink-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">Iniciar conversa</p>
                  <div className="space-y-0.5">
                    {pessoasBusca.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { openDMWithUser(p.id); setSidebarSearch(""); }}
                        className="w-full text-left px-2 py-2 rounded-md hover:bg-accent text-sm flex items-center gap-2"
                      >
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold shrink-0">
                          {p.nome_completo?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <span className="truncate">{p.nome_completo}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <CanalList
                canais={canaisDireto}
                canalSelecionado={canalSelecionado}
                onSelectCanal={setCanalSelecionado}
                isAdmin={isAdmin}
                searchTerm={sidebarSearch}
                onlineUsers={onlineUsers}
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
