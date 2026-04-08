import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Loader2, Search, Filter, CheckSquare, Square, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { normalizeToDigitsOnly } from "@/lib/phoneUtils";


// Limite máximo de leads por campanha (deve bater com LIMITE_POR_DISPARO no backend)
const LIMITE_POR_DISPARO = 600;
const PAGE_SIZE = 600;

interface DisparosImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string;
  propostaId?: string | null;
  totalContatosAtual?: number;
  onSuccess: () => void;
}

interface Lead {
  id: string;
  nome: string;
  phone_e164: string | null;
  especialidade: string | null;
  uf: string | null;
  cidade: string | null;
}

export function DisparosImportDialog({ open, onOpenChange, campanhaId, propostaId, totalContatosAtual = 0, onSuccess }: DisparosImportDialogProps) {
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [especialidadeFiltro, setEspecialidadeFiltro] = useState<string>("_all");
  const [ufFiltro, setUfFiltro] = useState<string>("_all");
  const [cidadeFiltro, setCidadeFiltro] = useState<string>("_all");
  const [leadsSelecionados, setLeadsSelecionados] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  // Debounce busca
  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [buscaDebounced, especialidadeFiltro, ufFiltro, cidadeFiltro]);

  // Calcular espaço disponível na campanha
  const espacoDisponivel = Math.max(0, LIMITE_POR_DISPARO - totalContatosAtual);

  const toPhoneKey = (phone: string | null | undefined): string | null => {
    if (!phone) return null;
    return normalizeToDigitsOnly(phone) ?? phone.replace(/\D/g, "");
  };

  // Buscar sets de exclusão (blacklist, recentes, etc.) - apenas uma vez
  const { data: exclusionSets, isLoading: isLoadingExclusion } = useQuery({
    queryKey: ["leads-exclusion-sets", propostaId, campanhaId],
    queryFn: async () => {
      console.log("🔍 Carregando sets de exclusão para proposta:", propostaId);

      // 1. Buscar blacklist
      const { data: blacklistData } = await supabase
        .from("blacklist")
        .select("phone_e164");

      const blacklistedPhones = new Set(
        (blacklistData || [])
          .map((b) => toPhoneKey(b.phone_e164))
          .filter(Boolean) as string[]
      );

      // 2. Buscar leads que já estão em campanhas nos últimos 7 dias
      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

      const { data: contatosRecentes } = await supabase
        .from("disparos_contatos")
        .select("telefone_e164")
        .gte("created_at", seteDiasAtras.toISOString());

      const phonesBloqueados = new Set(
        (contatosRecentes || [])
          .map((c) => toPhoneKey(c.telefone_e164))
          .filter(Boolean) as string[]
      );

      // 3. Buscar leads que já receberam a mesma proposta
      let phonesMesmaProposta = new Set<string>();
      if (propostaId) {
        const { data: campanhasMesmaProposta } = await supabase
          .from("disparos_campanhas")
          .select("id")
          .eq("proposta_id", propostaId);

        if (campanhasMesmaProposta && campanhasMesmaProposta.length > 0) {
          const campanhaIds = campanhasMesmaProposta.map((c) => c.id);
          const { data: contatosMesmaProposta } = await supabase
            .from("disparos_contatos")
            .select("telefone_e164")
            .in("campanha_id", campanhaIds);

          phonesMesmaProposta = new Set(
            (contatosMesmaProposta || [])
              .map((c) => toPhoneKey(c.telefone_e164))
              .filter(Boolean) as string[]
          );
        }
      }

      // 4. Buscar leads que estão em campanhas ATIVAS
      const { data: campanhasAtivas } = await supabase
        .from("disparos_campanhas")
        .select("id")
        .neq("status", "finalizada");

      let phonesEmDisparosAtivos = new Set<string>();
      if (campanhasAtivas && campanhasAtivas.length > 0) {
        const campanhaAtivasIds = campanhasAtivas.map((c) => c.id);
        const { data: contatosAtivos } = await supabase
          .from("disparos_contatos")
          .select("telefone_e164")
          .in("campanha_id", campanhaAtivasIds);

        phonesEmDisparosAtivos = new Set(
          (contatosAtivos || [])
            .map((c) => toPhoneKey(c.telefone_e164))
            .filter(Boolean) as string[]
        );
      }

      // 5. Buscar leads que já são médicos no corpo clínico
      const { data: medicosData } = await supabase
        .from("medicos")
        .select("phone_e164, lead_id");

      // Exclusão por telefone removida — filtramos apenas por lead_id vinculado ao médico

      const leadIdsMedicos = new Set(
        (medicosData || [])
          .map((m) => m.lead_id)
          .filter(Boolean) as string[]
      );

      // 6. Buscar leads com bloqueio temporário ativo
      const { data: bloqueiosTemp } = await supabase
        .from("leads_bloqueio_temporario")
        .select("lead_id")
        .is("removed_at", null);

      const leadIdsBloqueadosTemp = new Set(
        (bloqueiosTemp || []).map((b) => b.lead_id).filter(Boolean) as string[]
      );

      console.log("📊 Sets carregados:", {
        blacklist: blacklistedPhones.size,
        recentes: phonesBloqueados.size,
        mesmaProposta: phonesMesmaProposta.size,
        ativos: phonesEmDisparosAtivos.size,
        medicosLeadIds: leadIdsMedicos.size,
        bloqueadosTemp: leadIdsBloqueadosTemp.size,
      });

      return { blacklistedPhones, phonesBloqueados, phonesMesmaProposta, phonesEmDisparosAtivos, leadIdsMedicos, leadIdsBloqueadosTemp };
    },
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  // Buscar especialidades, UFs e cidades distintas que existem em leads
  // Supabase tem limite de 1000 registros por query, precisa paginar
  const { data: filterOptions, isLoading: isLoadingFilters } = useQuery({
    queryKey: ["leads-distinct-filters-paginated-v2"],
    queryFn: async () => {
      console.log("🔄 Buscando filtros com paginação...");
      
      const pageSize = 1000;
      
      // Função para buscar especialidades paginadas
      const fetchEspecialidades = async () => {
        const allData: string[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase
            .from("leads")
            .select("especialidade")
            .not("especialidade", "is", null)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (data && data.length > 0) {
            data.forEach((row) => { if (row.especialidade) allData.push(row.especialidade); });
            console.log(`📦 especialidade: página ${page + 1}, ${data.length} registros`);
            hasMore = data.length === pageSize;
            page++;
          } else { hasMore = false; }
        }
        return allData;
      };

      // Função para buscar UFs paginados
      const fetchUfs = async () => {
        const allData: string[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase
            .from("leads")
            .select("uf")
            .not("uf", "is", null)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (data && data.length > 0) {
            data.forEach((row) => { if (row.uf) allData.push(row.uf); });
            console.log(`📦 uf: página ${page + 1}, ${data.length} registros`);
            hasMore = data.length === pageSize;
            page++;
          } else { hasMore = false; }
        }
        return allData;
      };

      // Função para buscar cidades paginadas
      const fetchCidades = async () => {
        const allData: string[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase
            .from("leads")
            .select("cidade")
            .not("cidade", "is", null)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (data && data.length > 0) {
            data.forEach((row) => { if (row.cidade) allData.push(row.cidade); });
            console.log(`📦 cidade: página ${page + 1}, ${data.length} registros`);
            hasMore = data.length === pageSize;
            page++;
          } else { hasMore = false; }
        }
        return allData;
      };

      const [espData, ufData, cidadeData] = await Promise.all([
        fetchEspecialidades(),
        fetchUfs(),
        fetchCidades(),
      ]);

      console.log("📦 Total registros:", { esp: espData.length, uf: ufData.length, cidade: cidadeData.length });

      const especialidades = [...new Set(espData.map(e => e.trim()).filter(Boolean))].sort();
      const ufs = [...new Set(ufData.map(u => u.trim().toUpperCase()).filter(Boolean))].sort();
      const cidades = [...new Set(cidadeData.map(c => c.trim()).filter(Boolean))].sort();

      console.log("📊 Filtros únicos:", { especialidades: especialidades.length, especialidadesList: especialidades, ufs: ufs.length, cidades: cidades.length });

      return { especialidades, ufs, cidades };
    },
    enabled: open,
    staleTime: 300000,
  });

  // Buscar leads paginados com filtros server-side
  const { data: leadsData, isLoading: isLoadingLeads } = useQuery({
    queryKey: ["leads-paginated-disparo", page, buscaDebounced, especialidadeFiltro, ufFiltro, cidadeFiltro],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id, nome, phone_e164, especialidade, uf, cidade", { count: "exact" })
        .not("phone_e164", "is", null)
        .neq("status", "Convertido")
        .order("nome");

      // Aplicar filtros server-side
      if (buscaDebounced && buscaDebounced.length >= 2) {
        query = query.or(`nome.ilike.%${buscaDebounced}%,phone_e164.ilike.%${buscaDebounced}%`);
      }
      if (especialidadeFiltro !== "_all") {
        query = query.ilike("especialidade", especialidadeFiltro);
      }
      if (ufFiltro !== "_all") {
        query = query.ilike("uf", ufFiltro);
      }
      if (cidadeFiltro !== "_all") {
        query = query.ilike("cidade", cidadeFiltro);
      }

      // Paginação
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      return { leads: (data || []) as Lead[], totalCount: count || 0 };
    },
    enabled: open && !!exclusionSets,
    staleTime: 0,
    gcTime: 0,
  });

  // Filtrar leads excluídos client-side (após carregar a página)
  const leadsDisponiveis = useMemo(() => {
    if (!leadsData?.leads || !exclusionSets) return [];

    return leadsData.leads.filter((lead) => {
      const key = toPhoneKey(lead.phone_e164);
      if (!key) return false;
      if (exclusionSets.blacklistedPhones.has(key)) return false;
      if (exclusionSets.phonesBloqueados.has(key)) return false;
      if (exclusionSets.phonesMesmaProposta.has(key)) return false;
      if (exclusionSets.phonesEmDisparosAtivos.has(key)) return false;
      // phonesMedicos removido — exclusão agora apenas por lead_id
      if (exclusionSets.leadIdsMedicos.has(lead.id)) return false;
      if (exclusionSets.leadIdsBloqueadosTemp.has(lead.id)) return false;
      return true;
    });
  }, [leadsData?.leads, exclusionSets]);

  const totalPages = Math.ceil((leadsData?.totalCount || 0) / PAGE_SIZE);
  const isLoading = isLoadingExclusion || isLoadingLeads;

  // Limpar todos os filtros
  const limparFiltros = () => {
    setBusca("");
    setEspecialidadeFiltro("_all");
    setUfFiltro("_all");
    setCidadeFiltro("_all");
    setPage(0);
  };

  const temFiltroAtivo = busca || especialidadeFiltro !== "_all" || ufFiltro !== "_all" || cidadeFiltro !== "_all";

  // Usar opções de filtro do cache
  const especialidades = filterOptions?.especialidades || [];
  const ufs = filterOptions?.ufs || [];
  const cidades = filterOptions?.cidades || [];

  // Selecionar/desselecionar lead
  const toggleLead = (leadId: string) => {
    const novoSet = new Set(leadsSelecionados);
    if (novoSet.has(leadId)) {
      novoSet.delete(leadId);
    } else {
      novoSet.add(leadId);
    }
    setLeadsSelecionados(novoSet);
  };

  // Calcular quantos podem ser selecionados (respeitando o limite)
  const maxParaSelecionar = Math.min(leadsDisponiveis.length, espacoDisponivel - leadsSelecionados.size);

  // Selecionar todos da página atual (até o limite disponível)
  const selecionarTodosPagina = () => {
    const novoSet = new Set(leadsSelecionados);
    const espacoRestante = espacoDisponivel - novoSet.size;
    const leadsParaAdicionar = leadsDisponiveis.slice(0, espacoRestante);
    leadsParaAdicionar.forEach((l) => novoSet.add(l.id));
    setLeadsSelecionados(novoSet);
  };

  // Desselecionar todos
  const desselecionarTodos = () => {
    setLeadsSelecionados(new Set());
  };

  // Enviar contatos selecionados
  const importMutation = useMutation({
    mutationFn: async () => {
      if (leadsSelecionados.size === 0) {
        throw new Error("Nenhum lead selecionado");
      }

      if (leadsSelecionados.size > espacoDisponivel) {
        throw new Error(`Limite excedido! Só é possível adicionar mais ${espacoDisponivel} leads (limite: ${LIMITE_POR_DISPARO} por campanha)`);
      }

      // Buscar dados dos leads selecionados do banco (podem estar em páginas diferentes)
      const selectedIds = Array.from(leadsSelecionados);
      const { data: leadsData, error: fetchError } = await supabase
        .from("leads")
        .select("id, nome, phone_e164")
        .in("id", selectedIds);

      if (fetchError) throw fetchError;

      const contatos = (leadsData || []).map((l) => ({
        lead_id: l.id,
        nome: l.nome,
        telefone: l.phone_e164 || "",
      }));

      const { data, error } = await supabase.functions.invoke("disparos-webhook", {
        body: {
          campanha_id: campanhaId,
          contatos,
        },
      });

      if (error) throw error;
      if (data?.error) {
        throw new Error(data.error + (data.details ? `: ${data.details}` : ''));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disparos-campanhas"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-contatos", campanhaId] });
      toast.success(`${leadsSelecionados.size} leads adicionados com sucesso!`);
      setLeadsSelecionados(new Set());
      setBusca("");
      setEspecialidadeFiltro("_all");
      setUfFiltro("_all");
      setCidadeFiltro("_all");
      setPage(0);
      onSuccess();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Verificar se a seleção excede o limite
  const selecaoExcedeLimite = leadsSelecionados.size > espacoDisponivel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Adicionar Leads à Campanha
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
                placeholder="Buscar nome ou telefone..."
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
              <Button variant="outline" size="sm" onClick={selecionarTodosPagina} disabled={espacoDisponivel === 0 || maxParaSelecionar === 0}>
                <CheckSquare className="h-4 w-4 mr-1" />
                Selecionar Página {maxParaSelecionar > 0 ? `(${maxParaSelecionar})` : ""}
              </Button>
              <Button variant="outline" size="sm" onClick={desselecionarTodos}>
                <Square className="h-4 w-4 mr-1" />
                Limpar Seleção
              </Button>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm text-muted-foreground">
                {leadsSelecionados.size} selecionados de ~{leadsData?.totalCount || 0} leads
              </span>
              <span className={`text-xs ${selecaoExcedeLimite ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                Limite: {espacoDisponivel} leads disponíveis (máx: 600/campanha)
              </span>
            </div>
          </div>

          {/* Alerta de limite excedido */}
          {selecaoExcedeLimite && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md p-3 text-sm">
              ⚠️ Você selecionou {leadsSelecionados.size} leads, mas só há espaço para {espacoDisponivel}. 
              Desmarque {leadsSelecionados.size - espacoDisponivel} lead(s) para continuar.
            </div>
          )}
        </div>

        {/* Lista de Leads */}
        <ScrollArea className="h-[300px] border rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : leadsDisponiveis.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Users className="h-8 w-8 mb-2" />
              <p>Nenhum lead encontrado nesta página</p>
            </div>
          ) : (
            <div className="divide-y">
              {leadsDisponiveis.map((lead) => (
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
                    <p className="text-sm text-muted-foreground">
                      {lead.phone_e164}
                      {lead.especialidade && ` • ${lead.especialidade}`}
                      {lead.cidade && lead.uf ? ` • ${lead.cidade}/${lead.uf}` : lead.uf && ` • ${lead.uf}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || isLoading}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Botão de Adicionar */}
        <Button
          onClick={() => importMutation.mutate()}
          disabled={leadsSelecionados.size === 0 || importMutation.isPending || selecaoExcedeLimite}
          className="w-full"
        >
          {importMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Adicionando...
            </>
          ) : selecaoExcedeLimite ? (
            `Limite excedido (máx: ${espacoDisponivel} leads)`
          ) : (
            `Adicionar ${leadsSelecionados.size} Leads à Campanha`
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
