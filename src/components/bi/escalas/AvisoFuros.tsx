// Aviso de furo no WhatsApp (21/11/2026, item "monitoramento do Dr. Escala" da tabela da Ramone).
// Pergunta da tela: "Quem fica sabendo sozinho quando abre furo na escala?" Quem usa: diretoria e coordenação de escalas.
// O envio é da edge alertas-equipe (acao "furos"), 3 vezes ao dia depois do robô do Dr. Escala; regras em
// supabase/functions/_shared/furos.ts. Só aparece para quem a RPC escala_furos_config deixa (admin, diretoria, coordenador).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { normalizarTelefone, telefoneBonito } from "@/components/radiologia/sla/useSla";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas novas fora dos tipos gerados
const db = supabase as any;
const TZ = "America/Sao_Paulo";

type Destino = { id?: string; nome: string; fone: string; local_ids: number[] | null; ativo: boolean };
type Linha = { id?: string; nome: string; fone: string; hospitais: string[]; ativo: boolean };

const paraLinha = (d: Destino): Linha => ({
  id: d.id, nome: d.nome, fone: telefoneBonito(d.fone), hospitais: (d.local_ids ?? []).map(String), ativo: d.ativo,
});

function erroDe(l: Linha, n: number) {
  if (!l.nome.trim()) return `Pessoa ${n}: informe o nome.`;
  if (!normalizarTelefone(l.fone)) return `Pessoa ${n}: telefone com DDD, ex.: (47) 99999-0000.`;
  return null;
}

