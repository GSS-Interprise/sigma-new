import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Plus, X, Ticket } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demandaId: string;
  onCreated?: (ticketId: string) => void;
}

interface ProfileOpt {
  id: string;
  nome_completo: string;
  email: string | null;
}

export function TransformDemandaTicketDialog({ open, onOpenChange, demandaId, onCreated }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<"software" | "hardware">("software");
  const [urgencia, setUrgencia] = useState<"critica" | "alta" | "media" | "baixa" | "">("");
  const [impacto, setImpacto] = useState<string>("");
  const [solicitantes, setSolicitantes] = useState<ProfileOpt[]>([]);
  const [search, setSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Carregar demanda + envolvidos quando abrir
  const { data: demanda, isLoading: loadingDemanda } = useQuery({
    queryKey: ["demanda-para-ticket", demandaId],
    enabled: open && !!demandaId,
    queryFn: async () => {
      const { data: tarefa, error } = await supabase
        .from("worklist_tarefas")
        .select("id, titulo, descricao, created_by, responsavel_id, ticket_id")
        .eq("id", demandaId)
        .single();
      if (error) throw error;

      const [mencRes, finRes, comentRes] = await Promise.all([
        supabase.from("worklist_tarefa_mencionados").select("user_id").eq("tarefa_id", demandaId),
        supabase.from("worklist_tarefa_finalizadores" as any).select("user_id").eq("tarefa_id", demandaId),
        supabase
          .from("worklist_tarefa_comentarios")
          .select("user_id, conteudo, created_at")
          .eq("tarefa_id", demandaId)
          .order("created_at", { ascending: true }),
      ]);

      const userIds = new Set<string>();
      if (tarefa.created_by) userIds.add(tarefa.created_by);
      if (tarefa.responsavel_id) userIds.add(tarefa.responsavel_id);
      (mencRes.data || []).forEach((m: any) => m.user_id && userIds.add(m.user_id));
      ((finRes as any).data || []).forEach((m: any) => m.user_id && userIds.add(m.user_id));
      (comentRes.data || []).forEach((c: any) => c.user_id && userIds.add(c.user_id));

      const { data: profiles } = userIds.size
        ? await supabase
            .from("profiles")
            .select("id, nome_completo, email, setor_id, setores(nome)")
            .in("id", Array.from(userIds))
        : { data: [] as any[] };

      return {
        tarefa,
        profiles: (profiles || []) as any[],
        comentarios: (comentRes.data || []) as any[],
      };
    },
  });

  // Pre-fill quando abrir
  useEffect(() => {
    if (!open || !demanda) return;
    setDescricao(`${demanda.tarefa.titulo}\n\n${demanda.tarefa.descricao || ""}`.trim());
    const pre = new Map<string, ProfileOpt>();
    const add = (id: string | null | undefined) => {
      if (!id) return;
      const p = demanda.profiles.find((x: any) => x.id === id);
      if (p) pre.set(p.id, { id: p.id, nome_completo: p.nome_completo || "Sem nome", email: p.email });
    };
    add(demanda.tarefa.created_by);
    add(demanda.tarefa.responsavel_id);
    setSolicitantes(Array.from(pre.values()));
    setUrgencia("");
    setImpacto("");
    setTipo("software");
  }, [open, demanda]);

  // Busca de usuários para adicionar
  const { data: allUsers } = useQuery({
    queryKey: ["profiles-para-ticket-add"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome_completo, email, status")
        .eq("status", "ativo")
        .order("nome_completo");
      return (data || []) as any[];
    },
  });

  const opcoesUsuario = useMemo(() => {
    const selectedIds = new Set(solicitantes.map((s) => s.id));
    return (allUsers || [])
      .filter((u: any) => !selectedIds.has(u.id))
      .map((u: any) => ({ id: u.id, nome_completo: u.nome_completo || "Sem nome", email: u.email }));
  }, [allUsers, solicitantes]);

  const adicionar = (u: ProfileOpt) => {
    setSolicitantes((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, u]));
    setSearch(false);
  };
  const remover = (id: string) => setSolicitantes((prev) => prev.filter((p) => p.id !== id));

  const transform = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!demanda) throw new Error("Demanda não carregada");
      if (!urgencia) throw new Error("Selecione o nível de urgência");
      if (!impacto) throw new Error("Selecione o tipo de impacto");
      if (!solicitantes.length) throw new Error("Adicione pelo menos um solicitante");
      if (descricao.trim().length < 10) throw new Error("Descrição muito curta");

      const principal = solicitantes[0];
      // Buscar setor do principal
      const { data: profPrincipal } = await supabase
        .from("profiles")
        .select("setor_id, setores(nome)")
        .eq("id", principal.id)
        .single();

      // Criar ticket
      const { data: ticket, error: insErr } = await supabase
        .from("suporte_tickets")
        .insert({
          solicitante_id: principal.id,
          solicitante_nome: principal.nome_completo,
          setor_id: profPrincipal?.setor_id || null,
          setor_nome: (profPrincipal as any)?.setores?.nome || null,
          destino: "interno" as const,
          tipo,
          descricao,
          numero: "",
          status: "aberto" as const,
          setor_responsavel: "TI",
          nivel_urgencia: urgencia as any,
          tipo_impacto: impacto as any,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      // Inserir multi-solicitantes
      const linhasSol = solicitantes.map((s, idx) => ({
        ticket_id: ticket.id,
        user_id: s.id,
        nome: s.nome_completo,
        email: s.email,
        is_principal: idx === 0,
      }));
      const { error: solErr } = await supabase
        .from("suporte_ticket_solicitantes")
        .insert(linhasSol);
      if (solErr) console.error("Erro ao inserir solicitantes", solErr);

      // Copiar comentários como histórico
      if (demanda.comentarios.length) {
        const profByid = new Map(demanda.profiles.map((p: any) => [p.id, p]));
        const rows = demanda.comentarios.map((c: any) => {
          const autor = profByid.get(c.user_id) as any;
          return {
            ticket_id: ticket.id,
            autor_id: c.user_id,
            autor_nome: autor?.nome_completo || "Demanda",
            autor_email: autor?.email || "",
            mensagem: `[Histórico da demanda] ${c.conteudo}`,
            is_externo: false,
            created_at: c.created_at,
          };
        });
        const { error: comErr } = await supabase.from("suporte_comentarios").insert(rows);
        if (comErr) console.error("Erro ao copiar comentários", comErr);
      }

      // Vincular demanda ao ticket
      await supabase
        .from("worklist_tarefas")
        .update({ ticket_id: ticket.id })
        .eq("id", demanda.tarefa.id);

      return ticket;
    },
    onSuccess: (ticket) => {
      toast.success(`Ticket ${ticket.numero} criado a partir da demanda`);
      qc.invalidateQueries({ queryKey: ["demandas"] });
      qc.invalidateQueries({ queryKey: ["admin-tickets-kanban"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      onOpenChange(false);
      onCreated?.(ticket.id);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao transformar demanda em ticket");
    },
    onSettled: () => setSubmitting(false),
  });

  const handleSubmit = () => {
    setSubmitting(true);
    transform.mutate();
  };

  const jaVirouTicket = !!demanda?.tarefa.ticket_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Transformar demanda em ticket
          </DialogTitle>
          <DialogDescription>
            Defina os parâmetros do novo ticket. Os comentários da demanda serão
            copiados como histórico de comunicação.
          </DialogDescription>
        </DialogHeader>

        {loadingDemanda ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : jaVirouTicket ? (
          <div className="py-6 text-sm text-muted-foreground">
            Esta demanda já foi transformada em ticket.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição do ticket *</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={6}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Título e conteúdo da demanda foram inseridos automaticamente.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Nível de urgência *</Label>
                <Select value={urgencia} onValueChange={(v) => setUrgencia(v as any)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critica">🔴 Crítica</SelectItem>
                    <SelectItem value="alta">🟠 Alta</SelectItem>
                    <SelectItem value="media">🟡 Média</SelectItem>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de impacto *</Label>
                <Select value={impacto} onValueChange={setImpacto}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sistema">Sistema</SelectItem>
                    <SelectItem value="infraestrutura">Infraestrutura</SelectItem>
                    <SelectItem value="acesso_permissao">Acesso/Permissão</SelectItem>
                    <SelectItem value="integracao">Integração</SelectItem>
                    <SelectItem value="duvida_operacional">Dúvida operacional</SelectItem>
                    <SelectItem value="melhoria">Melhoria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="software">Software</SelectItem>
                    <SelectItem value="hardware">Hardware</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Solicitantes *</Label>
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[42px]">
                {solicitantes.map((s) => (
                  <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
                    {s.nome_completo}
                    <button
                      type="button"
                      onClick={() => remover(s.id)}
                      className="hover:bg-background rounded p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Popover open={search} onOpenChange={setSearch}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1">
                      <Plus className="h-3 w-3" /> adicionar
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar usuário..." />
                      <CommandList>
                        <CommandEmpty>Nenhum usuário</CommandEmpty>
                        <CommandGroup>
                          {opcoesUsuario.map((u) => (
                            <CommandItem
                              key={u.id}
                              value={u.nome_completo}
                              onSelect={() => adicionar(u)}
                            >
                              {u.nome_completo}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <p className="text-xs text-muted-foreground">
                O primeiro da lista é o solicitante principal. Todos receberão emails de
                "Aguardando confirmação" e "Encerrado".
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loadingDemanda || jaVirouTicket}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}