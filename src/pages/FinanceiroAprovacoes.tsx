import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Users,
  CalendarDays,
  ChevronDown,
  History,
  Loader2,
  Wallet,
} from "lucide-react";

// Tela de APROVAÇÕES do fechamento mensal (usada por João / diretoria).
// Lê financeiro_fechamentos aguardando aprovação, permite Aprovar/Rejeitar,
// e ao aprovar posta no canal de Comprovantes (aciona push da Thais).

type Fechamento = {
  id: string;
  mes_referencia: number;
  ano_referencia: number;
  status: string;
  total: number | null;
  qtd_medicos: number | null;
  observacoes: string | null;
  criado_por: string | null;
  criado_em: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string | null;
};

const fmtBRL = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const comp = (f: Pick<Fechamento, "mes_referencia" | "ano_referencia">) =>
  `${String(f.mes_referencia).padStart(2, "0")}/${f.ano_referencia}`;

const fmtData = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

// Posta uma mensagem no canal de Comprovantes (config financeiro_canal_comprovantes_id)
// e notifica os participantes — esse insert de notificação dispara o Web Push.
async function postarNoCanalComprovantes(mensagem: string) {
  const { data: cfg } = await (supabase as any)
    .from("config_lista_items")
    .select("valor")
    .eq("campo_nome", "financeiro_canal_comprovantes_id")
    .maybeSingle();
  const canalId = cfg?.valor as string | undefined;
  if (!canalId) return { posted: false, motivo: "nao_configurado" };

  const { data: uRes } = await supabase.auth.getUser();
  const uid = uRes?.user?.id;
  const nome =
    (uRes?.user?.user_metadata as any)?.nome_completo ||
    (uRes?.user?.user_metadata as any)?.nome ||
    "Financeiro";

  const { data: m, error } = await (supabase as any)
    .from("comunicacao_mensagens")
    .insert({ canal_id: canalId, user_id: uid, user_nome: nome, mensagem })
    .select("id")
    .single();
  if (error || !m) return { posted: false, motivo: "falha" };

  const { data: parts } = await (supabase as any)
    .from("comunicacao_participantes")
    .select("user_id")
    .eq("canal_id", canalId);
  const notifs = (parts ?? [])
    .filter((p: any) => p.user_id !== uid)
    .map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id }));
  if (notifs.length) {
    await (supabase as any).from("comunicacao_notificacoes").insert(notifs);
  }
  return { posted: true };
}

