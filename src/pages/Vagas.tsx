import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Briefcase, FileDown, Loader2, MoreHorizontal, Plus, Rocket, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NovaVagaDialog } from "@/components/vagas/NovaVagaDialog";
import { PreencherVagaDialog } from "@/components/vagas/PreencherVagaDialog";
import {
  TIPOS_VAGA, rotuloTipo, useMudarVaga, usePodeGerirVagas, useVagasAbertas, type FaixaDias, type TipoVaga, type Vaga,
} from "@/components/vagas/useVagas";

/**
 * Vagas em aberto (plano GSS dono no comando, Fase 4).
 * Pergunta da tela: "quais vagas estão abertas há mais tempo?" — lista começa pela mais antiga.
 * Cor só quando passa do ponto: âmbar de 16 a 30 dias, vermelho acima de 30.
 */

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const COR_DIAS: Record<FaixaDias, string> = {
  ate_7: "text-foreground",
  "8_a_15": "text-foreground",
  "16_a_30": "text-amber-600",
  mais_30: "text-red-600",
};

export default function Vagas() {
  const navigate = useNavigate();
  const { data: vagas = [], isLoading, error } = useVagasAbertas();
  const { data: podeGerir = false } = usePodeGerirVagas();
  const mudar = useMudarVaga();

  const [tipo, setTipo] = useState<TipoVaga | "todos">("todos");
  const [especialidade, setEspecialidade] = useState("");
  const [responsavel, setResponsavel] = useState("todos");
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<Vaga | null>(null);
  const [preenchendo, setPreenchendo] = useState<Vaga | null>(null);
  const [cancelando, setCancelando] = useState<Vaga | null>(null);
  const [baixando, setBaixando] = useState(false);

  const opcoesEsp = useMemo(() => {
    const m = new Map<string, string>();
    vagas.forEach((v) => m.set(v.especialidade_id, titulo(v.especialidade_nome)));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [vagas]);
  const opcoesResp = useMemo(() => {
    const m = new Map<string, string>();
    vagas.forEach((v) => v.responsavel_id && m.set(v.responsavel_id, v.responsavel_nome || ""));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [vagas]);

  const termo = busca.trim().toLowerCase();
  const filtradas = vagas.filter((v) =>
    (tipo === "todos" || v.tipo === tipo)
    && (!especialidade || v.especialidade_id === especialidade)
    && (responsavel === "todos" || (responsavel === "ninguem" ? !v.responsavel_id : v.responsavel_id === responsavel))
    && (!termo || `${v.cidade} ${v.hospital_nome} ${v.uf || ""}`.toLowerCase().includes(termo)),
  );

  const total = vagas.reduce((s, v) => s + v.quantidade, 0);
  const antigas = vagas.filter((v) => v.faixa === "mais_30").reduce((s, v) => s + v.quantidade, 0);
  const urgentes = vagas.filter((v) => v.prioridade === "urgente").reduce((s, v) => s + v.quantidade, 0);

  const baixarRelatorio = async () => {
    setBaixando(true);
    try {
      const { data, error: e } = await supabase.functions.invoke("vagas-relatorio-diario", { body: { modo: "pdf" } });
      if (e || !data?.url) throw e || new Error(data?.error || "sem_pdf");
      window.open(data.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(`Não consegui gerar o relatório: ${e?.message || e}`);
    } finally {
      setBaixando(false);
    }
  };

  const mover = (v: Vaga, campos: Record<string, unknown>, ok: string) =>
    mudar.mutate({ id: v.id, campos }, { onSuccess: () => toast.success(ok), onError: (e: any) => toast.error(`Não consegui: ${e?.message || e}`) });

  const headerActions = (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Vagas em aberto</h1>
        <p className="text-sm text-muted-foreground">As mais antigas primeiro. O resumo sai por e-mail às 7h nos dias úteis.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" onClick={baixarRelatorio} disabled={baixando || vagas.length === 0}>
          {baixando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
          Relatório de hoje
        </Button>
        {podeGerir && (
          <Button onClick={() => setNova(true)}><Plus className="mr-2 h-4 w-4" />Nova vaga</Button>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-3 gap-3">
          <Numero rotulo="Vagas abertas" valor={total} />
          <Numero rotulo="Há mais de 30 dias" valor={antigas} cor={antigas > 0 ? "text-red-600" : undefined} />
          <Numero rotulo="Urgentes" valor={urgentes} cor={urgentes > 0 ? "text-amber-600" : undefined} />
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Tipo de vaga" className="inline-flex rounded-md border bg-muted/40 p-0.5">
            {[{ value: "todos", label: "Todas" }, ...TIPOS_VAGA].map((t) => (
              <button key={t.value} role="tab" aria-selected={tipo === t.value} onClick={() => setTipo(t.value as TipoVaga | "todos")}
                className={cn("h-8 rounded px-3 text-sm", tipo === t.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
          <SearchableSelect options={opcoesEsp} value={especialidade} onChange={setEspecialidade}
            placeholder="Especialidade" searchPlaceholder="Buscar especialidade..." className="h-9 w-48" />
          <Select value={responsavel} onValueChange={setResponsavel}>
            <SelectTrigger className="h-9 w-44" aria-label="Responsável"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os responsáveis</SelectItem>
              <SelectItem value="ninguem">Sem responsável</SelectItem>
              {opcoesResp.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cidade ou hospital" className="h-9 w-52 pl-9" />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-[9%] px-4 py-2.5 font-medium">Aberta há</th>
                <th className="w-[29%] px-3 py-2.5 font-medium">Vaga</th>
                <th className="w-[24%] px-3 py-2.5 font-medium">Onde</th>
                <th className="w-[15%] px-3 py-2.5 font-medium">Responsável</th>
                <th className="w-[17%] px-3 py-2.5 font-medium">Campanha</th>
                <th className="w-[6%] px-3 py-2.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && [0, 1, 2].map((i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && error && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-red-600">Não consegui carregar as vagas. Recarregue a página.</td></tr>
              )}
              {!isLoading && !error && filtradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Briefcase className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="font-medium">{vagas.length === 0 ? "Nenhuma vaga aberta" : "Nenhuma vaga com esses filtros"}</p>
                    {vagas.length === 0 && podeGerir && (
                      <Button size="sm" className="mt-3" onClick={() => setNova(true)}><Plus className="mr-1.5 h-4 w-4" />Cadastrar a primeira</Button>
                    )}
                  </td>
                </tr>
              )}
              {filtradas.map((v) => (
                <tr key={v.id} className="align-top hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className={cn("text-xl font-semibold tabular-nums", COR_DIAS[v.faixa])}>{v.dias_aberta}</span>
                    <span className="ml-1 text-xs text-muted-foreground">{v.dias_aberta === 1 ? "dia" : "dias"}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{titulo(v.especialidade_nome)}</span>
                      {v.quantidade > 1 && <span className="shrink-0 text-xs text-muted-foreground">×{v.quantidade}</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {rotuloTipo(v.tipo)}
                      {v.prioridade === "urgente" && <span className="font-medium text-amber-700"> · Urgente</span>}
                      {v.status === "em_negociacao" && <span className="font-medium text-foreground"> · Em negociação</span>}
                      {v.descricao && ` · ${v.descricao}`}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="truncate">{v.hospital_nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.cidade}{v.uf ? ` - ${v.uf}` : ""}{v.valor ? ` · ${v.valor}` : ""}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className={cn("truncate", !v.responsavel_nome && "text-muted-foreground")}>{v.responsavel_nome || "Ninguém"}</p>
                  </td>
                  <td className="px-3 py-3">
                    {v.campanha_id ? (
                      <Link to={`/prospeccao?campanha=${v.campanha_id}`} className="block truncate text-primary hover:underline">
                        {v.campanha_nome || "Ver campanha"}
                      </Link>
                    ) : podeGerir ? (
                      <Button variant="outline" size="sm" className="h-8" onClick={() => navigate(`/prospeccao/nova?vaga=${v.id}`)}>
                        <Rocket className="mr-1.5 h-3.5 w-3.5" />Criar campanha
                      </Button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {podeGerir && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações da vaga de ${v.especialidade_nome}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreenchendo(v)}>Marcar preenchida</DropdownMenuItem>
                          {v.status === "aberta" ? (
                            <DropdownMenuItem onClick={() => mover(v, { status: "em_negociacao" }, "Vaga em negociação.")}>Em negociação</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => mover(v, { status: "aberta" }, "Vaga voltou para aberta.")}>Voltar para aberta</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setEditando(v)}>Editar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onClick={() => setCancelando(v)}>Cancelar vaga</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <NovaVagaDialog open={nova || !!editando} vaga={editando}
        onOpenChange={(o) => { if (!o) { setNova(false); setEditando(null); } }} />
      <PreencherVagaDialog vaga={preenchendo} onOpenChange={(o) => !o && setPreenchendo(null)} />
      <AlertDialog open={!!cancelando} onOpenChange={(o) => !o && setCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta vaga?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelando && `${titulo(cancelando.especialidade_nome)} em ${cancelando.cidade}. Ela sai da lista e do relatório. A campanha ligada a ela não para sozinha.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => cancelando && mover(cancelando, { status: "cancelada" }, "Vaga cancelada.")}>
              Cancelar vaga
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", cor)}>{valor}</dd>
    </div>
  );
}
