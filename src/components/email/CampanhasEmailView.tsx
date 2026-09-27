import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Mail, MapPin, MessageCircle, Plus, Search, Stethoscope } from "lucide-react";
import { CampanhaEmailPainel, EMAIL_STATUS } from "./CampanhaEmailPainel";
import { NovaCampanhaEmailDialog } from "./NovaCampanhaEmailDialog";
import type { EmailMetricasRow } from "./EmailMetricas";

type Linha = {
  id: string; nome: string; canal: string; email_status: string; assunto_email: string | null;
  especialidade_ids: string[] | null; regiao_estados: string[] | null; regiao_cidades: string[] | null;
  created_at: string; metricas?: EmailMetricasRow;
};

const POR_PAGINA = 12;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

/**
 * Aba "E-mail" da Máquina de Prospecção: campanhas só de e-mail + o e-mail que foi ligado
 * dentro de campanhas de WhatsApp, num lugar só.
 */
export function CampanhasEmailView() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [origem, setOrigem] = useState<"todas" | "email" | "whatsapp">("todas");
  const [pagina, setPagina] = useState(0);
  const [novaOpen, setNovaOpen] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["campanhas-email"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("campanhas")
        .select("id, nome, canal, email_status, assunto_email, especialidade_ids, regiao_estados, regiao_cidades, created_at")
        .or("canal.eq.email,email_ativo.eq.true")
        .neq("status", "arquivada")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Linha[];
      if (rows.length) {
        const { data: ms } = await (supabase as any).from("vw_email_campanha_metricas")
          .select("*").in("campanha_id", rows.map((r) => r.id));
        const mapa = new Map(((ms ?? []) as EmailMetricasRow[]).map((m) => [m.campanha_id, m]));
        rows.forEach((r) => { r.metricas = mapa.get(r.id); });
      }
      return rows;
    },
  });

  const { data: nomesEsp = new Map<string, string>() } = useQuery({
    queryKey: ["especialidades-nomes"],
    queryFn: async () => {
      const { data } = await supabase.from("especialidades").select("id, nome");
      return new Map((data ?? []).map((e: any) => [e.id, e.nome as string]));
    },
  });

  const porOrigem = useMemo(
    () => linhas.filter((l) => origem === "todas" || (origem === "email" ? l.canal === "email" : l.canal !== "email")),
    [linhas, origem],
  );
  const filtradas = useMemo(() => porOrigem.filter((l) =>
    (status === "todos" || l.email_status === status) &&
    (!busca.trim() || `${l.nome} ${l.assunto_email ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase())),
  ), [porOrigem, status, busca]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pag = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA);

  const selecionada = linhas.find((l) => l.id === aberta);
  if (aberta) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setAberta(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{selecionada?.nome ?? "Campanha"}</h2>
            {selecionada && <Resumo l={selecionada} nomesEsp={nomesEsp} />}
          </div>
        </div>
        <CampanhaEmailPainel campanhaId={aberta} />
      </div>
    );
  }

  const contagem = (s: string) => porOrigem.filter((l) => s === "todos" || l.email_status === s).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5 text-sm">
          {([["todas", "Todas"], ["email", "Só e-mail"], ["whatsapp", "Em campanhas de WhatsApp"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => { setOrigem(v); setPagina(0); }}
              className={`rounded px-3 py-1.5 ${origem === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64 sm:ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
            placeholder="Buscar campanha ou assunto" className="pl-8" />
        </div>
        <Button className="gap-1.5" onClick={() => setNovaOpen(true)}>
          <Plus className="h-4 w-4" /> Nova campanha de e-mail
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {["todos", "rascunho", "agendado", "enviando", "pausado", "concluido"].map((s) => (
          <button key={s} type="button" onClick={() => { setStatus(s); setPagina(0); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border ${status === s ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {s === "todos" ? "Todas" : EMAIL_STATUS[s].label}
            <Badge variant={status === s ? "secondary" : "outline"} className="h-5 px-1.5 text-[11px]">{contagem(s)}</Badge>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : !visiveis.length ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground space-y-1">
          <Mail className="h-6 w-6 mx-auto opacity-50" />
          <p>{linhas.length ? "Nenhuma campanha com esses filtros." : "Nenhuma campanha de e-mail ainda."}</p>
          {!linhas.length && <p>Crie uma aqui, ou ligue o e-mail dentro de uma campanha de WhatsApp.</p>}
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((l) => {
            const m = l.metricas;
            const st = EMAIL_STATUS[l.email_status] ?? EMAIL_STATUS.rascunho;
            return (
              <Card key={l.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setAberta(l.id)}>
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{l.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{l.assunto_email || "sem assunto ainda"}</p>
                    </div>
                    <Badge variant="outline" className={`border-0 shrink-0 ${st.cls}`}>{st.label}</Badge>
                  </div>
                  <Resumo l={l} nomesEsp={nomesEsp} />
                  <div className="grid grid-cols-4 gap-1 text-center">
                    {[
                      ["Enviados", m ? m.enviados.toLocaleString("pt-BR") : "0"],
                      ["Na fila", m ? m.na_fila.toLocaleString("pt-BR") : "0"],
                      ["Abertura", m ? pct(m.abertos, m.entregues) : "—"],
                      ["Cliques", m ? pct(m.cliques, m.entregues) : "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded bg-muted/50 py-1.5">
                        <p className="text-sm font-semibold tabular-nums">{v}</p>
                        <p className="text-[10px] text-muted-foreground">{k}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>Página {pag + 1} de {totalPaginas}</span>
          <Button size="sm" variant="outline" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={pag + 1 >= totalPaginas} onClick={() => setPagina(pag + 1)}>Próxima</Button>
        </div>
      )}

      <NovaCampanhaEmailDialog open={novaOpen} onOpenChange={setNovaOpen} onCreated={(id) => setAberta(id)} />
    </div>
  );
}

function Resumo({ l, nomesEsp }: { l: Linha; nomesEsp: Map<string, string> }) {
  if (l.canal !== "email") {
    return <p className="text-xs text-muted-foreground flex items-center gap-1"><MessageCircle className="h-3 w-3" /> Médicos da campanha de WhatsApp</p>;
  }
  const esp = (l.especialidade_ids ?? []).map((id) => nomesEsp.get(id)).filter(Boolean) as string[];
  const lugar = [...(l.regiao_cidades ?? []), ...(l.regiao_estados ?? [])];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1" title={esp.join(", ")}>
        <Stethoscope className="h-3 w-3" />
        {esp.length === 0 ? "Todas as especialidades" : esp.length === 1 ? esp[0] : `${esp[0]} +${esp.length - 1}`}
      </span>
      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lugar.length ? lugar.join(", ") : "Brasil todo"}</span>
    </div>
  );
}
