import { useEffect, useMemo, useRef, useState } from "react";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, GripVertical, MoreHorizontal, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Colunas do quadro de licitações editáveis no próprio quadro, como no Trello (T3 do plano
 * docs/arquitetura/licitacoes-contratos-gss.md, pedido da Bianca e da Denise em 07/10).
 * Renomear: duplo clique no nome. Reordenar: arrastar pelo cabeçalho. Criar, mudar cor e excluir:
 * menu "…" da coluna. Tudo passa por funções do banco (licitacoes_coluna_*), que conferem a
 * permissão e mantêm o enum do status do card em dia. Só o quadro da GSS (modulo "licitacoes")
 * é editável; o da AGES tem cópia própria e não muda.
 */
export type ColunaKanban = { id: string; label: string; cor?: string };

const CHAVE = ["kanban-columns", "licitacoes"];
const TIPO_ARRASTO = "application/x-coluna-licitacao";
// fracassado pode ser excluída para unir com "Não ganhamos" (pedido da Bianca, 31:13 da reunião)
const PROTEGIDAS = new Set(["captacao_edital", "arrematados", "descarte_edital", "nao_ganhamos", "suspenso_revogado"]);
const CORES = ["#3b82f6", "#2a9bb7", "#14b8a6", "#22c55e", "#0e4f0c", "#eab308", "#f59e0b", "#ef4444", "#c92675", "#8b5cf6", "#64748b"];

/**
 * Opções de status das telas do card (detalhe e edição rápida) vindas das colunas do quadro, para
 * coluna criada ou renomeada pela equipe aparecer também ali. A lista fixa antiga fica de reserva
 * enquanto as colunas carregam.
 */
export function useOpcoesStatusLicitacao(licitacao: any, reserva: { value: string; label: string }[]) {
  const ages = licitacao?.empresa === "AGES" || licitacao?.tipo_licitacao === "AGES" || (licitacao?.etiquetas || []).includes("AGES");
  const { data } = useKanbanColumns(ages ? "licitacoes_ages" : "licitacoes");
  const atual = licitacao?.status as string | undefined;
  return useMemo(() => {
    if (!data?.length) return reserva;
    const opcoes = data.map((c) => ({ value: c.id, label: c.label }));
    if (atual && !opcoes.some((o) => o.value === atual)) {
      opcoes.push({ value: atual, label: reserva.find((o) => o.value === atual)?.label ?? atual });
    }
    return opcoes;
  }, [data, atual, reserva]);
}

export const ehArrastoDeColuna =(e: React.DragEvent) => e.dataTransfer.types.includes(TIPO_ARRASTO);
export const colunaArrastada = (e: React.DragEvent) => e.dataTransfer.getData(TIPO_ARRASTO);

