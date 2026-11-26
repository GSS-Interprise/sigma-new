// Kanban da campanha Zenvia (26/11/2026). Pergunta da tela: "Desta especialidade, quem já respondeu e onde está a
// conversa?" Um cartão por médico, na etapa mais adiantada (Enviado > Entregue > Leu > Respondeu). Só leitura: as
// etapas vêm dos eventos da Zenvia, não da equipe. Quem respondeu tem a conversa no Sigma (número Zenvia) e abre em
// Conversas. Dados: RPC zenvia_campanha_kanban (migration 20261126130000).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Cartao = { telefone: string; lead_id: string | null; nome: string; etapa: Etapa; disparos: number; ultimo_em: string | null; conversa_id: string | null };
type Etapa = "nao_entregue" | "enviado" | "entregue" | "leu" | "respondeu";

const COLUNAS: { id: Etapa; nome: string; cor: string }[] = [
  { id: "respondeu", nome: "Respondeu", cor: "bg-emerald-500" },
  { id: "leu", nome: "Leu", cor: "bg-cyan-500" },
  { id: "entregue", nome: "Entregue", cor: "bg-slate-400" },
  { id: "enviado", nome: "Enviado", cor: "bg-slate-300" },
  { id: "nao_entregue", nome: "Não entregue", cor: "bg-red-400" },
];
// Coluna longa (centenas de médicos): mostra os mais recentes e avisa quantos ficaram de fora; a busca acha o resto.
const POR_COLUNA = 60;

const fmt = (n: number) => n.toLocaleString("pt-BR");
const quando = (ts: string | null) => (ts ? new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const fone = (t: string) => { const d = t.replace(/\D/g, "").replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) …${d.slice(-4)}` : t; };

export function ZenviaKanban({ especialidadeId, nome, aberto, fechar }: { especialidadeId: string | null; nome: string; aberto: boolean; fechar: () => void }) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["zenvia-kanban", especialidadeId],
    enabled: aberto,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("zenvia_campanha_kanban" as never, { p_especialidade: especialidadeId } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Cartao[];
    },
  });
  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const dig = b.replace(/\D/g, "");
    return (data ?? []).filter((c) => !b || c.nome.toLowerCase().includes(b) || (dig.length >= 3 && c.telefone.includes(dig)));
  }, [data, busca]);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{nome}</DialogTitle>
          <DialogDescription>
            {data ? `${fmt(data.length)} médicos receberam disparo pela Zenvia. Quem respondeu abre a conversa no Sigma.` : "Médicos que receberam disparo pela Zenvia."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou telefone" className="h-9 pl-9" />
        </div>
        {isLoading && <Skeleton className="h-80 w-full" />}
        {isError && <p className="text-sm text-red-700">Não deu para carregar os médicos desta campanha. Feche e abra de novo.</p>}
        {data && (
          <div className="grid min-h-0 flex-1 grid-cols-5 gap-3 overflow-hidden">
            {COLUNAS.map((col) => {
              const itens = filtrados.filter((c) => c.etapa === col.id);
              return (
                <section key={col.id} className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-muted/30">
                  <header className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${col.cor}`} aria-hidden />
                    <span className="truncate">{col.nome}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">{fmt(itens.length)}</span>
                  </header>
                  <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {itens.length === 0 && <li className="px-1 py-6 text-center text-xs text-muted-foreground">Ninguém aqui</li>}
                    {itens.slice(0, POR_COLUNA).map((c) => (
                      <li key={c.telefone}>
                        {c.conversa_id ? (
                          <button type="button" onClick={() => navigate(`/conversas?conversa=${c.conversa_id}`)}
                            className="w-full rounded-md border bg-card p-2 text-left text-sm shadow-sm transition-colors hover:border-primary/50">
                            <span className="line-clamp-2 break-words font-medium leading-snug" title={c.nome}>{c.nome}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-xs"><span className="text-muted-foreground">{fone(c.telefone)}</span><span className="ml-auto flex items-center gap-1 text-primary"><MessageCircle className="h-3 w-3 shrink-0" />Conversa</span></span>
                          </button>
                        ) : (
                          <div className="rounded-md border bg-card p-2 text-sm">
                            <span className="line-clamp-2 break-words font-medium leading-snug" title={c.nome}>{c.nome}</span>
                            <span className="text-xs text-muted-foreground">{fone(c.telefone)} · {quando(c.ultimo_em)}</span>
                          </div>
                        )}
                      </li>
                    ))}
                    {itens.length > POR_COLUNA && (
                      <li className="px-1 py-2 text-center text-xs text-muted-foreground">+{fmt(itens.length - POR_COLUNA)}: use a busca</li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
