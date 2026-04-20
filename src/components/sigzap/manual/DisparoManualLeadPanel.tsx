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
import { Phone, Send, Ban, Bookmark, Unlock, Loader2, X, Check, MessageCircle, Pencil, BanIcon, RotateCcw, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDisparoManual } from "@/hooks/useDisparoManual";
import { LiberarLeadDialog } from "@/components/disparos/LiberarLeadDialog";

interface Props {
  campanhaPropostaId: string | null;
  leadId: string | null;
}

function isInativo(p: string) {
  return p?.startsWith("INATIVO:");
}
function clean(p: string) {
  return p.replace(/^INATIVO:\s*/, "").trim();
}

export function DisparoManualLeadPanel({ campanhaPropostaId, leadId }: Props) {
  const qc = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [liberarOpen, setLiberarOpen] = useState(false);
  const disparo = useDisparoManual();
  const [checkingWpp, setCheckingWpp] = useState(false);
  const [wppStatus, setWppStatus] = useState<Record<string, "has" | "no" | "unchecked">>({});

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
    if (!selectedPhone && phones.length > 0) {
      const ativo = phones.find((p) => !isInativo(p));
      if (ativo) setSelectedPhone(clean(ativo));
    }
  }, [phones, selectedPhone]);

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
    campanhaPropostaId && leadId && selectedPhone && selectedInstance && mensagem.trim()
  );

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
          {/* Bloco 1: Números */}
          <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Telefones
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={handleCheckWhatsApp}
                disabled={checkingWpp || phones.length === 0}
              >
                {checkingWpp ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <MessageCircle className="h-3 w-3 mr-1" />
                )}
                Verificar WhatsApp
              </Button>
            </div>

            {phones.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum número cadastrado.</p>
            )}

            <div className="space-y-1.5">
              {phones.map((p) => {
                const inativo = isInativo(p);
                const numero = clean(p);
                const isSelected = selectedPhone === numero;
                const wpp = wppStatus[numero];
                return (
                  <div
                    key={p}
                    className={cn(
                      "flex items-center gap-1.5 cursor-pointer",
                      inativo && "opacity-50"
                    )}
                    onClick={() => !inativo && setSelectedPhone(numero)}
                  >
                    <input
                      type="radio"
                      readOnly
                      checked={isSelected}
                      disabled={inativo}
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
                        <MessageCircle className="h-4 w-4 text-green-500 fill-green-500 flex-shrink-0" />
                      ) : wpp === "no" ? (
                        <MessageCircle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                      ) : null
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
                onClick={() => blacklist.mutate()}
                disabled={!selectedPhone || blacklist.isPending}
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                Blacklist
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bancoInteresse.mutate()}
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

          {/* Bloco 3: Envio */}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="msg" className="text-xs font-semibold uppercase text-muted-foreground">
              Mensagem (suporta spintax {"{a|b}"} e {"{{nome}}"})
            </Label>
            <Textarea
              id="msg"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Olá {{nome}}, {tudo bem|como vai}?"
              rows={5}
            />
          </div>
        </div>
      </ScrollArea>

      <div className="p-3 border-t">
        <Button className="w-full" onClick={handleSend} disabled={!canSend || disparo.isPending}>
          {disparo.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Enviar disparo manual
        </Button>
      </div>

      {liberarOpen && campanhaPropostaId && lead && (
        <LiberarLeadDialog
          open={liberarOpen}
          onOpenChange={setLiberarOpen}
          leadId={lead.id}
          leadNome={lead.nome}
          campanhaPropostaId={campanhaPropostaId}
        />
      )}
    </div>
  );
}