import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Ban,
  BatteryWarning,
  CheckCircle2,
  Loader2,
  MessageSquareOff,
  PencilLine,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Wifi,
  WifiOff,
  History,
  ClipboardCheck,
} from "lucide-react";

type OperationalState =
  | "unknown"
  | "operational"
  | "disconnected"
  | "restricted_web"
  | "restricted_new_chats"
  | "restricted_temporary"
  | "banned"
  | "device_unavailable"
  | "qr_error";

type Chip = {
  id: string;
  nome: string;
  connection_state: string;
  pode_disparar: boolean | null;
  categoria_uso: string | null;
  provedor: string | null;
  fase: string | null;
  estado_desde: string | null;
  usavel: boolean;
  ultima_queda: string | null;
  quedas_24h: number;
  restricoes_30d: number;
  health: number;
  operational_state: OperationalState;
  restriction_until: string | null;
  operational_note: string | null;
};

type OpenContingency = {
  id: string;
  chip_id: string;
  reason: string;
  started_at: string;
};

type DailyCheck = {
  chip_id: string;
  check_id: string | null;
  checked_at: string | null;
  all_ok: boolean;
  notes: string | null;
  device_available: boolean | null;
  battery_ok: boolean | null;
  signal_ok: boolean | null;
  whatsapp_ok: boolean | null;
  evolution_ok: boolean | null;
  send_receive_test_ok: boolean | null;
};

type IconComponent = typeof Wifi;

