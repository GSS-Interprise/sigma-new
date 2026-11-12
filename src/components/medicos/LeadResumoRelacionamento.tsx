// Resumo do relacionamento com o médico (topo da linha do tempo do lead).
// Pergunta da tela: "Já falamos com esse médico? Por qual número, em quais vagas, e o que ele respondeu?"
// Fontes: campanha_leads (campanhas), conversa_classificacao (resposta, objeção, valor, onde atua) e
// lead_telefone_situacao (contato inteligente, 12/11). Os eventos detalhados ficam na lista logo abaixo.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const db = supabase as any;

const STATUS: Record<string, string> = {
  frio: "Na fila", contatado: "Contatado", em_conversa: "Em conversa", aquecido: "Aquecido", quente: "Quente",
  convertido: "Convertido", sem_resposta: "Sem resposta", descartado: "Encerrado", sem_whatsapp: "Sem WhatsApp",
};
const RESULTADO: Record<string, { nome: string; tom: string }> = {
  interessado: { nome: "Interessado", tom: "text-emerald-700" },
  objecao: { nome: "Objeção", tom: "text-amber-700" },
  sem_interesse: { nome: "Sem interesse", tom: "text-muted-foreground" },
  filtro_secretaria: { nome: "Caiu no consultório", tom: "text-muted-foreground" },
  indicacao: { nome: "Indicou outro médico", tom: "text-sky-700" },
  contato_errado: { nome: "Número não era dele", tom: "text-red-700" },
  fora_do_perfil: { nome: "Fora do perfil", tom: "text-muted-foreground" },
  desconfianca: { nome: "Desconfiou do contato", tom: "text-amber-700" },
};
const OBJECAO: Record<string, string> = {
  distancia: "distância", agenda: "agenda", valor: "valor", modelo_trabalho: "modelo de trabalho", so_remoto: "só remoto",
  estrutura: "estrutura do hospital", outro: "outro motivo",
};
const UNIDADE_VALOR: Record<string, string> = { plantao_12h: "plantão 12 h", plantao_24h: "plantão 24 h", hora: "hora", exame: "exame", mes: "mês" };
const SITUACAO: Record<string, { nome: string; selo: string }> = {
  principal: { nome: "Principal", selo: "bg-emerald-100 text-emerald-900" },
  ativo: { nome: "Ativo", selo: "bg-emerald-100 text-emerald-900" },
  informado: { nome: "Informado na conversa", selo: "bg-sky-100 text-sky-900" },
  consultorio: { nome: "Consultório", selo: "bg-amber-100 text-amber-900" },
  errado: { nome: "Não é do médico", selo: "bg-red-100 text-red-900" },
  saiu: { nome: "Pediu para sair", selo: "bg-red-100 text-red-900" },
  inativo: { nome: "Inativo", selo: "bg-slate-200 text-slate-800" },
  nao_testado: { nome: "Nunca usado", selo: "bg-muted text-muted-foreground" },
};

const dia = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const so = (t?: string | null) => String(t ?? "").replace(/\D/g, "").replace(/^(?!55)(\d{10,11})$/, "55$1");
function foneBonito(t: string) {
  const d = so(t).replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t;
}

export function useResumoLead(leadId: string) {
  return useQuery({
    queryKey: ["lead-resumo-relacionamento", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const [lead, camps, classes, fones] = await Promise.all([
        db.from("leads").select("phone_e164, telefones_adicionais, whatsapp_phones, telefones_inativos").eq("id", leadId).maybeSingle(),
        db.from("campanha_leads").select("id, campanha_id, status, data_primeiro_contato, data_ultimo_contato, motivo_perdido, created_at, campanha:campanha_id(nome)")
          .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(50),
        db.from("conversa_classificacao").select("campanha_lead_id, resultado, objecao, objecao_detalhe, valor_pedido, valor_unidade, cidade_medico, uf_medico, disponibilidade, trecho, classificado_em")
          .eq("lead_id", leadId).order("classificado_em", { ascending: false }),
        db.from("lead_telefone_situacao").select("telefone, situacao, motivo, trecho, marcado_em").eq("lead_id", leadId),
      ]);
      for (const r of [lead, camps, classes, fones]) if (r.error) throw r.error;
      return { lead: lead.data, campanhas: camps.data ?? [], classes: classes.data ?? [], fones: fones.data ?? [] };
    },
  });
}

