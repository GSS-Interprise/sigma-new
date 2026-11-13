import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Loader2, Search, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { nomeProprio } from "@/lib/textoDono";

/**
 * Campanhas › LinkedIn (Fase 9.3 do plano do Maikon) — pergunta da tela: "quem eu chamo hoje no LinkedIn, e com que
 * texto?". Decisão por linha: abrir o perfil, colar o convite e marcar "Feito" (ou pular).
 * Modo assistido: a pessoa envia pela própria conta. Com conta conectada pela Unipile, o mesmo toque passa a ser
 * automático (motor da 9.4). Instagram fica fora até o Maikon definir o uso (decisão do Raul, 13/11).
 * Ritmo seguro de convites com nota: 15 por dia por pessoa (docs/arquitetura/linkedin-instagram-campanha.md).
 */

const META_DIA = 15;

type Item = {
  campanha_lead_id: string; campanha: string; status: string; lead_id: string; nome: string; especialidade: string | null;
  cidade: string | null; uf: string | null; cidade_vaga: string | null; servico: string | null; url_perfil: string; confianca: number | null;
};
type Fila = { feitos_hoje: number; meus_hoje: number; com_perfil: number; sem_busca: number; itens: Item[] };

const STATUS: Record<string, string> = { quente: "Quente", em_conversa: "Em conversa", contatado: "Sem resposta no WhatsApp" };

function primeiroNome(nome: string) {
  return nomeProprio(nome).split(/\s+/)[0] || "";
}

function especialidadeCurta(e: string | null) {
  return String(e || "").replace(/^&/, "").split(/ - RQE|\(/)[0].trim().toLowerCase();
}

// Nota do convite: até 300 caracteres (limite do LinkedIn para conta paga; conta grátis tem poucas notas por mês).
export function textoConvite(i: Item) {
  const esp = especialidadeCurta(i.especialidade);
  const onde = i.cidade_vaga?.trim() || "Santa Catarina";
  const t = `Olá, Dr(a). ${primeiroNome(i.nome)}! Sou o Dr. Maikon Madeira, cirurgião cardiovascular e sócio da GSS Saúde. `
    + `Temos plantões ${esp ? `de ${esp} ` : ""}em ${onde} e gostaria de me conectar para te passar os detalhes. Faz sentido para você?`;
  return t.length > 300 ? t.slice(0, 297) + "..." : t;
}

export function FilaLinkedin() {
  const qc = useQueryClient();
  const [buscando, setBuscando] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["fila-redes", "linkedin"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fila_redes_do_dia", { p_canal: "linkedin", p_limite: 30 });
      if (error) throw error;
      return data as Fila;
    },
  });

  const registrar = useMutation({
    mutationFn: async (v: { item: Item; status: "feito" | "pulado" }) => {
      const { error } = await (supabase as any).rpc("fila_redes_registrar", {
        p_campanha_lead_id: v.item.campanha_lead_id, p_canal: "linkedin", p_status: v.status,
        p_texto: v.status === "feito" ? textoConvite(v.item) : null, p_url: v.item.url_perfil,
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      toast.success(v.status === "feito" ? `Convite para ${nomeProprio(v.item.nome)} registrado. Fica na linha do tempo do lead.` : "Pulado. Não volta para a fila.");
      qc.invalidateQueries({ queryKey: ["fila-redes", "linkedin"] });
    },
    onError: (e: Error) => toast.error(`Não deu para registrar: ${e.message}`),
  });

  // Busca de perfil dos leads quentes e em conversa das campanhas ativas (roda em segundo plano na edge).
  const buscarPerfis = async () => {
    setBuscando(true);
    try {
      const { data: camps } = await supabase.from("campanhas").select("id").eq("status", "ativa");
      const ids = (camps ?? []).map((c: any) => c.id);
      await Promise.all(ids.map((id: string) => supabase.functions.invoke("redes-sociais-buscar", { body: { campanha_id: id, limite: 20 } })));
      toast.success("Busca de perfis iniciada. Os achados aparecem aqui em alguns minutos.");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["fila-redes", "linkedin"] }), 60_000);
    } catch (e: any) {
      toast.error(`A busca não começou: ${e.message}`);
    } finally {
      setBuscando(false);
    }
  };

  const meus = data?.meus_hoje ?? 0;
  const restante = Math.max(META_DIA - meus, 0);
  const itens = useMemo(() => data?.itens ?? [], [data]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <Card className="p-5 text-sm text-destructive">Não deu para carregar a fila: {(error as Error).message}</Card>;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seus convites hoje</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{meus} <span className="text-base font-normal text-muted-foreground">de {META_DIA}</span></p>
          <p className="mt-1 text-sm text-muted-foreground">
            {restante > 0 ? `Faltam ${restante} para o ritmo seguro do dia.` : "Ritmo do dia cumprido. Mais que isso arrisca a conta."}
          </p>
        </div>
        <div className="text-right">
          <Button variant="outline" className="h-9" onClick={buscarPerfis} disabled={buscando}>
            {buscando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
            Buscar perfis dos leads
          </Button>
          {(data?.sem_busca ?? 0) > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{data!.sem_busca} leads quentes ou em conversa ainda sem busca</p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-base font-semibold">Para chamar no LinkedIn</h3>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguém na fila agora. Clique em "Buscar perfis dos leads" para achar o LinkedIn de quem está nas campanhas ativas.
          </p>
        ) : (
          <ul className="divide-y">
            {itens.map((i) => (
              <LinhaFila key={i.campanha_lead_id} item={i} bloqueado={registrar.isPending}
                onFeito={() => registrar.mutate({ item: i, status: "feito" })}
                onPular={() => registrar.mutate({ item: i, status: "pulado" })} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LinhaFila({ item, bloqueado, onFeito, onPular }: { item: Item; bloqueado: boolean; onFeito: () => void; onPular: () => void }) {
  const texto = textoConvite(item);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast.success("Convite copiado. Cole na nota do convite no LinkedIn."); }
    catch { toast.error("Não deu para copiar. Selecione o texto e copie à mão."); }
  };
  return (
    <li className="grid grid-cols-1 gap-3 py-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] xl:items-start">
      <div className="min-w-0">
        <p className="truncate font-medium" title={nomeProprio(item.nome)}>{nomeProprio(item.nome)}</p>
        <p className="truncate text-sm text-muted-foreground" title={item.campanha}>{especialidadeCurta(item.especialidade) || "—"} · {item.campanha.trim()}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {STATUS[item.status] ?? item.status}{item.confianca ? ` · perfil ${item.confianca}% confiável` : ""}
        </p>
      </div>
      <p className="rounded-md bg-muted/60 px-3 py-2 text-sm leading-snug">{texto}</p>
      <div className="flex flex-wrap gap-2 xl:justify-end">
        <Button asChild size="sm" variant="outline" className="h-8">
          <a href={item.url_perfil} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir perfil</a>
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={copiar}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar convite</Button>
        <Button size="sm" className="h-8" disabled={bloqueado} onClick={onFeito}><Check className="mr-1.5 h-3.5 w-3.5" />Feito</Button>
        <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={bloqueado} onClick={onPular} title="Não é a pessoa certa ou não vale chamar">
          <SkipForward className="mr-1.5 h-3.5 w-3.5" />Pular
        </Button>
      </div>
    </li>
  );
}
