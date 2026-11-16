import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { textoPlano } from "@/lib/textoPlano";
import { supabase } from "@/integrations/supabase/client";
import { usePendenciasSetor } from "@/hooks/useDemandas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";

// `origem` é o módulo da tarefa em worklist_tarefas. Nome de grupo em frase normal, com acento.
const GRUPO: Record<string, string> = {
  demandas: "Demandas",
  licitacoes: "Licitações",
  contratos: "Contratos",
  disparos: "Prospecção",
  medicos: "Médicos",
  escalas: "Escalas",
  financeiro: "Financeiro",
  relacionamento: "Relacionamento",
  radiologia: "Radiologia",
  suporte: "Suporte",
};
const nomeGrupo = (o: string) => GRUPO[o] ?? (o ? o.charAt(0).toUpperCase() + o.slice(1) : "Outras");

/**
 * Pendências abertas do setor agrupadas por tipo, com a contagem. Antes eram 20 cartões quase iguais, todos
 * "MÉDIA" e "LICITACOES"; agora cada grupo abre a lista dele, e cada item abre o detalhe da tarefa.
 */
export function PendenciasAgrupadas({ onAbrirTarefa }: { onAbrirTarefa: (id: string) => void }) {
  const { setorId, setorNome } = useUserSetor();
  const { isAdmin } = usePermissions();
  const [filtroAdmin, setFiltroAdmin] = useState("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const setor = isAdmin ? (filtroAdmin === "todos" ? null : filtroAdmin) : setorId;
  const { data: pendencias = [], isLoading, isError } = usePendenciasSetor(setor, isAdmin);

  const { data: setores = [] } = useQuery({
    queryKey: ["setores-pendencias-filter"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("id, nome").order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  const grupos = useMemo(() => {
    const m = new Map<string, typeof pendencias>();
    pendencias.forEach((p) => m.set(p.origem, [...(m.get(p.origem) ?? []), p]));
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [pendencias]);

  const semSetor = !isAdmin && !setorId;

  return (
    <section className="rounded-xl border bg-card px-5 py-4">
      <header className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="font-display text-base font-semibold">Pendências do setor</h2>
        {!isAdmin && setorNome && <span className="text-xs text-muted-foreground">{setorNome}</span>}
        {isAdmin && (
          <Select value={filtroAdmin} onValueChange={setFiltroAdmin}>
            <SelectTrigger className="ml-auto h-8 w-[170px] text-xs" aria-label="Setor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os setores</SelectItem>
              {setores.map((s: { id: string; nome: string }) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {semSetor && (
        <p className="py-2 text-sm text-muted-foreground">
          Seu usuário ainda não tem setor. Peça ao administrador do Sigma para definir.
        </p>
      )}
      {isLoading && !semSetor && (
        <div className="space-y-2 pt-1">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}
      {isError && <p className="py-2 text-sm text-destructive">Não deu para carregar as pendências. Recarregue a página.</p>}
      {!isLoading && !isError && !semSetor && grupos.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">Nenhuma pendência aberta no setor.</p>
      )}

      <ul className="divide-y">
        {grupos.map(([origem, itens]) => {
          const estaAberto = aberto === origem;
          const altas = itens.filter((p) => p.urgencia === "alta" || p.urgencia === "critica").length;
          return (
            <li key={origem}>
              <button
                type="button"
                aria-expanded={estaAberto}
                onClick={() => setAberto(estaAberto ? null : origem)}
                className="flex w-full items-center gap-2 py-2.5 text-left text-sm hover:text-primary"
              >
                <span className="min-w-0 flex-1 truncate">{nomeGrupo(origem)}</span>
                {altas > 0 && <span className="shrink-0 text-xs text-amber-700">{altas} urgente{altas === 1 ? "" : "s"}</span>}
                <b className="w-8 shrink-0 text-right tabular-nums">{itens.length}</b>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", estaAberto && "rotate-180")} />
              </button>
              {estaAberto && (
                <ul className="mb-2 max-h-64 space-y-0.5 overflow-auto">
                  {itens.map((p) => {
                    const titulo = textoPlano(p.titulo) || "Pendência sem título";
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => onAbrirTarefa(p.id)}
                          title={titulo}
                          className="block w-full truncate rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        >
                          {titulo}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
