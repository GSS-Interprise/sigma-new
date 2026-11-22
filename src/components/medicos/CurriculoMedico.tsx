// Aba "Currículo" da ficha do médico (22/11/2026). Pergunta da aba: "o que esse médico já fez e onde?".
// O currículo vem do WhatsApp (importado sozinho pela edge medico-curriculo a cada 10 min) ou é enviado aqui; a IA lê
// formação, residência, especialidades (RQE) e experiência. Topo: o resumo; abaixo, o que foi lido; o arquivo fica a 1 clique.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, ExternalLink, FileText, GraduationCap, Loader2, RefreshCw, Stethoscope, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Dados = {
  nome: string | null; resumo: string | null;
  formacao: { curso: string; instituicao: string | null; ano: string | null }[];
  residencias: { especialidade: string; instituicao: string | null; periodo: string | null }[];
  especialidades: { nome: string; rqe: string | null }[];
  experiencias: { local: string; cidade: string | null; funcao: string | null; periodo: string | null }[];
  cursos: string[];
};
type Curriculo = {
  id: string; origem: "whatsapp" | "upload"; arquivo_url: string; arquivo_nome: string | null; recebido_em: string;
  status: "pendente" | "lido" | "erro" | "nao_suportado"; dados: Dados | null; resumo: string | null; erro: string | null;
};
const db = supabase as unknown as { from: (t: string) => any };
const ACEITA = ".pdf,.docx,.png,.jpg,.jpeg";
const EXP_VISIVEIS = 6;
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function CurriculoMedico({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [todasExp, setTodasExp] = useState(false);
  const lista = useQuery({
    queryKey: ["medico-curriculos", leadId],
    queryFn: async () => {
      const { data: d, error } = await db.from("medico_curriculos")
        .select("id, origem, arquivo_url, arquivo_nome, recebido_em, status, dados, resumo, erro")
        .eq("lead_id", leadId).order("recebido_em", { ascending: false });
      if (error) throw new Error(error.message);
      return (d ?? []) as Curriculo[];
    },
    // Enquanto algum estiver na fila, confere de novo (a leitura da IA leva ~20 s).
    refetchInterval: (q) => ((q.state.data as Curriculo[] | undefined)?.some((c) => c.status === "pendente") ? 15_000 : false),
  });
  const enviar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (arquivo.size > 15 * 1024 * 1024) throw new Error("Arquivo maior que 15 MB.");
      const nomeSeguro = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
      const path = `curriculos/${leadId}/${Date.now()}-${nomeSeguro}`;
      const up = await supabase.storage.from("lead-anexos").upload(path, arquivo, { contentType: arquivo.type || undefined });
      if (up.error) throw new Error(up.error.message);
      const { data: r, error } = await supabase.functions.invoke("medico-curriculo", { body: { acao: "enviar", lead_id: leadId, path, nome: arquivo.name, mime: arquivo.type } });
      if (error) throw new Error(error.message);
      if (r?.ok === false) throw new Error(r.error);
      return r as { status: string };
    },
    onSuccess: (r) => {
      setEscolhido(null);
      qc.invalidateQueries({ queryKey: ["medico-curriculos", leadId] });
      toast.success(r.status === "lido" ? "Currículo enviado e lido." : r.status === "pendente" ? "Currículo enviado. A leitura sai em alguns minutos." : "Currículo enviado, mas a IA não conseguiu ler este formato.");
    },
    onError: (e) => toast.error(`Não deu para enviar: ${(e as Error).message}`),
  });
  const reler = useMutation({
    mutationFn: async (id: string) => {
      const { data: r, error } = await supabase.functions.invoke("medico-curriculo", { body: { acao: "ler", id } });
      if (error) throw new Error(error.message);
      return r as { status: string };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["medico-curriculos", leadId] }); toast.success("Lido de novo."); },
    onError: (e) => toast.error(`Não deu para ler: ${(e as Error).message}`),
  });

  const cvs = lista.data ?? [];
  // Abre no último currículo já lido: o mais novo pode ser um .doc que a IA não lê e esconderia o que já se sabe.
  const atual = cvs.find((c) => c.id === escolhido) ?? cvs.find((c) => c.status === "lido") ?? cvs[0];
  const botaoEnviar = (
    <>
      <input ref={input} type="file" accept={ACEITA} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar.mutate(f); e.target.value = ""; }} />
      <Button size="sm" variant="outline" disabled={enviar.isPending} onClick={() => input.current?.click()}>
        {enviar.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Enviando e lendo…</> : <><Upload className="mr-1.5 h-3.5 w-3.5" />Enviar currículo</>}
      </Button>
    </>
  );

  if (lista.isLoading) return <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (lista.isError) return <p className="text-sm text-destructive">Não deu para carregar: {(lista.error as Error).message}</p>;
  if (!atual) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
        <FileText className="h-6 w-6 text-muted-foreground" />
        <p className="font-medium">Nenhum currículo ainda</p>
        <p className="max-w-sm text-sm text-muted-foreground">Quando o médico mandar o currículo pelo WhatsApp, ele aparece aqui sozinho. Também dá para enviar o arquivo (PDF, Word ou foto).</p>
        <div className="mt-1">{botaoEnviar}</div>
      </div>
    );
  }
  const d = atual.dados;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-muted-foreground">
          {atual.origem === "whatsapp" ? "Recebido pelo WhatsApp" : "Enviado na ficha"} em {data(atual.recebido_em)}
          {cvs.length > 1 && (
            <select className="ml-2 rounded border bg-background px-1.5 py-0.5 text-xs" value={atual.id} onChange={(e) => { setEscolhido(e.target.value); setTodasExp(false); }} aria-label="Escolher currículo">
              {cvs.map((c) => <option key={c.id} value={c.id}>{data(c.recebido_em)} · {(c.arquivo_nome || "currículo").slice(0, 40)}</option>)}
            </select>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild size="sm" variant="ghost"><a href={atual.arquivo_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir arquivo</a></Button>
          {botaoEnviar}
        </div>
      </div>

      {atual.status === "pendente" && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" />A IA está lendo este currículo. Leva alguns minutos.</div>
      )}
      {(atual.status === "erro" || atual.status === "nao_suportado") && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>{atual.status === "nao_suportado" ? "A IA não lê este formato (ex.: .doc antigo). Peça o PDF ao médico." : `Não deu para ler: ${atual.erro ?? "erro desconhecido"}`}</span>
          {atual.status === "erro" && <Button size="sm" variant="outline" disabled={reler.isPending} onClick={() => reler.mutate(atual.id)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Ler de novo</Button>}
        </div>
      )}

      {atual.status === "lido" && d && (
        <>
          {d.resumo && <p className="rounded-lg border bg-primary/5 p-4 text-sm leading-relaxed">{d.resumo}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <Bloco icone={GraduationCap} titulo="Formação e residência" vazio={!d.formacao.length && !d.residencias.length}>
              {d.formacao.map((f, i) => <Item key={`f${i}`} t={f.curso} s={[f.instituicao, f.ano].filter(Boolean).join(" · ")} />)}
              {d.residencias.map((r, i) => <Item key={`r${i}`} t={`Residência em ${r.especialidade}`} s={[r.instituicao, r.periodo].filter(Boolean).join(" · ")} />)}
            </Bloco>
            <Bloco icone={Stethoscope} titulo="Especialidades" vazio={!d.especialidades.length}>
              {d.especialidades.map((e, i) => <Item key={i} t={e.nome} s={e.rqe ? `RQE ${e.rqe}` : "RQE não informado no currículo"} />)}
            </Bloco>
          </div>
          <Bloco icone={Briefcase} titulo={`Experiência${d.experiencias.length ? ` (${d.experiencias.length})` : ""}`} vazio={!d.experiencias.length}>
            <ol className="relative space-y-3 border-l pl-4">
              {(todasExp ? d.experiencias : d.experiencias.slice(0, EXP_VISIVEIS)).map((x, i) => (
                <li key={i} className="relative">
                  <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background", i === 0 ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden />
                  <p className="text-sm font-medium">{x.local}</p>
                  <p className="text-xs text-muted-foreground">{[x.funcao, x.cidade, x.periodo].filter(Boolean).join(" · ") || "—"}</p>
                </li>
              ))}
            </ol>
            {d.experiencias.length > EXP_VISIVEIS && (
              <Button size="sm" variant="ghost" className="mt-2 h-8 px-2" onClick={() => setTodasExp((v) => !v)}>
                {todasExp ? "Mostrar só as mais recentes" : `Ver todas (${d.experiencias.length})`}
              </Button>
            )}
          </Bloco>
          {d.cursos.length > 0 && (
            <Bloco icone={FileText} titulo="Cursos e títulos" vazio={false}>
              <ul className="flex flex-wrap gap-1.5">{d.cursos.map((c, i) => <li key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs">{c}</li>)}</ul>
            </Bloco>
          )}
          <p className="text-xs text-muted-foreground">Lido pela IA a partir do arquivo. Confira no arquivo antes de usar num contrato.</p>
        </>
      )}
    </div>
  );
}

function Bloco({ icone: I, titulo, vazio, children }: { icone: typeof FileText; titulo: string; vazio: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><I className="h-4 w-4 text-primary" />{titulo}</h4>
      {vazio ? <p className="text-sm text-muted-foreground">Não consta no currículo.</p> : <div className="space-y-2.5">{children}</div>}
    </section>
  );
}
const Item = ({ t, s }: { t: string; s: string }) => (
  <div className="min-w-0"><p className="text-sm font-medium">{t}</p>{s && <p className="text-xs text-muted-foreground">{s}</p>}</div>
);
