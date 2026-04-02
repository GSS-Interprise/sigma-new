import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, Loader2, Search, Filter, CheckSquare, Square, X } from "lucide-react";
import { toast } from "sonner";

interface EmailImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string;
  propostaId?: string | null;
  onSuccess: () => void;
}

interface Lead {
  id: string;
  nome: string;
  email: string | null;
  especialidade: string | null;
  uf: string | null;
  cidade: string | null;
}

const LIMITE_POR_CAMPANHA_EMAIL = 1500;

export function EmailImportDialog({ open, onOpenChange, campanhaId, propostaId, onSuccess }: EmailImportDialogProps) {
  const [busca, setBusca] = useState("");
  const [especialidadeFiltro, setEspecialidadeFiltro] = useState<string>("_all");
  const [ufFiltro, setUfFiltro] = useState<string>("_all");
  const [cidadeFiltro, setCidadeFiltro] = useState<string>("_all");
  const [leadsSelecionados, setLeadsSelecionados] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Buscar leads do banco, excluindo leads em campanhas nos últimos 7 dias, mesma proposta, campanhas ativas e corpo clínico
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-para-email", propostaId, campanhaId],
    queryFn: async () => {
      console.log("🔍 Buscando leads para proposta de email:", propostaId);

      const normalizeEmail = (email: string | null | undefined): string | null => {
        if (!email) return null;
        return email.trim().toLowerCase();
      };

      // 1. Buscar leads que já estão em campanhas de email nos últimos 7 dias
      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

      const { data: contatosRecentes } = await supabase
        .from("email_contatos")
        .select("email")
        .gte("created_at", seteDiasAtras.toISOString());

      const emailsBloqueados = new Set(
        (contatosRecentes || [])
          .map((c: any) => normalizeEmail(c.email))
          .filter(Boolean) as string[]
      );
      console.log("⏳ Últimos 7 dias:", emailsBloqueados.size, "emails");

      // 2. Buscar leads que já receberam a mesma proposta (independente do tempo)
      let emailsMesmaProposta = new Set<string>();
      if (propostaId) {
        // Buscar campanhas com a mesma proposta_id
        const { data: campanhasMesmaProposta } = await supabase
          .from("email_campanhas")
          .select("id")
          .eq("proposta_id", propostaId);

        console.log("📋 Campanhas de email com mesma proposta:", campanhasMesmaProposta?.length || 0);

        if (campanhasMesmaProposta && campanhasMesmaProposta.length > 0) {
          const campanhaIds = campanhasMesmaProposta.map((c: any) => c.id);

          // Buscar contatos dessas campanhas
          const { data: contatosMesmaProposta } = await supabase
            .from("email_contatos")
            .select("email")
            .in("campanha_id", campanhaIds);

          emailsMesmaProposta = new Set(
            (contatosMesmaProposta || [])
              .map((c: any) => normalizeEmail(c.email))
              .filter(Boolean) as string[]
          );
          console.log(
            "🚫 Mesma proposta:",
            emailsMesmaProposta.size,
            "emails bloqueados"
          );
        }
      } else {
        console.log("⚠️ Nenhuma proposta_id vinculada à campanha de email");
      }

      // 3. Buscar leads que estão em campanhas ATIVAS (não finalizadas)
      const { data: campanhasAtivas } = await supabase
        .from("email_campanhas")
        .select("id")
        .neq("status", "finalizada");

      let emailsEmCampanhasAtivas = new Set<string>();
      if (campanhasAtivas && campanhasAtivas.length > 0) {
        const campanhaAtivasIds = campanhasAtivas.map((c: any) => c.id);
        
        const { data: contatosAtivos } = await supabase
          .from("email_contatos")
          .select("email")
          .in("campanha_id", campanhaAtivasIds);

        emailsEmCampanhasAtivas = new Set(
          (contatosAtivos || [])
            .map((c: any) => normalizeEmail(c.email))
            .filter(Boolean) as string[]
        );
      }
      console.log("📤 Em campanhas ativas:", emailsEmCampanhasAtivas.size, "emails");

      // 4. Buscar leads com status 'Convertido' (corpo clínico)
      const { data: leadsConvertidos } = await supabase
        .from("leads")
        .select("email")
        .eq("status", "Convertido")
        .not("email", "is", null);

      const emailsCorpoClinico = new Set(
        (leadsConvertidos || [])
          .map((l: any) => normalizeEmail(l.email))
          .filter(Boolean) as string[]
      );
      console.log("👨‍⚕️ Corpo clínico (Convertidos):", emailsCorpoClinico.size, "emails");

      // 5. Buscar todos os leads COM EMAIL em lotes (excluindo convertidos já na query)
      const BATCH_SIZE = 1000;
      let allLeads: Lead[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("leads")
          .select("id, nome, email, especialidade, uf, cidade")
          .not("email", "is", null)
          .neq("email", "")
          .neq("status", "Convertido") // Excluir corpo clínico diretamente na query
          .order("nome")
          .range(offset, offset + BATCH_SIZE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allLeads = [...allLeads, ...(data as Lead[])];
          offset += BATCH_SIZE;
          hasMore = data.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }

      console.log("📊 Total leads com email antes do filtro:", allLeads.length);

      // 6. Buscar leads com bloqueio temporário ativo
      const { data: bloqueiosTemp } = await supabase
        .from("leads_bloqueio_temporario")
        .select("lead_id")
        .is("removed_at", null);

      const leadIdsBloqueadosTemp = new Set(
        (bloqueiosTemp || []).map((b: any) => b.lead_id).filter(Boolean) as string[]
      );
      console.log("🛡️ Bloqueios temporários:", leadIdsBloqueadosTemp.size);

      // 7. Filtrar leads que não estão em campanhas recentes, mesma proposta, campanhas ativas, bloqueio temporário
      const filteredLeads = allLeads.filter((lead) => {
        const email = normalizeEmail(lead.email);
        if (!email) return false;
        if (emailsBloqueados.has(email)) return false;
        if (emailsMesmaProposta.has(email)) return false;
        if (emailsEmCampanhasAtivas.has(email)) return false;
        if (leadIdsBloqueadosTemp.has(lead.id)) return false;
        return true;
      });

      console.log("✅ Leads disponíveis após filtro:", filteredLeads.length);
      return filteredLeads;
    },
    enabled: open,
    staleTime: 0, // Sempre refetch ao abrir
    gcTime: 0, // Não usar cache
  });

  // Função para normalizar chave
  const normalizeKey = (val: string) => val.trim().toUpperCase();

  // Limpar todos os filtros
  const limparFiltros = () => {
    setBusca("");
    setEspecialidadeFiltro("_all");
    setUfFiltro("_all");
    setCidadeFiltro("_all");
  };

  const temFiltroAtivo = busca || especialidadeFiltro !== "_all" || ufFiltro !== "_all" || cidadeFiltro !== "_all";

  // Leads pré-filtrados por especialidade (para cascata de filtros)
  const leadsComEspecialidade = useMemo(() => {
    if (especialidadeFiltro === "_all") return leads;
    return leads.filter((l) => l.especialidade && normalizeKey(l.especialidade) === normalizeKey(especialidadeFiltro));
  }, [leads, especialidadeFiltro]);

  // Leads pré-filtrados por especialidade + UF (para cascata de cidades)
  const leadsComEspecialidadeEUf = useMemo(() => {
    let filtrados = leadsComEspecialidade;
    if (ufFiltro !== "_all") {
      filtrados = filtrados.filter((l) => l.uf && normalizeKey(l.uf) === normalizeKey(ufFiltro));
    }
    return filtrados;
  }, [leadsComEspecialidade, ufFiltro]);

  // Extrair opções únicas para os filtros (normalizando case)
  const especialidades = useMemo(() => {
    const map = new Map<string, string>();
    leads.forEach((l) => {
      if (l.especialidade) {
        const key = normalizeKey(l.especialidade);
        if (!map.has(key)) {
          map.set(key, l.especialidade.trim());
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)));
  }, [leads]);

  // UFs filtrados pela especialidade selecionada
  const ufs = useMemo(() => {
    const map = new Map<string, string>();
    leadsComEspecialidade.forEach((l) => {
      if (l.uf) {
        const key = normalizeKey(l.uf);
        if (!map.has(key)) {
          map.set(key, key);
        }
      }
    });
    return Array.from(map.values()).sort();
  }, [leadsComEspecialidade]);

  // Cidades filtradas pela especialidade + UF
  const cidades = useMemo(() => {
    const map = new Map<string, string>();
    leadsComEspecialidadeEUf.forEach((l) => {
      if (l.cidade) {
        const key = normalizeKey(l.cidade);
        if (!map.has(key)) {
          map.set(key, l.cidade.trim());
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)));
  }, [leadsComEspecialidadeEUf]);

  // Aplicar filtros
  const leadsFiltrados = useMemo(() => {
    return leads.filter((lead) => {
      const matchBusca =
        !busca ||
        lead.nome.toLowerCase().includes(busca.toLowerCase()) ||
        lead.email?.toLowerCase().includes(busca.toLowerCase());
      const matchEspecialidade = especialidadeFiltro === "_all" || 
        (lead.especialidade && normalizeKey(lead.especialidade) === normalizeKey(especialidadeFiltro));
      const matchUf = ufFiltro === "_all" || 
        (lead.uf && normalizeKey(lead.uf) === normalizeKey(ufFiltro));
      const matchCidade = cidadeFiltro === "_all" || 
        (lead.cidade && normalizeKey(lead.cidade) === normalizeKey(cidadeFiltro));
      return matchBusca && matchEspecialidade && matchUf && matchCidade;
    });
  }, [leads, busca, especialidadeFiltro, ufFiltro, cidadeFiltro]);

  // Selecionar/desselecionar lead
  const toggleLead = (leadId: string) => {
    const novoSet = new Set(leadsSelecionados);
    if (novoSet.has(leadId)) {
      novoSet.delete(leadId);
    } else {
      // Verificar limite antes de adicionar
      if (novoSet.size >= LIMITE_POR_CAMPANHA_EMAIL) {
        toast.error(`Limite de ${LIMITE_POR_CAMPANHA_EMAIL} leads por campanha atingido`);
        return;
      }
      novoSet.add(leadId);
    }
    setLeadsSelecionados(novoSet);
  };

  // Selecionar todos os filtrados (respeitando o limite)
  const selecionarTodos = () => {
    const novoSet = new Set(leadsSelecionados);
    const vagasDisponiveis = LIMITE_POR_CAMPANHA_EMAIL - novoSet.size;
    
    if (vagasDisponiveis <= 0) {
      toast.error(`Limite de ${LIMITE_POR_CAMPANHA_EMAIL} leads por campanha atingido`);
      return;
    }

    let adicionados = 0;
    for (const l of leadsFiltrados) {
      if (!novoSet.has(l.id)) {
        if (adicionados >= vagasDisponiveis) {
          toast.warning(`Limite de ${LIMITE_POR_CAMPANHA_EMAIL} leads atingido. Apenas ${adicionados} leads foram adicionados.`);
          break;
        }
        novoSet.add(l.id);
        adicionados++;
      }
    }
    setLeadsSelecionados(novoSet);
  };

  // Desselecionar todos
  const desselecionarTodos = () => {
    setLeadsSelecionados(new Set());
  };

  // Adicionar contatos à campanha
  const importMutation = useMutation({
    mutationFn: async () => {
      if (leadsSelecionados.size === 0) {
        throw new Error("Nenhum lead selecionado");
      }

      const leadsSelecionadosList = leads.filter((l) => leadsSelecionados.has(l.id));
      
      // Inserir contatos na tabela email_contatos
      const contatos = leadsSelecionadosList.map((l) => ({
        campanha_id: campanhaId,
        lead_id: l.id,
        nome: l.nome,
        email: l.email || "",
        status: "pendente" as const,
      }));

      const { error } = await supabase
        .from("email_contatos")
        .insert(contatos);

      if (error) throw error;

      // Buscar total atual e atualizar
      const { data: campanhaAtual } = await supabase
        .from("email_campanhas")
        .select("total_contatos")
        .eq("id", campanhaId)
        .single();

      const totalAtual = (campanhaAtual as any)?.total_contatos || 0;

      const { error: updateError } = await supabase
        .from("email_campanhas")
        .update({ total_contatos: totalAtual + contatos.length })
        .eq("id", campanhaId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campanhas"] });
      queryClient.invalidateQueries({ queryKey: ["email-contatos", campanhaId] });
      toast.success(`${leadsSelecionados.size} leads adicionados com sucesso!`);
      setLeadsSelecionados(new Set());
      setBusca("");
      setEspecialidadeFiltro("_all");
      setUfFiltro("_all");
      setCidadeFiltro("_all");
      onSuccess();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Adicionar Leads à Campanha de Email
          </DialogTitle>
        </DialogHeader>

        {/* Filtros */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros</span>
            </div>
            {temFiltroAtivo && (
              <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4 mr-1" />
                Limpar Filtros
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar nome ou email..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Especialidade */}
            <Select value={especialidadeFiltro} onValueChange={(v) => { setEspecialidadeFiltro(v); setUfFiltro("_all"); setCidadeFiltro("_all"); }}>
              <SelectTrigger>
                <SelectValue placeholder="Especialidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas Especialidades</SelectItem>
                {especialidades.map((esp) => (
                  <SelectItem key={esp} value={esp!}>
                    {esp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* UF */}
            <Select value={ufFiltro} onValueChange={(v) => { setUfFiltro(v); setCidadeFiltro("_all"); }}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos Estados</SelectItem>
                {ufs.map((uf) => (
                  <SelectItem key={uf} value={uf!}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Cidade */}
            <Select value={cidadeFiltro} onValueChange={setCidadeFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas Cidades</SelectItem>
                {cidades.map((cidade) => (
                  <SelectItem key={cidade} value={cidade!}>
                    {cidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ações de seleção */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selecionarTodos}>
                <CheckSquare className="h-4 w-4 mr-1" />
                Selecionar Todos ({leadsFiltrados.length})
              </Button>
              <Button variant="outline" size="sm" onClick={desselecionarTodos}>
                <Square className="h-4 w-4 mr-1" />
                Limpar Seleção
              </Button>
            </div>
            <span className="text-sm text-muted-foreground">
              {leadsSelecionados.size} selecionados de {leads.length} leads (máx: {LIMITE_POR_CAMPANHA_EMAIL})
            </span>
          </div>
        </div>

        {/* Lista de Leads */}
        <div className="h-[350px] border rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : leadsFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Mail className="h-8 w-8 mb-2" />
              <p>Nenhum lead com email encontrado</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="divide-y">
                {leadsFiltrados.map((lead) => (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer ${
                      leadsSelecionados.has(lead.id) ? "bg-primary/10" : ""
                    }`}
                    onClick={() => toggleLead(lead.id)}
                  >
                    <Checkbox
                      checked={leadsSelecionados.has(lead.id)}
                      onCheckedChange={() => toggleLead(lead.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{lead.nome}</p>
                      <p className="text-sm text-muted-foreground truncate">{lead.email}</p>
                    </div>
                  <div className="flex items-center gap-2">
                    {lead.especialidade && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">{lead.especialidade}</span>
                    )}
                    {lead.uf && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">{lead.uf}</span>
                    )}
                  </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <span className="text-sm text-muted-foreground">
            {leadsSelecionados.size} lead(s) selecionado(s)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={leadsSelecionados.size === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Adicionar à Campanha
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
