import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ConfirmDestructive } from "@/components/common/ConfirmDestructive";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Stethoscope,
  IdCard,
  Calendar,
  CheckCircle2,
  Flame,
  XCircle,
  ShieldOff,
  Ban,
  Clock,
  MessageCircle,
  Rocket,
  Plus,
  Download,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneForDisplay } from "@/lib/phoneUtils";
import { MaskedField } from "@/components/common/MaskedField";
import { maskCPF } from "@/lib/maskSensitiveData";
import { toast } from "sonner";
import { NovaCampanhaProspeccaoDialog } from "@/components/campanhas/NovaCampanhaProspeccaoDialog";

/**
 * F2.9 — Modal de perfil 360 do lead.
 *
 * Vista rapida e completa do medico pra operadora decidir como abordar
 * sem precisar trocar de tela. 5 secoes + 4 acoes:
 *
 * 1. Cabecalho: nome, foto, badges LGPD/status
 * 2. Dados basicos: phone, CPF (masked), email, cidade/UF, CRM, especialidade
 * 3. Cross-campanha: tabela das campanhas em que o lead esta/esteve
 * 4. Historico de conversas: link "Abrir conversa"
 * 5. Acoes: Abrir conversa, Nova campanha, Add Blacklist, Exportar
 *
 * Substitui o LeadProntuarioDialog na rota /leads (pra leitura rapida).
 * /medicos continua usando LeadProntuarioDialog (pra edicao completa).
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | null;
}

interface Perfil360 {
  lead_id: string;
  nome: string;
  phone_e164: string | null;
  cpf: string | null;
  crm: string | null;
  cidade: string | null;
  uf: string | null;
  classificacao: string | null;
  cooldown_ate: string | null;
  opt_out: boolean | null;
  tags: string[] | null;
  lead_criado_em: string | null;
  data_conversao: string | null;
  total_campanhas: number;
  campanhas_ativas: number;
  vezes_convertido: number;
  vezes_quente: number;
  vezes_perdido: number;
  em_blacklist: boolean;
  ultima_msg_sigzap: string | null;
}

interface CampanhaDoLead {
  campanha_id: string;
  campanha_nome: string;
  campanha_status: string;
  etapa_acompanhamento: string | null;
  status_lead: string | null;
  created_at: string;
}

interface LeadBasico {
  email: string | null;
  especialidade: string | null;
}

const CLASSIFICACOES = [
  { value: "normal", label: "Normal" },
  { value: "vip", label: "VIP — alta prioridade" },
  { value: "protegido", label: "Protegido — não dispara" },
  { value: "proibido", label: "Proibido — bloqueio total" },
] as const;

export function LeadProfile360Modal({ open, onOpenChange, leadId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [exportLoading, setExportLoading] = useState(false);
  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);

  const { data: perfil, isLoading: perfilLoading } = useQuery<Perfil360 | null>({
    queryKey: ["lead-perfil-360-modal", leadId],
    enabled: !!leadId && open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vw_lead_perfil_360")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();
      return data as Perfil360 | null;
    },
  });

  const { data: leadBasico } = useQuery<LeadBasico | null>({
    queryKey: ["lead-basico-modal", leadId],
    enabled: !!leadId && open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("leads")
        .select("email, especialidade")
        .eq("id", leadId)
        .maybeSingle();
      return data as LeadBasico | null;
    },
  });

  const { data: campanhas, isLoading: campanhasLoading } = useQuery<CampanhaDoLead[]>({
    queryKey: ["lead-campanhas-modal", leadId],
    enabled: !!leadId && open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("campanha_leads")
        .select(
          "campanha_id, etapa_acompanhamento, status, created_at, campanhas(nome, status)",
        )
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []).map((r: any) => ({
        campanha_id: r.campanha_id,
        campanha_nome: r.campanhas?.nome ?? "(sem nome)",
        campanha_status: r.campanhas?.status ?? "—",
        etapa_acompanhamento: r.etapa_acompanhamento,
        status_lead: r.status,
        created_at: r.created_at,
      }));
    },
  });

  const updateLead = useMutation({
    mutationFn: async (patch: { classificacao?: string; opt_out?: boolean }) => {
      const { error } = await (supabase as any)
        .from("leads")
        .update(patch)
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-perfil-360-modal", leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead-perfil-360", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads-paginated"] });
      toast.success("Lead atualizado");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const addBlacklist = async () => {
    if (!perfil?.phone_e164) {
      toast.error("Lead sem telefone — não dá pra adicionar na blacklist");
      return;
    }
    const { error } = await (supabase as any).from("blacklist").insert({
      phone_e164: perfil.phone_e164,
      motivo: `Adicionado via perfil 360 do lead ${perfil.nome}`,
    });
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    toast.success(`Telefone ${formatPhoneForDisplay(perfil.phone_e164)} na blacklist`);
  };

  const exportJSON = async () => {
    if (!perfil) return;
    setExportLoading(true);
    try {
      const payload = {
        perfil,
        email: leadBasico?.email,
        especialidade: leadBasico?.especialidade,
        campanhas,
        exportado_em: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lead-${perfil.nome.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Perfil exportado");
    } finally {
      setExportLoading(false);
    }
  };

  if (!leadId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Perfil 360º
          </DialogTitle>
        </DialogHeader>

        {perfilLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !perfil ? (
          <div className="p-12 text-center text-muted-foreground">
            Lead não encontrado
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 min-h-0 px-6 py-4">
              <div className="space-y-5">
                {/* 1. Cabecalho com nome + badges */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <User className="h-5 w-5 text-muted-foreground" />
                        {perfil.nome}
                      </h2>
                      {perfil.lead_criado_em && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Lead desde {format(new Date(perfil.lead_criado_em), "dd/MM/yyyy", { locale: ptBR })}
                          {" · "}
                          {formatDistanceToNow(new Date(perfil.lead_criado_em), { addSuffix: true, locale: ptBR })}
                        </p>
                      )}
                    </div>
                    {perfil.data_conversao && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Convertido
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {perfil.campanhas_ativas > 1 && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] border-indigo-200 bg-indigo-50 text-indigo-700"
                      >
                        <Layers className="h-3 w-3" />
                        Em {perfil.campanhas_ativas} campanhas
                      </Badge>
                    )}
                    {perfil.vezes_convertido > 0 && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {perfil.vezes_convertido}× convertido
                      </Badge>
                    )}
                    {perfil.vezes_quente >= 2 && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] border-red-200 bg-red-50 text-red-700"
                      >
                        <Flame className="h-3 w-3" />
                        Quente {perfil.vezes_quente}×
                      </Badge>
                    )}
                    {perfil.vezes_perdido >= 2 && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] border-slate-200 bg-slate-50 text-slate-600"
                      >
                        <XCircle className="h-3 w-3" />
                        Perdido {perfil.vezes_perdido}×
                      </Badge>
                    )}
                    {perfil.classificacao && perfil.classificacao !== "normal" && (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {perfil.classificacao}
                      </Badge>
                    )}
                    {perfil.opt_out && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] border-red-300 bg-red-50 text-red-700"
                      >
                        <ShieldOff className="h-3 w-3" />
                        Não contactar
                      </Badge>
                    )}
                    {perfil.em_blacklist && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] border-red-300 bg-red-100 text-red-800"
                      >
                        <Ban className="h-3 w-3" />
                        Blacklist
                      </Badge>
                    )}
                    {perfil.cooldown_ate && new Date(perfil.cooldown_ate) > new Date() && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] border-amber-200 bg-amber-50 text-amber-700"
                      >
                        <Clock className="h-3 w-3" />
                        Em pausa até {format(new Date(perfil.cooldown_ate), "dd/MM", { locale: ptBR })}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 2. Dados basicos em grid */}
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <IdCard className="h-4 w-4 text-muted-foreground" />
                    Dados básicos
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <DataRow icon={Phone} label="Telefone">
                      {perfil.phone_e164 ? formatPhoneForDisplay(perfil.phone_e164) : "—"}
                    </DataRow>
                    <DataRow icon={Mail} label="E-mail">
                      {leadBasico?.email || "—"}
                    </DataRow>
                    <DataRow icon={IdCard} label="CPF">
                      {perfil.cpf ? (
                        <MaskedField value={perfil.cpf} mask={maskCPF} />
                      ) : (
                        "—"
                      )}
                    </DataRow>
                    <DataRow icon={IdCard} label="CRM">
                      {perfil.crm || "—"}
                    </DataRow>
                    <DataRow icon={MapPin} label="Localização">
                      {[perfil.cidade, perfil.uf].filter(Boolean).join("/") || "—"}
                    </DataRow>
                    <DataRow icon={Stethoscope} label="Especialidade">
                      {leadBasico?.especialidade || "—"}
                    </DataRow>
                    {perfil.data_conversao && (
                      <DataRow icon={Calendar} label="Convertido em">
                        {format(new Date(perfil.data_conversao), "dd/MM/yyyy", { locale: ptBR })}
                      </DataRow>
                    )}
                  </div>
                </Card>

                {/* 3. Cross-campanha */}
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-muted-foreground" />
                    Campanhas ({perfil.total_campanhas})
                  </h3>
                  {campanhasLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : !campanhas || campanhas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nunca participou de campanhas
                    </p>
                  ) : (
                    <ul className="divide-y -my-2">
                      {campanhas.map((c) => (
                        <li key={c.campanha_id + c.created_at} className="py-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {c.campanha_nome}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  c.campanha_status === "ativa"
                                    ? "border-green-200 bg-green-50 text-green-700"
                                    : c.campanha_status === "pausada"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                {c.campanha_status}
                              </Badge>
                              {c.etapa_acompanhamento && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {c.etapa_acompanhamento}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                Entrou {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                {/* 4. Classificação LGPD editável */}
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldOff className="h-4 w-4 text-muted-foreground" />
                    Classificação e LGPD
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="classif" className="text-xs">
                        Classificação
                      </Label>
                      <Select
                        value={perfil.classificacao ?? "normal"}
                        onValueChange={(v) =>
                          updateLead.mutate({ classificacao: v })
                        }
                      >
                        <SelectTrigger id="classif">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLASSIFICACOES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        VIP recebe prioridade. Protegido e Proibido são excluídos
                        automaticamente dos novos disparos.
                      </p>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
                      <Switch
                        id="opt-out"
                        checked={perfil.opt_out ?? false}
                        onCheckedChange={(checked) =>
                          updateLead.mutate({ opt_out: checked })
                        }
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor="opt-out" className="text-xs cursor-pointer">
                          Opt-out (não contactar)
                        </Label>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          Médico pediu pra parar. LGPD — não envia nada.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* 5. Conversa */}
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    Conversa
                  </h3>
                  {perfil.ultima_msg_sigzap ? (
                    <p className="text-sm">
                      Última mensagem{" "}
                      <span className="font-medium">
                        {formatDistanceToNow(new Date(perfil.ultima_msg_sigzap), { addSuffix: true, locale: ptBR })}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        ({format(new Date(perfil.ultima_msg_sigzap), "dd/MM/yyyy HH:mm", { locale: ptBR })})
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma conversa ainda</p>
                  )}
                </Card>
              </div>
            </ScrollArea>

            {/* 5. Acoes no footer */}
            <div className="border-t bg-muted/30 px-6 py-3 flex flex-wrap items-center justify-end gap-2">
              {perfil.ultima_msg_sigzap && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/disparos/sigzap?lead=${leadId}`)}
                  className="gap-1.5"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir conversa
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNovaCampanhaOpen(true)}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Nova campanha
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportJSON}
                disabled={exportLoading}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                Exportar
              </Button>
              {!perfil.em_blacklist && perfil.phone_e164 && (
                <ConfirmDestructive
                  title={`Adicionar ${perfil.nome} na blacklist?`}
                  description={
                    <>
                      O telefone <strong>{formatPhoneForDisplay(perfil.phone_e164)}</strong> não
                      vai mais receber disparos da equipe. Use quando o médico pediu
                      explicitamente pra não receber contato (LGPD).
                    </>
                  }
                  confirmLabel="Adicionar à Blacklist"
                  onConfirm={addBlacklist}
                  trigger={
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Ban className="h-4 w-4 text-red-600" />
                      Adicionar à Blacklist
                    </Button>
                  }
                />
              )}
            </div>
          </>
        )}
      </DialogContent>

      {/* F2.9: dialog de nova campanha com lead pré-incluído */}
      <NovaCampanhaProspeccaoDialog
        open={novaCampanhaOpen}
        onOpenChange={(open) => {
          setNovaCampanhaOpen(open);
          if (!open) {
            // Fecha o modal 360 também pra voltar à listagem
            onOpenChange(false);
          }
        }}
        preLead={perfil ? { id: perfil.lead_id, nome: perfil.nome } : null}
      />
    </Dialog>
  );
}

interface DataRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}

function DataRow({ icon: Icon, label, children }: DataRowProps) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="font-medium">{children}</div>
      </div>
    </div>
  );
}