export function LeadResumoRelacionamento({ leadId, semMoldura = false }: { leadId: string; semMoldura?: boolean }) {
  const { data, isLoading, error } = useResumoLead(leadId);
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (error) return <p className="text-sm text-red-700">Não deu para carregar o resumo: {(error as Error).message}</p>;
  if (!data) return null;

  const classePorCl = new Map<string, any>();
  for (const c of data.classes) if (c.campanha_lead_id && !classePorCl.has(c.campanha_lead_id)) classePorCl.set(c.campanha_lead_id, c);
  const respondeu = data.campanhas.filter((c: any) => classePorCl.has(c.id)).length;
  const objecoes = new Map<string, number>();
  for (const c of classePorCl.values()) if (c.resultado === "objecao" && c.objecao) objecoes.set(c.objecao, (objecoes.get(c.objecao) ?? 0) + 1);

  // Telefones: principal + listas do lead + situação gravada pelo contato inteligente
  const principal = so(data.lead?.phone_e164);
  const sit = new Map<string, any>(data.fones.map((f: any) => [f.telefone, f]));
  const inativos = new Set((data.lead?.telefones_inativos ?? []).map(so));
  const todos = [...new Set([principal, ...(data.lead?.whatsapp_phones ?? []).map(so), ...(data.lead?.telefones_adicionais ?? []).map(so), ...sit.keys()])]
    .filter((t) => t && t.length >= 12);
  const situacaoDe = (t: string) => sit.get(t)?.situacao ?? (t === principal ? "principal" : inativos.has(t) ? "inativo" : "nao_testado");
  const ordem = ["principal", "ativo", "informado", "nao_testado", "consultorio", "inativo", "errado", "saiu"];
  todos.sort((a, b) => (a === principal ? -1 : b === principal ? 1 : ordem.indexOf(situacaoDe(a)) - ordem.indexOf(situacaoDe(b))));
  const principalRuim = ["errado", "consultorio", "saiu"].includes(sit.get(principal)?.situacao);

  return (
    <div className={cn("space-y-3 text-sm", !semMoldura && "rounded-md border bg-card p-3")}>
      <p className="font-medium">
        {data.campanhas.length === 0 ? "Nunca entrou em campanha." : `${data.campanhas.length} ${data.campanhas.length === 1 ? "campanha" : "campanhas"} · respondeu em ${respondeu}`}
        {objecoes.size > 0 && <span className="font-normal text-muted-foreground"> · objeções: {[...objecoes].map(([k, n]) => `${OBJECAO[k] ?? k}${n > 1 ? ` (${n})` : ""}`).join(", ")}</span>}
      </p>

      {principalRuim && (
        <p className="rounded bg-red-50 px-2 py-1 text-red-800">O telefone principal não chega ao médico. Cadastre um número novo antes de incluir em campanha.</p>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Telefones</p>
        {todos.length === 0 && <p className="text-muted-foreground">Nenhum telefone cadastrado.</p>}
        <div className="space-y-1">
          {todos.slice(0, 8).map((t) => {
            const s = situacaoDe(t), info = sit.get(t);
            return (
              <div key={t} className="flex flex-wrap items-baseline gap-x-2">
                <span className="w-32 shrink-0 tabular-nums">{foneBonito(t)}</span>
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", (SITUACAO[s] ?? SITUACAO.nao_testado).selo)}>
                  {t === principal && s !== "principal" ? `Principal · ${SITUACAO[s]?.nome}` : SITUACAO[s]?.nome}
                </span>
                {info?.trecho && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={info.trecho}>“{info.trecho}”</span>}
              </div>
            );
          })}
          {todos.length > 8 && <p className="text-xs text-muted-foreground">e mais {todos.length - 8} números.</p>}
        </div>
      </div>

      {data.campanhas.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Campanhas e respostas</p>
          <div className="divide-y rounded border">
            {data.campanhas.map((c: any) => {
              const cl = classePorCl.get(c.id);
              const r = cl ? RESULTADO[cl.resultado] : null;
              const det = cl && [
                cl.objecao ? `objeção: ${OBJECAO[cl.objecao] ?? cl.objecao}${cl.objecao_detalhe ? ` (${cl.objecao_detalhe})` : ""}` : null,
                cl.valor_pedido ? `pediu R$ ${Number(cl.valor_pedido).toLocaleString("pt-BR")}${cl.valor_unidade ? `/${UNIDADE_VALOR[cl.valor_unidade] ?? cl.valor_unidade}` : ""}` : null,
                cl.cidade_medico || cl.uf_medico ? `atua em ${[cl.cidade_medico, cl.uf_medico].filter(Boolean).join(" - ")}` : null,
                cl.disponibilidade ? `disponível: ${cl.disponibilidade}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <div key={c.id} className="space-y-0.5 px-2 py-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="min-w-0 truncate font-medium" title={c.campanha?.nome}>{c.campanha?.nome ?? "Campanha"}</span>
                    <span className="text-xs text-muted-foreground">{dia(c.data_primeiro_contato ?? c.created_at)} · {STATUS[c.status] ?? c.status}</span>
                    {r && <span className={cn("text-xs font-medium", r.tom)}>{r.nome}</span>}
                    {!cl && c.data_primeiro_contato && <span className="text-xs text-muted-foreground">sem resposta</span>}
                  </div>
                  {det && <p className="text-xs text-muted-foreground">{det}</p>}
                  {cl?.trecho && <p className="text-xs italic">“{cl.trecho}”</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
