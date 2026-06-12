import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, MessageSquare, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { MensagemArea } from "./MensagemArea";
import { Input } from "@/components/ui/input";

/**
 * Monitoramento ADM
 * Lista TODAS as conversas privadas (DMs) agrupadas por usuário,
 * permitindo ao admin visualizar (sem participar) as conversas alheias.
 */
export function MonitoramentoAdm() {
  const [busca, setBusca] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [canalSelecionado, setCanalSelecionado] = useState<string | null>(null);

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: Infinity,
  });

  // Todas as DMs + participantes + profiles
  const { data: dms, isLoading } = useQuery({
    queryKey: ["adm-monitoramento-dms"],
    queryFn: async () => {
      const { data: canais, error } = await supabase
        .from("comunicacao_canais")
        .select("id, nome, updated_at, tipo, comunicacao_participantes(user_id)")
        .eq("tipo", "direto")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const allUserIds = Array.from(
        new Set(
          (canais || []).flatMap((c: any) =>
            (c.comunicacao_participantes || []).map((p: any) => p.user_id)
          )
        )
      );
      if (allUserIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome_completo, email")
        .in("id", allUserIds);
      const profMap = new Map((profiles || []).map((p) => [p.id, p]));

      return (canais || []).map((c: any) => ({
        id: c.id,
        nome: c.nome,
        updated_at: c.updated_at,
        participantes: (c.comunicacao_participantes || []).map((p: any) => ({
          user_id: p.user_id,
          nome: profMap.get(p.user_id)?.nome_completo || profMap.get(p.user_id)?.email || "Usuário",
        })),
      }));
    },
  });

  // Agrupa por usuário: cada usuário tem uma lista de DMs (com a outra ponta)
  const grupos = useMemo(() => {
    if (!dms) return [] as Array<{ user_id: string; nome: string; conversas: Array<{ canalId: string; comNome: string; updated_at: string }> }>;
    const map = new Map<string, { user_id: string; nome: string; conversas: any[] }>();
    for (const dm of dms) {
      for (const p of dm.participantes) {
        const outros = dm.participantes.filter((x: any) => x.user_id !== p.user_id);
        const comNome = outros.map((o: any) => o.nome).join(", ") || "Sem destinatário";
        if (!map.has(p.user_id)) {
          map.set(p.user_id, { user_id: p.user_id, nome: p.nome, conversas: [] });
        }
        map.get(p.user_id)!.conversas.push({
          canalId: dm.id,
          comNome,
          updated_at: dm.updated_at,
        });
      }
    }
    let arr = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter(
        (g) =>
          g.nome.toLowerCase().includes(q) ||
          g.conversas.some((c) => c.comNome.toLowerCase().includes(q))
      );
    }
    return arr;
  }, [dms, busca]);

  return (
    <div className="flex h-full">
      <div className="w-72 border-r bg-card flex flex-col">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold text-sm">Monitoramento ADM</h2>
          </div>
          <Input
            placeholder="Buscar usuário..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-xs text-muted-foreground">Carregando...</p>}
          {!isLoading && grupos.length === 0 && (
            <p className="p-4 text-xs text-muted-foreground">Nenhuma conversa encontrada.</p>
          )}
          {grupos.map((g) => {
            const open = expanded[g.user_id] ?? false;
            return (
              <div key={g.user_id} className="border-b">
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [g.user_id]: !open }))}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-accent text-left"
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium flex-1 truncate">{g.nome}</span>
                  <span className="text-[10px] text-muted-foreground">{g.conversas.length}</span>
                </button>
                {open && (
                  <div className="pb-1">
                    {g.conversas.map((c) => (
                      <button
                        key={c.canalId + g.user_id}
                        onClick={() => setCanalSelecionado(c.canalId)}
                        className={cn(
                          "w-full pl-9 pr-3 py-1.5 flex items-center gap-2 hover:bg-accent text-left text-xs",
                          canalSelecionado === c.canalId && "bg-accent"
                        )}
                      >
                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate flex-1">com {c.comNome}</span>
                        <span className="px-1 py-0.5 rounded bg-destructive/15 text-destructive font-semibold text-[9px]">
                          ADM
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {canalSelecionado ? (
          <>
            <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-destructive" />
              <span className="text-xs font-semibold text-destructive">
                MODO MONITORAMENTO ADM — você está visualizando uma conversa privada
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <MensagemArea canalId={canalSelecionado} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecione uma conversa para monitorar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}