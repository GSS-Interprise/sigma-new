import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  CheckCircle2,
  Flame,
  XCircle,
  ShieldOff,
  Ban,
  Clock,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Perfil360 {
  lead_id: string;
  classificacao: string | null;
  cooldown_ate: string | null;
  opt_out: boolean | null;
  data_conversao: string | null;
  total_campanhas: number;
  campanhas_ativas: number;
  vezes_convertido: number;
  vezes_quente: number;
  vezes_perdido: number;
  em_blacklist: boolean;
  ultima_msg_sigzap: string | null;
}

interface Props {
  leadId: string;
}

/**
 * F2.9 — Card de identidade 360º do lead.
 *
 * Mostra contexto cross-campanha + LGPD + atividade pra a operadora
 * decidir como abordar sem precisar trocar de tela. Aparece no header
 * do painel do Acompanhamento.
 *
 * Sinais que aparecem só quando relevantes (zero ruído):
 * - Badge campanhas se em múltiplas
 * - Badge VIP/Protegido/Proibido se classificado
 * - Alerta blacklist se telefone bloqueado
 * - Alerta opt-out se médico pediu pra não receber
 * - Cooldown ativo se aplicável
 * - Conversões anteriores se já fechou negócio antes
 */
export function LeadIdentidadeCard({ leadId }: Props) {
  const { data: perfil } = useQuery({
    queryKey: ["lead-perfil-360", leadId],
    queryFn: async (): Promise<Perfil360 | null> => {
      const { data } = await (supabase as any)
        .from("vw_lead_perfil_360")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();
      return data as Perfil360 | null;
    },
    staleTime: 60_000,
    enabled: !!leadId,
  });

  if (!perfil) return null;

  const sinais: React.ReactNode[] = [];

  // Múltiplas campanhas — sinal útil
  if (perfil.campanhas_ativas > 1) {
    sinais.push(
      <Badge
        key="multi-camp"
        variant="outline"
        className="gap-1 text-[10px] border-indigo-200 bg-indigo-50 text-indigo-700"
        title="Lead está em múltiplas campanhas ativas — coordenar abordagem"
      >
        <Layers className="h-3 w-3" />
        Em {perfil.campanhas_ativas} campanhas
      </Badge>
    );
  }

  // Já foi convertido antes
  if (perfil.vezes_convertido > 0) {
    sinais.push(
      <Badge
        key="convertido"
        variant="outline"
        className="gap-1 text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700"
        title="Lead já fechou negócio com GSS anteriormente"
      >
        <CheckCircle2 className="h-3 w-3" />
        {perfil.vezes_convertido}× convertido
      </Badge>
    );
  }

  // Quente recorrente (perdeu várias vezes ou tá quente em paralelo)
  if (perfil.vezes_perdido >= 2) {
    sinais.push(
      <Badge
        key="perdido-recorr"
        variant="outline"
        className="gap-1 text-[10px] border-slate-200 bg-slate-50 text-slate-600"
        title={`Lead já foi marcado como perdido ${perfil.vezes_perdido} vez(es) em campanhas anteriores`}
      >
        <XCircle className="h-3 w-3" />
        Perdeu {perfil.vezes_perdido}×
      </Badge>
    );
  }

  if (perfil.vezes_quente >= 3) {
    sinais.push(
      <Badge
        key="quente-recorr"
        variant="outline"
        className="gap-1 text-[10px] border-red-200 bg-red-50 text-red-700"
        title="Lead virou quente várias vezes — alto interesse"
      >
        <Flame className="h-3 w-3" />
        Quente {perfil.vezes_quente}×
      </Badge>
    );
  }

  // LGPD: classificação especial
  if (perfil.classificacao && perfil.classificacao !== "normal") {
    const corClassif: Record<string, string> = {
      vip: "border-amber-300 bg-amber-50 text-amber-800",
      protegido: "border-blue-300 bg-blue-50 text-blue-800",
      proibido: "border-red-300 bg-red-50 text-red-800",
    };
    sinais.push(
      <Badge
        key="classif"
        variant="outline"
        className={cn("gap-1 text-[10px] uppercase", corClassif[perfil.classificacao] ?? "")}
      >
        {perfil.classificacao}
      </Badge>
    );
  }

  if (perfil.opt_out) {
    sinais.push(
      <Badge
        key="optout"
        variant="outline"
        className="gap-1 text-[10px] border-red-300 bg-red-50 text-red-700"
        title="Lead pediu para não receber mais contato — LGPD"
      >
        <ShieldOff className="h-3 w-3" />
        Não contactar
      </Badge>
    );
  }

  if (perfil.em_blacklist) {
    sinais.push(
      <Badge
        key="blacklist"
        variant="outline"
        className="gap-1 text-[10px] border-red-300 bg-red-100 text-red-800"
        title="Telefone na blacklist — não disparar"
      >
        <Ban className="h-3 w-3" />
        Blacklist
      </Badge>
    );
  }

  if (perfil.cooldown_ate && new Date(perfil.cooldown_ate) > new Date()) {
    sinais.push(
      <Badge
        key="cooldown"
        variant="outline"
        className="gap-1 text-[10px] border-amber-200 bg-amber-50 text-amber-700"
        title={`Lead em cooldown até ${new Date(perfil.cooldown_ate).toLocaleDateString("pt-BR")}`}
      >
        <Clock className="h-3 w-3" />
        Em pausa
      </Badge>
    );
  }

  if (perfil.ultima_msg_sigzap) {
    sinais.push(
      <Badge
        key="ultima"
        variant="outline"
        className="gap-1 text-[10px]"
        title={`Última conversa em ${new Date(perfil.ultima_msg_sigzap).toLocaleString("pt-BR")}`}
      >
        <MessageCircle className="h-3 w-3" />
        Conversa {formatDistanceToNow(new Date(perfil.ultima_msg_sigzap), { addSuffix: true, locale: ptBR })}
      </Badge>
    );
  }

  if (sinais.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-2 border-t border-border/50">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">
        Contexto 360º
      </span>
      {sinais}
    </div>
  );
}