function haQuanto(ts: string | null): string {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}min`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const CONNECTION_STATE: Record<string, { label: string; icon: IconComponent; className: string; dot: string }> = {
  open: { label: "Conectado", icon: Wifi, className: "text-emerald-600", dot: "#15994f" },
  connecting: { label: "Conectando", icon: Loader2, className: "text-amber-600", dot: "#d97706" },
  close: { label: "Caído (QR)", icon: WifiOff, className: "text-red-600", dot: "#dc2626" },
};

const OPERATIONAL_STATE: Record<OperationalState, {
  label: string;
  description: string;
  icon: IconComponent;
  className: string;
}> = {
  unknown: { label: "A verificar", description: "Situação ainda não classificada", icon: AlertTriangle, className: "border-slate-200 bg-slate-50 text-slate-700" },
  operational: { label: "Operacional", description: "Envia, recebe e conecta no Sigma", icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  disconnected: { label: "Desconectado", description: "Sessão fora do ar; precisa reconectar", icon: WifiOff, className: "border-red-200 bg-red-50 text-red-700" },
  restricted_web: { label: "Restrito no Web", description: "Funciona no aparelho, mas não conecta no Sigma/Web", icon: ShieldAlert, className: "border-orange-200 bg-orange-50 text-orange-700" },
  restricted_new_chats: { label: "Sem novas conversas", description: "Responde contatos existentes, mas não inicia novos", icon: MessageSquareOff, className: "border-amber-200 bg-amber-50 text-amber-700" },
  restricted_temporary: { label: "Restrição temporária", description: "Bloqueio com prazo conhecido", icon: ShieldAlert, className: "border-orange-200 bg-orange-50 text-orange-700" },
  banned: { label: "Banido", description: "Número precisa ser substituído", icon: Ban, className: "border-red-300 bg-red-100 text-red-800" },
  device_unavailable: { label: "Aparelho indisponível", description: "Bateria, aparelho ou acesso físico", icon: BatteryWarning, className: "border-slate-200 bg-slate-50 text-slate-700" },
  qr_error: { label: "Erro no QR Code", description: "Leitura ou pareamento falhou", icon: QrCode, className: "border-violet-200 bg-violet-50 text-violet-700" },
};

export default function ChipsSaude() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Chip | null>(null);
  const { data: chips = [], isLoading, isFetching } = useQuery({
    queryKey: ["chips-saude"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_chip_saude" as never).select("*");
      if (error) throw error;
      return (data ?? []) as Chip[];
    },
  });
  const { data: contingencies = [] } = useQuery({
    queryKey: ["chip-device-contingencies-open"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chip_device_contingencies" as never)
        .select("id, chip_id, reason, started_at")
        .is("ended_at", null);
      if (error) throw error;
      return (data ?? []) as OpenContingency[];
    },
  });
  const { data: dailyChecks = [] } = useQuery({
    queryKey: ["chip-daily-check-status"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_chip_daily_check_status" as never)
        .select("chip_id, check_id, checked_at, all_ok, notes, device_available, battery_ok, signal_ok, whatsapp_ok, evolution_ok, send_receive_test_ok");
      if (error) throw error;
      return (data ?? []) as DailyCheck[];
    },
  });
  const contingencyByChip = new Map(contingencies.map((item) => [item.chip_id, item]));
  const dailyCheckByChip = new Map(dailyChecks.map((item) => [item.chip_id, item]));

  const sorted = [...chips].sort((a, b) => {
    const rank = (chip: Chip) => (chip.usavel ? 0 : chip.connection_state === "connecting" ? 1 : 2);
    return rank(a) - rank(b) || a.nome.localeCompare(b.nome);
  });
  const connected = chips.filter((chip) => chip.connection_state === "open").length;
  const usable = chips.filter((chip) => chip.usavel).length;
  const disconnected = chips.filter((chip) => chip.connection_state === "close").length;
  const restricted = chips.filter((chip) => chip.operational_state?.startsWith("restricted")).length;
  const checkedToday = dailyChecks.filter((item) => item.check_id).length;

  const sincronizar = async () => {
    try {
      await supabase.functions.invoke("chip-auto-reconnect", {});
      toast.success("Sincronização disparada — atualizando…");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["chips-saude"] }), 4000);
    } catch (error: unknown) {
      toast.error(`Falha ao sincronizar: ${error instanceof Error ? error.message : ""}`);
    }
  };

  return (
    <AppLayout
      headerActions={
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2 truncate">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
              Saúde dos Chips
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Capacidade, restrições e aparelhos que precisam de ação
            </p>
          </div>
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={sincronizar} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CapacityCard icon={CheckCircle2} label="Disparando agora" value={usable} total={chips.length} color="#15994f" />
          <CapacityCard icon={Wifi} label="Conectados" value={connected} total={chips.length} color="#2563eb" />
          <CapacityCard icon={ShieldAlert} label="Com restrição" value={restricted} total={chips.length} color="#d97706" />
          <CapacityCard icon={QrCode} label="Precisam de QR" value={disconnected} total={chips.length} color="#dc2626" />
        </div>
        <div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Checklist de hoje: <strong>{checkedToday} de {chips.length}</strong> chips verificados.
            Abra a ação de cada chip para registrar aparelho, sinal, WhatsApp, Evolution e teste de mensagem.
          </span>
        </div>

        {disconnected > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <b>{disconnected} chip(s) caídos</b> precisam ser classificados ou reconectados. O estado da conexão não substitui a situação real observada no aparelho.
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b bg-muted/30">
                    <th className="py-2.5 px-4 font-medium">Chip</th>
                    <th className="py-2.5 px-2 font-medium">Conexão</th>
                    <th className="py-2.5 px-2 font-medium">Situação operacional</th>
                    <th className="py-2.5 px-2 font-medium">Há</th>
                    <th className="py-2.5 px-2 font-medium">Fase</th>
                    <th className="py-2.5 px-2 font-medium text-center">Dispara?</th>
                    <th className="py-2.5 px-2 font-medium text-right">Quedas 24h</th>
                    <th className="py-2.5 px-2 font-medium text-right">Restrições 30d</th>
                    <th className="py-2.5 px-2 font-medium text-right">Health</th>
                    <th className="py-2.5 px-4 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((chip) => {
                    const connection = CONNECTION_STATE[chip.connection_state] || {
                      label: chip.connection_state,
                      icon: Smartphone,
                      className: "text-slate-500",
                      dot: "#64748b",
                    };
                    const ConnectionIcon = connection.icon;
                    const operational = OPERATIONAL_STATE[chip.operational_state] || OPERATIONAL_STATE.unknown;
                    const OperationalIcon = operational.icon;
                    return (
                      <tr key={chip.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2.5 px-4">
                          <div className="font-medium flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: connection.dot }} />
                            {chip.nome}
                          </div>
                          <div className="text-[11px] text-muted-foreground ml-4">
                            {chip.categoria_uso || "—"}{chip.provedor === "uazapi" ? " · uazapi" : ""}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`inline-flex items-center gap-1 ${connection.className}`}>
                            <ConnectionIcon className={`h-3.5 w-3.5 ${chip.connection_state === "connecting" ? "animate-spin" : ""}`} />
                            {connection.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 min-w-[220px]">
                          <Badge variant="outline" className={`gap-1 ${operational.className}`}>
                            <OperationalIcon className="h-3 w-3" />
                            {operational.label}
                          </Badge>
                          {chip.restriction_until && (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              até {new Date(chip.restriction_until).toLocaleString("pt-BR")}
                            </div>
                          )}
                          {chip.operational_note && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[260px] truncate" title={chip.operational_note}>
                              {chip.operational_note}
                            </div>
                          )}
                          {contingencyByChip.has(chip.id) && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-violet-700">
                              <History className="h-3 w-3" />
                              Operação pelo aparelho
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground">{haQuanto(chip.estado_desde)}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{chip.fase || "—"}</td>
                        <td className="py-2.5 px-2 text-center">
                          {chip.usavel ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {chip.quedas_24h > 0 ? <span className="text-amber-600">{chip.quedas_24h}</span> : "0"}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {chip.restricoes_30d > 0 ? <span className="text-orange-600">{chip.restricoes_30d}</span> : "0"}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <span className={chip.health >= 60 ? "text-red-600" : chip.health >= 30 ? "text-amber-600" : "text-emerald-600"}>
                            {chip.health}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 sm:h-10 sm:w-10"
                            onClick={() => setEditando(chip)}
                            title="Classificar situação"
                          >
                            <PencilLine className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
        <p className="text-xs text-muted-foreground">
          Atualiza sozinho a cada 1 min. “Conexão” vem da Evolution; “Situação operacional” informa restrição, aparelho ou QR. “Dispara?” exige ambos saudáveis.
        </p>
      </div>
      <ClassificarChipDialog
        chip={editando}
        contingency={editando ? contingencyByChip.get(editando.id) || null : null}
        dailyCheck={editando ? dailyCheckByChip.get(editando.id) || null : null}
        onClose={() => setEditando(null)}
      />
    </AppLayout>
  );
}

function ClassificarChipDialog({
  chip,
  contingency,
  dailyCheck,
  onClose,
}: {
  chip: Chip | null;
  contingency: OpenContingency | null;
  dailyCheck: DailyCheck | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<OperationalState>("unknown");
  const [restrictionUntil, setRestrictionUntil] = useState("");
  const [note, setNote] = useState("");
  const [contingencyReason, setContingencyReason] = useState("");
  const [checklist, setChecklist] = useState({
    deviceAvailable: false,
    batteryOk: false,
    signalOk: false,
    whatsappOk: false,
    evolutionOk: false,
    sendReceiveTestOk: false,
  });

  useEffect(() => {
    if (!chip) return;
    setState(chip.operational_state || "unknown");
    setRestrictionUntil(chip.restriction_until?.slice(0, 16) || "");
    setNote(chip.operational_note || "");
    setContingencyReason("");
    setChecklist({
      deviceAvailable: dailyCheck?.device_available === true,
      batteryOk: dailyCheck?.battery_ok === true,
      signalOk: dailyCheck?.signal_ok === true,
      whatsappOk: dailyCheck?.whatsapp_ok === true,
      evolutionOk: dailyCheck?.evolution_ok === true,
      sendReceiveTestOk: dailyCheck?.send_receive_test_ok === true,
    });
  }, [chip, dailyCheck]);

  const salvarChecklist = useMutation({
    mutationFn: async () => {
      if (!chip) return;
      const { error } = await supabase.rpc(
        "save_chip_daily_check" as never,
        {
          p_chip_id: chip.id,
          p_device_available: checklist.deviceAvailable,
          p_battery_ok: checklist.batteryOk,
          p_signal_ok: checklist.signalOk,
          p_whatsapp_ok: checklist.whatsappOk,
          p_evolution_ok: checklist.evolutionOk,
          p_send_receive_test_ok: checklist.sendReceiveTestOk,
          p_notes: note.trim() || null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Checklist diário registrado");
      await queryClient.invalidateQueries({ queryKey: ["chip-daily-check-status"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar o checklist"),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!chip) return;
      const { error } = await supabase.from("chips").update({
        operational_state: state,
        restriction_until: state === "restricted_temporary" && restrictionUntil
          ? new Date(restrictionUntil).toISOString()
          : null,
        operational_note: note.trim() || null,
      } as never).eq("id", chip.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação do chip atualizada");
      queryClient.invalidateQueries({ queryKey: ["chips-saude"] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível atualizar o chip"),
  });

  const iniciarContingencia = useMutation({
    mutationFn: async () => {
      if (!chip || contingencyReason.trim().length < 3) return;
      const { error } = await supabase.rpc(
        "begin_chip_device_contingency" as never,
        {
          p_chip_id: chip.id,
          p_reason: contingencyReason.trim(),
          p_notes: note.trim() || null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Contingência iniciada e registrada");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chips-saude"] }),
        queryClient.invalidateQueries({ queryKey: ["chip-device-contingencies-open"] }),
      ]);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível iniciar a contingência"),
  });

  const encerrarContingencia = useMutation({
    mutationFn: async () => {
      if (!contingency) return;
      const { error } = await supabase.rpc(
        "end_chip_device_contingency" as never,
        { p_contingency_id: contingency.id, p_notes: note.trim() || null } as never,
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Contingência encerrada; importação do histórico foi agendada");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chips-saude"] }),
        queryClient.invalidateQueries({ queryKey: ["chip-device-contingencies-open"] }),
      ]);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível encerrar a contingência"),
  });

  return (
    <Dialog open={!!chip} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Classificar {chip?.nome}</DialogTitle>
          <DialogDescription>
            Registre o que o aparelho realmente permite. Cada alteração entra no histórico do chip.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="operational-state">Situação operacional</Label>
            <Select value={state} onValueChange={(value) => setState(value as OperationalState)}>
              <SelectTrigger id="operational-state" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(OPERATIONAL_STATE) as Array<[OperationalState, typeof OPERATIONAL_STATE[OperationalState]]>).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    <span className="font-medium">{meta.label}</span>
                    <span className="hidden sm:inline text-muted-foreground"> — {meta.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-violet-800">
              <History className="h-4 w-4" />
              Contingência pelo aparelho
            </div>
            {contingency ? (
              <div className="mt-2 space-y-3 text-sm">
                <p>
                  Aberta em {new Date(contingency.started_at).toLocaleString("pt-BR")}:{" "}
                  <strong>{contingency.reason}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Ao encerrar, o Sigma agenda automaticamente a importação das mensagens feitas no aparelho.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full border-violet-300"
                  disabled={encerrarContingencia.isPending}
                  onClick={() => encerrarContingencia.mutate()}
                >
                  {encerrarContingencia.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Encerrar e sincronizar histórico
                </Button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <Label htmlFor="contingency-reason">Motivo para operar no aparelho</Label>
                <Input
                  id="contingency-reason"
                  className="min-h-11"
                  value={contingencyReason}
                  onChange={(event) => setContingencyReason(event.target.value)}
                  placeholder="Ex.: WhatsApp Web restrito"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full border-violet-300"
                  disabled={contingencyReason.trim().length < 3 || iniciarContingencia.isPending}
                  onClick={() => iniciarContingencia.mutate()}
                >
                  {iniciarContingencia.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Iniciar contingência
                </Button>
              </div>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Checklist diário
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Marque somente o que foi conferido hoje no aparelho e no Sigma.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {[
                ["deviceAvailable", "Aparelho disponível"],
                ["batteryOk", "Bateria suficiente"],
                ["signalOk", "Sinal/rede OK"],
                ["whatsappOk", "WhatsApp abre e recebe"],
                ["evolutionOk", "Evolution conectada"],
                ["sendReceiveTestOk", "Envio e recebimento testados"],
              ].map(([key, label]) => (
                <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-muted/50">
                  <Checkbox
                    checked={checklist[key as keyof typeof checklist]}
                    onCheckedChange={(checked) =>
                      setChecklist((current) => ({ ...current, [key]: checked === true }))
                    }
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-2 min-h-11 w-full"
              disabled={salvarChecklist.isPending}
              onClick={() => salvarChecklist.mutate()}
            >
              {salvarChecklist.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar conferência de hoje
            </Button>
          </div>
          {state === "restricted_temporary" && (
            <div className="space-y-2">
              <Label htmlFor="restriction-until">Restrição prevista até</Label>
              <Input
                id="restriction-until"
                type="datetime-local"
                className="min-h-11"
                value={restrictionUntil}
                onChange={(event) => setRestrictionUntil(event.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="operational-note">Observação</Label>
            <Textarea
              id="operational-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ex.: recebe mensagens no aparelho, mas não aceita novo QR Code"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="min-h-11" onClick={onClose}>Cancelar</Button>
          <Button className="min-h-11" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar situação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CapacityCard({ icon: Icon, label, value, total, color }: {
  icon: IconComponent;
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-3xl font-bold" style={{ color }}>{value}</span>
          <span className="text-sm text-slate-400">/ {total}</span>
        </div>
      </CardContent>
    </Card>
  );
}
