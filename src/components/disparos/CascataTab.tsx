import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, GitBranch, Search, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  useLeadCanais,
  formatDuracao,
  tempoNaRaia,
  CanalCascata,
} from "@/hooks/useLeadCanais";

interface Props {
  campanhaPropostaId: string;
  listaId?: string | null;
}

const CANAL_LABEL: Record<CanalCascata, string> = {
  whatsapp: "WhatsApp",
  trafego_pago: "Tráfego",
  email: "Email",
  instagram: "Instagram",
  ligacao: "Ligação",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

type SortKey = "tempo_desc" | "tempo_asc" | "nome_asc" | "nome_desc";
type CanalFilter = "todos" | CanalCascata | "sem_canal";

const PAGE_SIZE_UI = 300;
const CHUNK_DB = 1000;

export function CascataTab({ campanhaPropostaId, listaId }: Props) {
  const { data: canais = [], isLoading } = useLeadCanais(campanhaPropostaId);
  const [busca, setBusca] = useState("");
  const [canalFilter, setCanalFilter] = useState<CanalFilter>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("tempo_desc");
  const [pagina, setPagina] = useState(1);

  const { data: leads = [] } = useQuery({
    queryKey: ["cascata-leads-info", listaId],
    enabled: !!listaId,
    queryFn: async () => {
      const todos: any[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("disparo_lista_itens")
          .select("lead_id, leads:lead_id(id, nome, phone_e164, status)")
          .eq("lista_id", listaId!)
          .range(offset, offset + CHUNK_DB - 1);
        if (error) throw error;
        const lote = (data || []).map((i: any) => i.leads).filter(Boolean);
        todos.push(...lote);
        if ((data || []).length < CHUNK_DB) break;
        offset += CHUNK_DB;
      }
      return todos;
    },
  });

  const porLead = useMemo(() => {
    const map = new Map<string, typeof canais>();
    for (const c of canais) {
      const arr = map.get(c.lead_id) || [];
      arr.push(c);
      map.set(c.lead_id, arr);
    }
    return map;
  }, [canais]);

  const linhas = useMemo(() => {
    const agora = Date.now();
    const enriquecidas = (leads as any[]).map((lead) => {
      const passagens = porLead.get(lead.id) || [];
      const ativa = passagens.find((p) => p.status_final === "aberto");
      const tempo = ativa
        ? Math.max(0, Math.floor((agora - new Date(ativa.entrou_em).getTime()) / 1000))
        : -1;
      return { lead, passagens, ativa, tempo };
    });

    const termo = busca.trim().toLowerCase();
    const filtradas = enriquecidas.filter(({ lead, ativa }) => {
      if (canalFilter === "sem_canal" && ativa) return false;
      if (canalFilter !== "todos" && canalFilter !== "sem_canal") {
        if (!ativa || ativa.canal !== canalFilter) return false;
      }
      if (!termo) return true;
      const nome = (lead.nome || "").toLowerCase();
      const tel = (lead.phone_e164 || "").toLowerCase();
      return nome.includes(termo) || tel.includes(termo);
    });

    filtradas.sort((a, b) => {
      switch (sortKey) {
        case "tempo_desc":
          return b.tempo - a.tempo;
        case "tempo_asc": {
          const av = a.tempo < 0 ? Number.POSITIVE_INFINITY : a.tempo;
          const bv = b.tempo < 0 ? Number.POSITIVE_INFINITY : b.tempo;
          return av - bv;
        }
        case "nome_asc":
          return (a.lead.nome || "").localeCompare(b.lead.nome || "");
        case "nome_desc":
          return (b.lead.nome || "").localeCompare(a.lead.nome || "");
      }
    });

    return filtradas;
  }, [leads, porLead, busca, canalFilter, sortKey]);

  useEffect(() => {
    setPagina(1);
  }, [busca, canalFilter, sortKey, leads.length]);

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / PAGE_SIZE_UI));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * PAGE_SIZE_UI;
  const linhasPagina = useMemo(
    () => linhas.slice(inicio, inicio + PAGE_SIZE_UI),
    [linhas, inicio]
  );

  const canaisDisponiveis = useMemo(() => {
    const set = new Set<CanalCascata>();
    for (const c of canais) set.add(c.canal);
    return Array.from(set);
  }, [canais]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Nenhum lead na lista ainda.
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
        <GitBranch className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Cascata por lead</div>
        <span className="text-xs text-muted-foreground ml-auto">
          {linhas.length} de {leads.length} lead(s) · pág. {paginaAtual}/{totalPaginas}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-background">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou telefone..."
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Select value={canalFilter} onValueChange={(v) => setCanalFilter(v as CanalFilter)}>
          <SelectTrigger className="h-8 text-xs w-[160px]">
            <SelectValue placeholder="Canal atual" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos canais</SelectItem>
            <SelectItem value="sem_canal">Sem canal ativo</SelectItem>
            {canaisDisponiveis.map((c) => (
              <SelectItem key={c} value={c}>
                {CANAL_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-8 text-xs w-[180px]">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tempo_desc">Mais tempo na raia</SelectItem>
            <SelectItem value="tempo_asc">Menos tempo na raia</SelectItem>
            <SelectItem value="nome_asc">Nome (A-Z)</SelectItem>
            <SelectItem value="nome_desc">Nome (Z-A)</SelectItem>
          </SelectContent>
        </Select>
        {(busca || canalFilter !== "todos" || sortKey !== "tempo_desc") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setBusca("");
              setCanalFilter("todos");
              setSortKey("tempo_desc");
            }}
          >
            Limpar
          </Button>
        )}
      </div>
      <ScrollArea className="h-[500px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Lead</th>
              <th className="px-4 py-2 font-semibold">Canal atual</th>
              <th className="px-4 py-2 font-semibold">Tempo na raia</th>
              <th className="px-4 py-2 font-semibold">Histórico</th>
              <th className="px-4 py-2 font-semibold">Última transferência</th>
            </tr>
          </thead>
          <tbody>
            {linhasPagina.map(({ lead, passagens, ativa }) => {
              const ultimaTransfer = [...passagens]
                .reverse()
                .find((p) => p.motivo_saida);
              return (
                <tr key={lead.id} className="border-t hover:bg-accent/40">
                  <td className="px-4 py-2">
                    <div className="font-medium">{lead.nome || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {lead.phone_e164 || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {ativa ? (
                      <Badge variant="default" className="text-[10px]">
                        {CANAL_LABEL[ativa.canal]}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sem canal ativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {ativa
                      ? formatDuracao(tempoNaRaia(ativa.entrou_em, null))
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {passagens.map((p) => (
                        <Badge
                          key={p.id}
                          variant={
                            p.status_final === "aberto" ? "default" : "outline"
                          }
                          className="text-[10px]"
                        >
                          {CANAL_LABEL[p.canal]}{" "}
                          {formatDuracao(
                            p.duracao_segundos ??
                              tempoNaRaia(p.entrou_em, p.saiu_em)
                          )}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-[240px]">
                    {ultimaTransfer?.motivo_saida ? (
                      <span title={ultimaTransfer.motivo_saida}>
                        {ultimaTransfer.motivo_saida.length > 60
                          ? ultimaTransfer.motivo_saida.slice(0, 60) + "…"
                          : ultimaTransfer.motivo_saida}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
    </Card>
  );
}