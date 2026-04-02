import { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus, Hash, MessageSquare, Lock } from "lucide-react";
import { CanalList } from "@/components/comunicacao/CanalList";
import { MensagemArea } from "@/components/comunicacao/MensagemArea";
import { NovoCanalDialog } from "@/components/comunicacao/NovoCanalDialog";
import { NovaDMDialog } from "@/components/comunicacao/NovaDMDialog";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useSearchParams } from "react-router-dom";

export default function Comunicacao() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [canalSelecionado, setCanalSelecionado] = useState<string | null>(null);
  const [novoCanalOpen, setNovoCanalOpen] = useState(false);
  const [novaDMOpen, setNovaDMOpen] = useState(false);
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  // Handle canal from URL query param
  useEffect(() => {
    const canalFromUrl = searchParams.get("canal");
    if (canalFromUrl) {
      setCanalSelecionado(canalFromUrl);
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
    queryKey: ["comunicacao-canais", isAdmin],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      if (isAdmin) {
        const { data, error } = await supabase
          .from("comunicacao_canais")
          .select("*")
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return data;
      }

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
    <div className="flex items-center gap-2">
      <h1 className="text-2xl font-bold">Comunicação</h1>
      <p className="text-sm text-muted-foreground">Mensagens e canais internos</p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="flex h-full">
        {/* Sidebar de canais */}
        <div className="w-64 border-r bg-card flex flex-col">
          {/* Seção Canais */}
          <div className="p-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Canais</h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => setNovoCanalOpen(true)}
              title="Novo canal"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <CanalList
              canais={canaisGrupo}
              canalSelecionado={canalSelecionado}
              onSelectCanal={setCanalSelecionado}
            />
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Seção Privado */}
          <div className="p-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Privado</h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => setNovaDMOpen(true)}
              title="Nova conversa privada"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <CanalList
              canais={canaisDireto}
              canalSelecionado={canalSelecionado}
              onSelectCanal={setCanalSelecionado}
              isAdmin={isAdmin}
            />
          </div>
        </div>

        {/* Área principal de mensagens */}
        <div className="flex-1 flex flex-col">
          {canalSelecionado ? (
            <MensagemArea 
              canalId={canalSelecionado} 
              onOpenDM={openDMWithUser}
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