export default function FinanceiroAprovacoes() {
  const queryClient = useQueryClient();
  const [rejeitando, setRejeitando] = useState<Fechamento | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  const { data: pendentes = [], isLoading } = useQuery({
    queryKey: ["financeiro-fechamentos", "aguardando_aprovacao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("financeiro_fechamentos")
        .select("*")
        .eq("status", "aguardando_aprovacao")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fechamento[];
    },
  });

  const { data: historico = [] } = useQuery({
    queryKey: ["financeiro-fechamentos", "historico"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("financeiro_fechamentos")
        .select("*")
        .in("status", ["aprovado", "pago", "cancelado"])
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as Fechamento[];
    },
  });

  const aprovar = useMutation({
    mutationFn: async (f: Fechamento) => {
      const { data: uRes } = await supabase.auth.getUser();
      const uid = uRes?.user?.id ?? null;
      const nome =
        (uRes?.user?.user_metadata as any)?.nome_completo ||
        (uRes?.user?.user_metadata as any)?.nome ||
        "Diretoria";
      const { error } = await (supabase as any)
        .from("financeiro_fechamentos")
        .update({
          status: "aprovado",
          aprovado_por: uid,
          aprovado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", f.id);
      if (error) throw error;

      const msg =
        `✅ *Fechamento ${comp(f)} aprovado* por ${nome} — ` +
        `${fmtBRL(f.total)}, ${f.qtd_medicos || 0} médico(s).\n` +
        `Thais, suba os comprovantes em /financeiro/comprovantes`;
      const r = await postarNoCanalComprovantes(msg);
      return r;
    },
    onSuccess: (r) => {
      if (r?.posted) {
        toast.success("Fechamento aprovado e avisado no canal de Comprovantes.");
      } else if ((r as any)?.motivo === "falha") {
        toast.warning("Fechamento aprovado, mas falhou ao avisar no canal de Comprovantes — avise a Thais manualmente.");
      } else {
        toast.success("Fechamento aprovado. (Canal de Comprovantes não configurado — config_lista_items.financeiro_canal_comprovantes_id)");
      }
      queryClient.invalidateQueries({ queryKey: ["financeiro-fechamentos"] });
    },
    onError: (e: any) => toast.error("Erro ao aprovar: " + (e?.message || "")),
  });

  const rejeitar = useMutation({
    mutationFn: async ({ f, motivo }: { f: Fechamento; motivo: string }) => {
      const obs = [f.observacoes, motivo ? `Rejeitado: ${motivo}` : "Rejeitado"]
        .filter(Boolean)
        .join("\n");
      const { error } = await (supabase as any)
        .from("financeiro_fechamentos")
        .update({
          status: "cancelado",
          observacoes: obs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fechamento rejeitado.");
      setRejeitando(null);
      setMotivoRejeicao("");
      queryClient.invalidateQueries({ queryKey: ["financeiro-fechamentos"] });
    },
    onError: (e: any) => toast.error("Erro ao rejeitar: " + (e?.message || "")),
  });

  const statusBadge = (s: string) => {
    if (s === "aprovado")
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Aprovado</Badge>;
    if (s === "pago")
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Pago</Badge>;
    if (s === "cancelado")
      return <Badge variant="outline" className="border-red-300 text-red-700">Rejeitado</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  const headerActions = (
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold truncate">Aprovações Financeiras</h1>
      <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
        Fechamentos mensais aguardando sua aprovação
      </p>
    </div>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : pendentes.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-medium">Nenhum fechamento aguardando aprovação</p>
              <p className="text-sm text-muted-foreground">
                Quando o financeiro fechar um mês, ele aparece aqui pra você aprovar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendentes.map((f) => {
              const loading = aprovar.isPending && aprovar.variables?.id === f.id;
              return (
                <Card key={f.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-primary shrink-0" />
                        Competência {comp(f)}
                      </CardTitle>
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 shrink-0">
                        Aguardando
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-xl font-bold text-primary break-words">{fmtBRL(f.total)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" /> Médicos
                        </p>
                        <p className="text-xl font-bold">{f.qtd_medicos || 0}</p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Fechado em {fmtData(f.criado_em || f.created_at)}
                    </p>

                    {f.observacoes && (
                      <p className="text-sm bg-muted/40 rounded-md p-2 whitespace-pre-wrap">
                        {f.observacoes}
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        size="lg"
                        className="w-full sm:flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700"
                        disabled={loading || rejeitar.isPending}
                        onClick={() => aprovar.mutate(f)}
                      >
                        {loading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="h-5 w-5 mr-1" /> Aprovar
                          </>
                        )}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full sm:w-auto h-12 text-base text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        disabled={loading || rejeitar.isPending}
                        onClick={() => {
                          setRejeitando(f);
                          setMotivoRejeicao("");
                        }}
                      >
                        <XCircle className="h-5 w-5 mr-1" /> Rejeitar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Histórico curto colapsável */}
        {historico.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between h-11 mt-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <History className="h-4 w-4" /> Histórico ({historico.length})
                </span>
                <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {historico.map((f) => (
                <Card key={f.id}>
                  <CardContent className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">Competência {comp(f)}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtBRL(f.total)} · {f.qtd_medicos || 0} médico(s)
                        {f.aprovado_em ? ` · ${fmtData(f.aprovado_em)}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0">{statusBadge(f.status)}</div>
                  </CardContent>
                </Card>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* Dialog de rejeição */}
      <Dialog open={!!rejeitando} onOpenChange={(o) => !o && setRejeitando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Rejeitar fechamento {rejeitando ? comp(rejeitando) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Descreva o motivo (opcional) — fica registrado nas observações do fechamento.
            </p>
            <Textarea
              placeholder="Ex.: valores divergentes na unidade X, revisar antes de reenviar."
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              className="min-h-[100px] text-base"
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setRejeitando(null)}
              disabled={rejeitar.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={rejeitar.isPending}
              onClick={() =>
                rejeitando && rejeitar.mutate({ f: rejeitando, motivo: motivoRejeicao.trim() })
              }
            >
              {rejeitar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirmar rejeição"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