export function AvisoFuros() {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["escala-furos-config"],
    queryFn: async () => {
      const { data, error } = await db.rpc("escala_furos_config");
      if (error) throw error;
      return data as { ativo: boolean; teste_destino: string | null; ultimo_aviso: string | null };
    },
    retry: false,
  });
  const destinos = useQuery({
    queryKey: ["escala-furo-destinos"],
    enabled: cfg.isSuccess,
    queryFn: async () => {
      const { data, error } = await db.from("escala_furo_destinos").select("id, nome, fone, local_ids, ativo").order("nome").order("id");
      if (error) throw error;
      return (data ?? []) as Destino[];
    },
  });
  const hospitais = useQuery({
    queryKey: ["drescala-locais-habilitados"],
    enabled: cfg.isSuccess,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("drescala_locais").select("id, nome").eq("habilitado", true)
        .not("nome", "ilike", "%local teste%").order("nome").order("id");
      if (error) throw error;
      return (data ?? []).map((l: { id: number; nome: string }) => ({ value: String(l.id), label: l.nome }));
    },
  });

  const salvos = useMemo(() => (destinos.data ?? []).map(paraLinha), [destinos.data]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  useEffect(() => { setLinhas(salvos); }, [salvos]);
  const mudou = JSON.stringify(linhas) !== JSON.stringify(salvos);
  const erro = linhas.map((l, i) => erroDe(l, i + 1)).find(Boolean) ?? null;
  const muda = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const ligar = useMutation({
    mutationFn: async (ativo: boolean) => { const { error } = await db.rpc("escala_furos_ligar", { p_ativo: ativo }); if (error) throw error; return ativo; },
    onSuccess: (ativo) => {
      toast.success(ativo ? "Aviso de furo ligado. Sai na próxima leitura do Dr. Escala." : "Aviso de furo desligado.");
      qc.invalidateQueries({ queryKey: ["escala-furos-config"] });
    },
    onError: (e) => toast.error(`Não mudou: ${(e as Error).message}`),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const ficam = new Set(linhas.map((l) => l.id).filter(Boolean));
      const sair = salvos.filter((s) => s.id && !ficam.has(s.id)).map((s) => s.id);
      if (sair.length) { const { error } = await db.from("escala_furo_destinos").delete().in("id", sair); if (error) throw error; }
      for (const l of linhas) {
        const reg = { nome: l.nome.trim(), fone: normalizarTelefone(l.fone), local_ids: l.hospitais.length ? l.hospitais.map(Number) : null,
          ativo: l.ativo, atualizado_em: new Date().toISOString() };
        const { error } = l.id
          ? await db.from("escala_furo_destinos").update(reg).eq("id", l.id)
          : await db.from("escala_furo_destinos").insert(reg);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Salvo. Quem está na lista recebe na próxima leitura do Dr. Escala."); qc.invalidateQueries({ queryKey: ["escala-furo-destinos"] }); },
    onError: (e) => {
      const m = (e as Error).message;
      toast.error(m.includes("escala_furo_destinos_fone_idx") ? "Esse telefone já está na lista." : `Não salvou: ${m}`);
    },
  });

  // Sem permissão (RPC recusa): o cartão não aparece. A pessoa ainda vê os furos acima.
  if (cfg.isError) return null;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Aviso de furo no WhatsApp</h3>
          <p className="text-sm text-muted-foreground">
            {cfg.data?.ativo
              ? "Ligado. Sai depois de cada leitura do Dr. Escala (6h, 12h e 18h): furo novo na semana e furo aberto a menos de 24 h."
              : "Desligado: ninguém recebe aviso de furo."}
          </p>
        </div>
        <Switch checked={!!cfg.data?.ativo} disabled={cfg.isLoading || ligar.isPending} onCheckedChange={(v) => ligar.mutate(v)}
          aria-label="Aviso de furo ligado" />
      </div>

      {cfg.data?.teste_destino && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Teste interno ligado: os avisos vão para {telefoneBonito(cfg.data.teste_destino)}, não para a lista abaixo.
        </p>
      )}

      <div className="mt-4 space-y-3 text-sm">
        {(cfg.isLoading || destinos.isLoading) && <Skeleton className="h-24 w-full" />}
        {destinos.error && <p className="text-red-700">Não deu para carregar a lista: {(destinos.error as Error).message}</p>}

        {destinos.data && (
          <>
            {linhas.length === 0 && (
              <p className="text-muted-foreground">Ninguém na lista. Adicione quem cuida da escala para receber os furos.</p>
            )}
            {linhas.map((l, i) => (
              <div key={l.id ?? `novo-${i}`} className="grid items-end gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_170px_minmax(0,1.4fr)_auto]">
                <div className="space-y-1">
                  <Label htmlFor={`f-nome-${i}`}>Nome</Label>
                  <Input id={`f-nome-${i}`} value={l.nome} maxLength={80} placeholder="Brenda" onChange={(e) => muda(i, { nome: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`f-fone-${i}`}>WhatsApp</Label>
                  <Input id={`f-fone-${i}`} value={l.fone} inputMode="tel" placeholder="(47) 99999-0000" onChange={(e) => muda(i, { fone: e.target.value })} />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label>Hospitais</Label>
                  <SearchableMultiSelect options={hospitais.data ?? []} values={l.hospitais} onChange={(v) => muda(i, { hospitais: v })}
                    placeholder="Todos os hospitais" searchPlaceholder="Buscar hospital..." emptyText="Nenhum hospital." />
                </div>
                <div className="flex h-10 items-center gap-2">
                  <Switch checked={l.ativo} onCheckedChange={(v) => muda(i, { ativo: v })} aria-label={`Pessoa ${i + 1} recebe`} />
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Remover pessoa ${i + 1}`}
                    onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-9" disabled={linhas.length >= 20}
                onClick={() => setLinhas((ls) => [...ls, { nome: "", fone: "", hospitais: [], ativo: true }])}>
                <Plus className="mr-1 h-4 w-4" />Adicionar pessoa
              </Button>
              {cfg.data?.ultimo_aviso && (
                <span className="text-xs text-muted-foreground">
                  Último aviso: {new Date(cfg.data.ultimo_aviso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {mudou && <Button variant="ghost" className="h-9" onClick={() => setLinhas(salvos)} disabled={salvar.isPending}>Desfazer</Button>}
                <Button className="h-9" disabled={!mudou || !!erro || salvar.isPending} onClick={() => salvar.mutate()}>
                  {salvar.isPending ? "Salvando…" : "Salvar lista"}
                </Button>
              </div>
            </div>
            {erro && mudou && <p className="text-xs text-red-700">{erro}</p>}
          </>
        )}
      </div>
    </Card>
  );
}
