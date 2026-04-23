import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Phone, Send, Ban, Bookmark, Unlock, Loader2, X, Check, MessageCircle, Pencil, BanIcon, RotateCcw, Plus, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDisparoManual } from "@/hooks/useDisparoManual";
import { LiberarLeadDialog } from "@/components/disparos/LiberarLeadDialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  campanhaPropostaId: string | null;
  leadId: string | null;
  onOpenChat?: (phone: string, instanceId: string) => void;
}

function isInativo(p: string) {
  return p?.startsWith("INATIVO:");
}
function clean(p: string) {
  return p.replace(/^INATIVO:\s*/, "").trim();
}

export function DisparoManualLeadPanel({ campanhaPropostaId, leadId, onOpenChat }: Props) {
  const qc = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [liberarOpen, setLiberarOpen] = useState(false);
  const [confirmBlacklist, setConfirmBlacklist] = useState(false);
  const [confirmBanco, setConfirmBanco] = useState(false);
  const disparo = useDisparoManual();
  const [wppStatus, setWppStatus] = useState<Record<string, "has" | "no" | "unchecked">>({});
  const { isAdmin } = usePermissions();

  // Bloqueio: lead em fila de disparo em massa (1-ENVIAR / 2-REENVIAR / 3-TRATANDO)
  const { data: bloqueioStatus } = useQuery({
    queryKey: ["dm-bloqueio-massa", leadId],
    enabled: !!leadId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("disparos_contatos")
        .select("status")
        .eq("lead_id", leadId!)
        .in("status", ["1-ENVIAR", "2-REENVIAR", "3-TRATANDO"])
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data?.status as string | undefined) ?? null;
    },
  });
  const bloqueadoMassa = !!bloqueioStatus;

  // Primeiro disparo manual já enviado (trava instância e telefone para não-admin)
  const { data: primeiroEnvio } = useQuery({
    queryKey: ["dm-primeiro-envio", campanhaPropostaId, leadId],
    enabled: !!campanhaPropostaId && !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparo_manual_envios")
        .select("instance_id, phone_e164, created_at")
        .eq("campanha_proposta_id", campanhaPropostaId!)
        .eq("lead_id", leadId!)
        .eq("status", "enviado")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { instance_id: string; phone_e164: string } | null;
    },
  });

  const travado = !!primeiroEnvio && !isAdmin;

  // Lead
  const { data: lead, isLoading: loadingLead } = useQuery({
    queryKey: ["dm-lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, phone_e164, telefones_adicionais, status")
        .eq("id", leadId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Instâncias conectadas
  const { data: chips } = useQuery({
    queryKey: ["dm-chips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("id, nome, instance_name, status, connection_state")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return (data || []).filter(
        (c) => c.connection_state === "open" || c.connection_state === "connected"
      );
    },
  });

  // Reset state quando muda lead
  useEffect(() => {
    setSelectedPhone(null);
    setMensagem("");
  }, [leadId]);

  const phones = useMemo(() => {
    if (!lead) return [];
    const arr: string[] = [];
    if (lead.phone_e164) arr.push(lead.phone_e164);
    (lead.telefones_adicionais || []).forEach((p: string) => {
      if (p && !arr.includes(p)) arr.push(p);
    });
    return arr;
  }, [lead]);

  // Auto-select primeiro telefone ativo
  useEffect(() => {
    if (travado && primeiroEnvio?.phone_e164) {
      setSelectedPhone(primeiroEnvio.phone_e164);
      return;
    }
    if (!selectedPhone && phones.length > 0) {
      const ativo = phones.find((p) => !isInativo(p));
      if (ativo) setSelectedPhone(clean(ativo));
    }
  }, [phones, selectedPhone, travado, primeiroEnvio]);

  // Trava instância para não-admin quando lead já foi contactado
  useEffect(() => {
    if (travado && primeiroEnvio?.instance_id) {
      setSelectedInstance(primeiroEnvio.instance_id);
    }
  }, [travado, primeiroEnvio]);

  // Toggle inativo
  const toggleInativo = useMutation({
    mutationFn: async (phoneOriginal: string) => {
      if (!lead) return;
      const isAtivo = !isInativo(phoneOriginal);
      const novo = isAtivo ? `INATIVO: ${clean(phoneOriginal)}` : clean(phoneOriginal);
      // Se for o phone_e164 principal, move para telefones_adicionais com prefixo
      if (phoneOriginal === lead.phone_e164) {
        const novosAdic = [novo, ...(lead.telefones_adicionais || [])];
        await supabase
          .from("leads")
          .update({ phone_e164: null, telefones_adicionais: novosAdic })
          .eq("id", lead.id);
      } else {
        const novosAdic = (lead.telefones_adicionais || []).map((p: string) =>
          p === phoneOriginal ? novo : p
        );
        await supabase
          .from("leads")
          .update({ telefones_adicionais: novosAdic })
          .eq("id", lead.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dm-lead", leadId] });
      toast.success("Status do número atualizado");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  // Blacklist
  const blacklist = useMutation({
    mutationFn: async () => {
      if (!selectedPhone || !lead) throw new Error("Selecione um número");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("blacklist").insert({
        phone_e164: selectedPhone,
        nome: lead.nome,
        reason: "Disparo manual SIG Zap",
        origem: "disparo_manual",
        created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Adicionado à blacklist"),
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  // Banco de interesse
  const bancoInteresse = useMutation({
    mutationFn: async () => {
      if (!lead) return;
      const { data: u } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", u.user?.id || "")
        .maybeSingle();
      const { error } = await supabase.from("banco_interesse_leads").insert({
        lead_id: lead.id,
        encaminhado_por: u.user?.id,
        encaminhado_por_nome: prof?.nome_completo,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Lead enviado ao banco de interesse"),
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const canSend = !!(
    campanhaPropostaId && leadId && selectedPhone && selectedInstance && mensagem.trim() && !bloqueadoMassa
  );

  const checkWhatsAppFor = async (instanceName: string, phonesToCheck: string[]) => {
    if (phonesToCheck.length === 0 || !instanceName) return;
    try {
      const newSt: Record<string, "has" | "no" | "unchecked"> = {};
      for (const p of phonesToCheck) {
        const raw = clean(p);
        const digits = raw.replace(/\D/g, "");
        if (!digits) { newSt[raw] = "no"; continue; }
        const num = digits.startsWith("55") ? digits : `55${digits}`;
        try {
          const { data } = await supabase.functions.invoke("evolution-api-proxy", {
            body: { action: "checkIsOnWhatsapp", instanceName, data: { numbers: [num] } },
          });
          newSt[raw] = Array.isArray(data) && data[0]?.exists ? "has" : "no";
        } catch { newSt[raw] = "no"; }
      }
      setWppStatus(newSt);
    } catch { /* silent auto-check */ }
  };

  // Auto-verifica WhatsApp ao selecionar instância + carregar lead
  useEffect(() => {
    if (!selectedInstance || phones.length === 0 || !chips) return;
    const chip = chips.find((c: any) => c.id === selectedInstance);
    if (!chip?.instance_name) return;
    setWppStatus({});
    checkWhatsAppFor(chip.instance_name, phones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstance, leadId, phones.length]);

  const handleSend = async () => {
    if (!canSend) return;
    await disparo.mutateAsync({
      campanha_proposta_id: campanhaPropostaId!,
      lead_id: leadId!,
      phone_e164: selectedPhone!,
      instance_id: selectedInstance!,
      mensagem: mensagem.trim(),
    });
    setMensagem("");
  };

  if (!leadId) {
    return (
      <div className="border-r flex items-center justify-center h-full bg-card text-center p-6">
        <div className="text-sm text-muted-foreground">
          Selecione um lead na coluna ao lado para preparar o disparo.
        </div>
      </div>
    );
  }

  return (
    <div className="border-r flex flex-col h-full bg-card overflow-hidden">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">
          {loadingLead ? <Skeleton className="h-5 w-40" /> : lead?.nome || "Lead"}
        </h3>
        <p className="text-xs text-muted-foreground">Detalhes & envio</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {bloqueadoMassa && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs flex gap-2">
              <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-primary">Lead em fila de disparo em massa</p>
                <p className="text-muted-foreground">
                  Status atual: <span className="font-mono">{bloqueioStatus}</span>. O envio manual está bloqueado para evitar mensagens duplicadas e risco de bloqueio do número.
                </p>
              </div>
            </div>
          )}
          {/* Bloco 1: Instância */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Instância (única)
            </Label>
            {(chips || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma instância conectada.</p>
            ) : (
              <Select
                value={selectedInstance ?? ""}
                onValueChange={setSelectedInstance}
                disabled={travado}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione uma instância" />
                </SelectTrigger>
                <SelectContent>
                  {(chips || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {c.instance_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {travado && (
              <p className="text-[11px] text-muted-foreground italic">
                Lead já contactado — instância e número travados. Apenas administradores podem alterar.
              </p>
            )}
          </div>

          {/* Bloco 2: Telefones */}
          <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              Telefones
            </label>

            {phones.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum número cadastrado.</p>
            )}

            <div className="space-y-1.5">
              {phones.map((p) => {
                const inativo = isInativo(p);
                const numero = clean(p);
                const isSelected = selectedPhone === numero;
                const wpp = wppStatus[numero];
                const lockedRow = travado && primeiroEnvio?.phone_e164 !== numero;
                return (
                  <div
                    key={p}
                    className={cn(
                      "flex items-center gap-1.5 cursor-pointer",
                      inativo && "opacity-50",
                      lockedRow && "opacity-40 cursor-not-allowed"
                    )}
                    onClick={() => {
                      if (inativo) return;
                      if (travado) return;
                      setSelectedPhone(numero);
                    }}
                  >
                    <input
                      type="radio"
                      readOnly
                      checked={isSelected}
                      disabled={inativo || travado}
                      className="h-3 w-3 accent-primary flex-shrink-0"
                    />
                    <div
                      className={cn(
                        "h-7 text-xs flex-1 flex items-center px-2 rounded border bg-background",
                        isSelected && "ring-1 ring-primary border-primary",
                        inativo && "line-through text-muted-foreground"
                      )}
                    >
                      {numero}
                    </div>
                    {!inativo && (
                      wpp === "has" ? (
                        <button
                          type="button"
                          title="Abrir chat WhatsApp"
                          className="flex-shrink-0 hover:scale-110 transition-transform"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!selectedInstance) { toast.error("Selecione uma instância primeiro"); return; }
                            onOpenChat?.(numero, selectedInstance);
                          }}
                        >
                          <MessageCircle className="h-4 w-4 text-green-500 fill-green-500" />
                        </button>
                      ) : (
                        <MessageCircle
                          className="h-4 w-4 text-muted-foreground/40 flex-shrink-0"
                          aria-label={wpp === "no" ? "Sem WhatsApp" : "Não verificado"}
                        />
                      )
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      title={inativo ? "Reativar número" : "Inativar número"}
                      disabled={toggleInativo.isPending}
                      onClick={(e) => { e.stopPropagation(); toggleInativo.mutate(p); }}
                    >
                      {inativo
                        ? <RotateCcw className="h-3 w-3 text-green-600" />
                        : <BanIcon className="h-3 w-3 text-destructive" />
                      }
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bloco 2: Ações rápidas */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Ações
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmBlacklist(true)}
                disabled={!selectedPhone || blacklist.isPending}
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                Blacklist
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmBanco(true)}
                disabled={bancoInteresse.isPending}
              >
                <Bookmark className="h-3.5 w-3.5 mr-1" />
                Banco
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLiberarOpen(true)}
                disabled={!campanhaPropostaId}
              >
                <Unlock className="h-3.5 w-3.5 mr-1" />
                Liberar
              </Button>
            </div>
          </div>

        </div>
      </ScrollArea>

      {liberarOpen && campanhaPropostaId && lead && (
        <LiberarLeadDialog
          open={liberarOpen}
          onOpenChange={setLiberarOpen}
          leadId={lead.id}
          leadNome={lead.nome}
          campanhaPropostaId={campanhaPropostaId}
        />
      )}

      <AlertDialog open={confirmBlacklist} onOpenChange={setConfirmBlacklist}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adicionar à Blacklist?</AlertDialogTitle>
            <AlertDialogDescription>
              O número {selectedPhone} será adicionado à blacklist e não receberá mais disparos. Esta ação pode ser revertida manualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => blacklist.mutate()}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBanco} onOpenChange={setConfirmBanco}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar ao Banco de Interesse?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead {lead?.nome} será marcado como banco de interesse para contato futuro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => bancoInteresse.mutate()}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}