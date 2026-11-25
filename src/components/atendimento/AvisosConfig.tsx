// Configuração dos avisos de conversa sem resposta (atendimento_config, linha única). Regras em
// supabase/functions/_shared/atendimento.ts: a escada conta só minutos dentro do horário de atendimento.
// Desde 25/11 a escada e a meta de cada tipo de contato ficam em atendimento_regras (RegrasPorTipo, no topo da aba);
// atendimento_config.faixas e meta_minutos não são mais editadas aqui nem lidas pelos avisos.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { normalizarFone } from "./ContatosMarcados";
import { RegrasPorTipo } from "./RegrasPorTipo";

type Pessoa = { nome: string; fone: string };
type Config = {
  dias: number[]; hora_inicio: string; hora_fim: string; coordenacao: Pessoa[]; diretoria: Pessoa[];
  avisos_ativos: boolean; modo_teste: boolean; teste_fone: string | null; meta_pct: number;
};
const DIAS = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [7, "Dom"]] as const;
const db = () => supabase as unknown as { from: (t: string) => any };

export function AvisosConfig({ podeGerir }: { podeGerir: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atendimento-config"],
    queryFn: async () => {
      const { data, error } = await db().from("atendimento_config").select("dias, hora_inicio, hora_fim, coordenacao, diretoria, avisos_ativos, modo_teste, teste_fone, meta_pct").eq("id", true).maybeSingle();
      if (error) throw new Error(error.message);
      return data as Config | null;
    },
  });
  const modelo = useQuery({
    queryKey: ["atendimento-modelo"],
    queryFn: async () => {
      // O modelo tem mais de uma linha (cada envio à Meta grava uma): aprovado se qualquer uma estiver aprovada.
      // Antes lia uma linha qualquer e mostrava "em análise" com o modelo já aprovado (25/11).
      const { data } = await db().from("whatsapp_official_templates").select("approval_status").eq("friendly_name", "gss_atendimento_espera_v1");
      const st = ((data ?? []) as { approval_status: string }[]).map((r) => r.approval_status);
      return st.includes("approved") ? "approved" : (st[0] ?? "nao_criado");
    },
  });
  const [c, setC] = useState<Config | null>(null);
  useEffect(() => { if (q.data) setC({ ...q.data, hora_inicio: q.data.hora_inicio.slice(0, 5), hora_fim: q.data.hora_fim.slice(0, 5) }); }, [q.data]);
  const salvar = useMutation({
    mutationFn: async () => {
      if (!c) return;
      const limpa = (ps: Pessoa[]) => ps.filter((p) => p.nome.trim() || p.fone.trim()).map((p) => {
        const fone = normalizarFone(p.fone);
        if (!fone || !p.nome.trim()) throw new Error(`Confira nome e telefone de "${p.nome || p.fone}".`);
        return { nome: p.nome.trim(), fone };
      });
      const teste = c.teste_fone ? normalizarFone(c.teste_fone) : null;
      if (c.modo_teste && !teste) throw new Error("Em modo teste, informe o telefone de teste.");
      if (c.hora_fim <= c.hora_inicio) throw new Error("O fim do atendimento precisa ser depois do início.");
      if (!c.dias.length) throw new Error("Marque ao menos um dia.");
      const metaPct = Math.round(Number(c.meta_pct));
      if (!(metaPct >= 1 && metaPct <= 100)) throw new Error("Meta: de 1% a 100%.");
      const { error } = await db().from("atendimento_config").update({
        dias: [...c.dias].sort(), hora_inicio: c.hora_inicio, hora_fim: c.hora_fim,
        coordenacao: limpa(c.coordenacao), diretoria: limpa(c.diretoria), avisos_ativos: c.avisos_ativos, modo_teste: c.modo_teste,
        teste_fone: teste, meta_pct: metaPct, atualizado_em: new Date().toISOString(),
      }).eq("id", true);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["atendimento-metas"] }); qc.invalidateQueries({ queryKey: ["atendimento-indicadores-hoje"] }); toast.success(c?.avisos_ativos ? (c.modo_teste ? "Salvo. Avisos ligados em modo teste." : "Salvo. Avisos ligados para a equipe.") : "Salvo. Avisos desligados."); qc.invalidateQueries({ queryKey: ["atendimento-config"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading || !c) return <p className="text-sm text-muted-foreground">{q.isError ? (q.error as Error).message : "Carregando…"}</p>;
  const ed = !podeGerir;
  const set = (p: Partial<Config>) => setC({ ...c, ...p });
  const modeloTxt = modelo.data === "approved" ? "Modelo do WhatsApp aprovado pela Meta." : modelo.data === "nao_criado" ? "Modelo do WhatsApp ainda não criado." : "Modelo do WhatsApp em análise na Meta: os avisos só saem depois da aprovação.";

  return (
    <div className="space-y-4">
    <RegrasPorTipo podeGerir={podeGerir} />
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Avisos pelo WhatsApp</h2>
            <p className="text-xs text-muted-foreground">{modeloTxt}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2"><Label htmlFor="av-ativo">{c.avisos_ativos ? "Ligados" : "Desligados"}</Label><Switch id="av-ativo" checked={c.avisos_ativos} disabled={ed} onCheckedChange={(v) => set({ avisos_ativos: v })} /></div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Horário de atendimento</p>
          <div className="flex flex-wrap gap-3">
            {DIAS.map(([n, r]) => (
              <label key={n} className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={c.dias.includes(n)} disabled={ed} onCheckedChange={(v) => set({ dias: v ? [...c.dias, n] : c.dias.filter((d) => d !== n) })} />{r}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Input type="time" className="h-9 w-28" aria-label="Início" value={c.hora_inicio} disabled={ed} onChange={(e) => set({ hora_inicio: e.target.value })} />
            <span className="text-muted-foreground">até</span>
            <Input type="time" className="h-9 w-28" aria-label="Fim" value={c.hora_fim} disabled={ed} onChange={(e) => set({ hora_fim: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">Conversa com a IA atuando não gera aviso.</p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Modo teste</p>
            <p className="text-xs text-muted-foreground">Tudo vai para o telefone de teste, dizendo para quem iria</p>
            {c.modo_teste && <Input className="mt-2 h-9 w-56" aria-label="Telefone de teste" placeholder="(54) 99999-0000" value={c.teste_fone || ""} disabled={ed} onChange={(e) => set({ teste_fone: e.target.value })} />}
          </div>
          <Switch checked={c.modo_teste} disabled={ed} onCheckedChange={(v) => set({ modo_teste: v })} aria-label="Modo teste" />
        </div>
      </section>
      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Meta do painel</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input type="number" min={1} max={100} className="h-9 w-20" aria-label="Meta em porcentagem" value={c.meta_pct} disabled={ed} onChange={(e) => set({ meta_pct: Number(e.target.value) })} />
            <span className="text-muted-foreground">% das conversas respondidas dentro da meta do tipo de contato</span>
          </div>
        </div>
        <ListaPessoas titulo="Coordenação" ajuda="Recebe no tempo da coluna Coordenação e as conversas de número sem responsável" pessoas={c.coordenacao} ed={ed} onChange={(p) => set({ coordenacao: p })} />
        <ListaPessoas titulo="Diretoria" ajuda="Recebe junto com a coordenação no tempo da coluna Diretoria" pessoas={c.diretoria} ed={ed} onChange={(p) => set({ diretoria: p })} />
        <p className="text-xs text-muted-foreground">Quem está com cada número recebe pelo telefone do perfil dele no Sigma.</p>
        {podeGerir ? (
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : "Salvar avisos"}</Button>
        ) : <p className="text-sm text-muted-foreground">Só a coordenação (admin, diretoria e gestão de captação) muda os avisos.</p>}
      </section>
    </div>
    </div>
  );
}

function ListaPessoas({ titulo, ajuda, pessoas, ed, onChange }: { titulo: string; ajuda: string; pessoas: Pessoa[]; ed: boolean; onChange: (p: Pessoa[]) => void }) {
  return (
    <div className="space-y-2">
      <div><p className="text-sm font-medium">{titulo}</p><p className="text-xs text-muted-foreground">{ajuda}</p></div>
      {pessoas.length === 0 && <p className="text-sm text-muted-foreground">Ninguém ainda.</p>}
      {pessoas.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="h-9 min-w-0 flex-1" aria-label={`Nome (${titulo})`} placeholder="Nome" value={p.nome} disabled={ed} onChange={(e) => onChange(pessoas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
          <Input className="h-9 w-44" aria-label={`WhatsApp (${titulo})`} placeholder="(47) 99999-0000" value={p.fone} disabled={ed} onChange={(e) => onChange(pessoas.map((x, j) => (j === i ? { ...x, fone: e.target.value } : x)))} />
          {!ed && <Button size="sm" variant="ghost" className="h-9 w-9 shrink-0 p-0" aria-label={`Remover ${p.nome || "pessoa"}`} onClick={() => onChange(pessoas.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ))}
      {!ed && <Button size="sm" variant="outline" onClick={() => onChange([...pessoas, { nome: "", fone: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar</Button>}
    </div>
  );
}