export function useEditarColunasLicitacoes() {
  const qc = useQueryClient();
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: CHAVE });
    qc.invalidateQueries({ queryKey: ["kanban-status-config", "licitacoes"] });
  };
  // atualização otimista: a coluna muda na hora e o banco confirma por trás
  const otimista = (fn: (cols: ColunaKanban[]) => ColunaKanban[]) => {
    const antes = qc.getQueryData<ColunaKanban[]>(CHAVE);
    if (antes) qc.setQueryData(CHAVE, fn(antes));
    return antes;
  };
  const erro = (antes: ColunaKanban[] | undefined, e: any) => {
    if (antes) qc.setQueryData(CHAVE, antes);
    toast.error(e?.message || "Não foi possível alterar a coluna");
  };

  const editar = useMutation({
    mutationFn: async (v: { id: string; label?: string; cor?: string }) => {
      const { error } = await (supabase as any).rpc("licitacoes_coluna_editar", { _status: v.id, _label: v.label ?? null, _cor: v.cor ?? null });
      if (error) throw error;
    },
    onMutate: (v) => otimista((cols) => cols.map((c) => (c.id === v.id ? { ...c, label: v.label ?? c.label, cor: v.cor ?? c.cor } : c))),
    onError: (e, _v, antes) => erro(antes, e),
    onSettled: recarregar,
  });

  const reordenar = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase as any).rpc("licitacoes_colunas_reordenar", { _status_ids: ids });
      if (error) throw error;
    },
    onMutate: (ids) => otimista((cols) => ids.map((id) => cols.find((c) => c.id === id)!).filter(Boolean)),
    onError: (e, _v, antes) => erro(antes, e),
    onSettled: recarregar,
  });

  const criar = useMutation({
    mutationFn: async (v: { label: string; depoisDe?: string }) => {
      const { data, error } = await (supabase as any).rpc("licitacoes_coluna_criar", { _label: v.label, _cor: null, _depois_de: v.depoisDe ?? null });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_d, v) => toast.success(`Coluna "${v.label}" criada`),
    onError: (e: any) => toast.error(e?.message || "Não foi possível criar a coluna"),
    onSettled: recarregar,
  });

  const excluir = useMutation({
    mutationFn: async (v: { id: string; destino: string }) => {
      const { data, error } = await (supabase as any).rpc("licitacoes_coluna_excluir", { _status: v.id, _destino: v.destino });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (n) => {
      toast.success(n ? `Coluna excluída. ${n} card(s) foram para a coluna escolhida.` : "Coluna excluída.");
      qc.invalidateQueries({ queryKey: ["licitacoes-kanban"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível excluir a coluna"),
    onSettled: recarregar,
  });

  const mover = (colunas: ColunaKanban[], id: string, alvo: string) => {
    const ids = colunas.map((c) => c.id);
    const de = ids.indexOf(id), para = ids.indexOf(alvo);
    if (de < 0 || para < 0 || de === para) return;
    ids.splice(de, 1);
    ids.splice(para, 0, id);
    reordenar.mutate(ids);
  };

  return { editar, reordenar, criar, excluir, mover };
}

export function ColunaKanbanCabecalho({
  coluna, colunas, total, editavel, onAdicionarDepois, onArrastoInicio, onArrastoFim,
}: {
  coluna: ColunaKanban; colunas: ColunaKanban[]; total: number; editavel: boolean;
  onAdicionarDepois: (id: string) => void; onArrastoInicio: (id: string) => void; onArrastoFim: () => void;
}) {
  const { editar, excluir, mover } = useEditarColunasLicitacoes();
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(coluna.label);
  const [excluindo, setExcluindo] = useState(false);
  const i = colunas.findIndex((c) => c.id === coluna.id);

  const salvarNome = () => {
    const novo = nome.trim();
    setRenomeando(false);
    if (novo && novo !== coluna.label) editar.mutate({ id: coluna.id, label: novo });
    else setNome(coluna.label);
  };

  return (
    <div
      className={cn("group flex items-center justify-between gap-1.5", editavel && !renomeando && "cursor-grab active:cursor-grabbing")}
      draggable={editavel && !renomeando}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(TIPO_ARRASTO, coluna.id);
        e.dataTransfer.effectAllowed = "move";
        onArrastoInicio(coluna.id);
      }}
      onDragEnd={onArrastoFim}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {editavel && <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/60" />}
        <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: coluna.cor || "hsl(var(--primary))" }} />
        {renomeando ? (
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={salvarNome}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvarNome();
              if (e.key === "Escape") { setNome(coluna.label); setRenomeando(false); }
            }}
            className="h-7 px-1.5 text-sm"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <span
            className={cn("truncate", editavel && "cursor-text")}
            title={editavel ? "Clique duas vezes para renomear" : coluna.label}
            onDoubleClick={() => { if (editavel) { setNome(coluna.label); setRenomeando(true); } }}
          >
            {coluna.label}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant="outline" className="text-xs">{total}</Badge>
        {editavel && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-60 hover:opacity-100 data-[state=open]:opacity-100" title="Opções da coluna">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => { setNome(coluna.label); setRenomeando(true); }} className="gap-2">
                <Pencil className="h-4 w-4" /> Renomear
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2"><Palette className="h-4 w-4" /> Cor</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-2">
                  <div className="grid grid-cols-6 gap-1.5">
                    {CORES.map((cor) => (
                      <button
                        key={cor}
                        type="button"
                        title={cor}
                        className={cn("h-6 w-6 rounded-full border-2", coluna.cor?.toLowerCase() === cor ? "border-foreground" : "border-transparent")}
                        style={{ backgroundColor: cor }}
                        onClick={() => editar.mutate({ id: coluna.id, cor })}
                      />
                    ))}
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={i <= 0} onSelect={() => mover(colunas, coluna.id, colunas[i - 1].id)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Mover para a esquerda
              </DropdownMenuItem>
              <DropdownMenuItem disabled={i >= colunas.length - 1} onSelect={() => mover(colunas, coluna.id, colunas[i + 1].id)} className="gap-2">
                <ArrowRight className="h-4 w-4" /> Mover para a direita
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAdicionarDepois(coluna.id)} className="gap-2">
                <Plus className="h-4 w-4" /> Nova coluna à direita
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {PROTEGIDAS.has(coluna.id) ? (
                <DropdownMenuItem disabled className="gap-2 text-xs">
                  <Trash2 className="h-4 w-4" /> Coluna com regra no Sigma: só renomeia
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setExcluindo(true)} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4" /> Excluir coluna…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {excluindo && (
        <ExcluirColunaDialog
          coluna={coluna}
          colunas={colunas}
          total={total}
          pendente={excluir.isPending}
          onCancelar={() => setExcluindo(false)}
          onConfirmar={(destino) => excluir.mutate({ id: coluna.id, destino }, { onSuccess: () => setExcluindo(false) })}
        />
      )}
    </div>
  );
}

function ExcluirColunaDialog({ coluna, colunas, total, pendente, onCancelar, onConfirmar }: {
  coluna: ColunaKanban; colunas: ColunaKanban[]; total: number; pendente: boolean;
  onCancelar: () => void; onConfirmar: (destino: string) => void;
}) {
  const outras = colunas.filter((c) => c.id !== coluna.id);
  const [destino, setDestino] = useState(outras[0]?.id ?? "");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Excluir a coluna "{coluna.label}"</DialogTitle>
          <DialogDescription>
            Nenhum card é apagado. Os {total} card(s) desta coluna, e também os arquivados que estavam nela, vão para a coluna escolhida abaixo.
          </DialogDescription>
        </DialogHeader>
        <Select value={destino} onValueChange={setDestino}>
          <SelectTrigger><SelectValue placeholder="Para qual coluna os cards vão" /></SelectTrigger>
          <SelectContent>
            {outras.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button variant="destructive" disabled={!destino || pendente} onClick={() => onConfirmar(destino)}>
            {pendente ? "Excluindo…" : "Excluir coluna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Coluna fantasma para criar coluna nova ("+ Adicionar coluna", como no Trello). */
export function NovaColunaInline({ depoisDe, aberta, onAbrir, onFechar }: {
  depoisDe?: string; aberta: boolean; onAbrir: () => void; onFechar: () => void;
}) {
  const { criar } = useEditarColunasLicitacoes();
  const [nome, setNome] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (aberta) ref.current?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" }); }, [aberta]);

  const salvar = () => {
    const n = nome.trim();
    if (!n) return onFechar();
    criar.mutate({ label: n, depoisDe }, { onSuccess: () => { setNome(""); onFechar(); } });
  };

  if (!aberta) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        className="flex h-10 w-[240px] shrink-0 items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground sm:w-[256px]"
      >
        <Plus className="h-4 w-4" /> Adicionar coluna
      </button>
    );
  }
  return (
    <div ref={ref} className="w-[240px] shrink-0 space-y-2 self-start rounded-lg border bg-card p-2 shadow-sm sm:w-[256px]">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome da coluna"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") { setNome(""); onFechar(); }
        }}
        className="h-8 text-sm"
      />
      <div className="flex gap-1.5">
        <Button size="sm" className="h-7" onClick={salvar} disabled={criar.isPending}>{criar.isPending ? "Criando…" : "Criar coluna"}</Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => { setNome(""); onFechar(); }}>Cancelar</Button>
      </div>
    </div>
  );
}
