import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ClipboardList, AlertCircle, FileEdit, Activity, Building2, CalendarDays, ArrowUpDown, ArrowUp, ArrowDown, History } from "lucide-react";
import { AbaAgendasAtualizada } from "@/components/radiologia/AbaAgendasAtualizada";
import { AbaProducaoExamesAtualizada } from "@/components/radiologia/AbaProducaoExamesAtualizada";
import { AbaPendenciasAtrasos } from "@/components/radiologia/AbaPendenciasAtrasos";
import { AbaAjusteLaudos } from "@/components/radiologia/AbaAjusteLaudos";
import { AbaControleECG } from "@/components/radiologia/AbaControleECG";
import { AbaHistoricoImportacoes } from "@/components/radiologia/AbaHistoricoImportacoes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function Radiologia() {
  const [selectedClienteId, setSelectedClienteId] = useState<string>("todos");
  const [selectedDataFilter, setSelectedDataFilter] = useState<string>("todas");
  const [dateSortOrder, setDateSortOrder] = useState<'count' | 'date_asc' | 'date_desc'>('count');

  // Buscar clientes que têm pendências importadas usando RPC ou query mais eficiente
  const { data: clientesComPendencias = [] } = useQuery({
    queryKey: ['clientes-com-pendencias'],
    queryFn: async () => {
      // Primeiro busca todos os clientes ativos
      const { data: todosClientes, error: clientesError } = await supabase
        .from('clientes')
        .select('id, nome_empresa')
        .order('nome_empresa');
      
      if (clientesError) throw clientesError;
      if (!todosClientes || todosClientes.length === 0) return [];
      
      // Para cada cliente, verifica se tem pelo menos 1 pendência
      const clientesComDados: typeof todosClientes = [];
      
      for (const cliente of todosClientes) {
        const { count, error } = await supabase
          .from('radiologia_pendencias' as any)
          .select('id', { count: 'exact', head: true })
          .eq('cliente_id', cliente.id)
          .limit(1);
        
        if (!error && count && count > 0) {
          clientesComDados.push(cliente);
        }
      }
      
      return clientesComDados;
    },
  });

  // Buscar datas com pendências, ordenadas por quantidade (maior -> menor) - COM PAGINAÇÃO
  const { data: datasComPendencias = [] } = useQuery({
    queryKey: ['datas-com-pendencias', selectedClienteId],
    queryFn: async () => {
      // Buscar TODAS as pendências abertas usando paginação
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('radiologia_pendencias')
          .select('data_deteccao')
          .neq('status_pendencia', 'resolvida')
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (selectedClienteId !== "todos") {
          query = query.eq('cliente_id', selectedClienteId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      if (allData.length === 0) return [];

      // Agrupar por data e contar
      const countByDate: Record<string, number> = {};
      allData.forEach(item => {
        if (item.data_deteccao) {
          const dateStr = item.data_deteccao.split('T')[0];
          countByDate[dateStr] = (countByDate[dateStr] || 0) + 1;
        }
      });

      // Converter para array e ordenar por quantidade (maior -> menor)
      return Object.entries(countByDate)
        .map(([data, count]) => ({ data, count }));
    },
  });

  // Ordenar as datas baseado na seleção do usuário
  const sortedDatasComPendencias = useMemo(() => {
    if (!datasComPendencias.length) return [];
    
    return [...datasComPendencias].sort((a, b) => {
      if (dateSortOrder === 'count') {
        return b.count - a.count; // Maior quantidade primeiro
      } else if (dateSortOrder === 'date_asc') {
        return new Date(a.data).getTime() - new Date(b.data).getTime(); // Data mais antiga primeiro
      } else {
        return new Date(b.data).getTime() - new Date(a.data).getTime(); // Data mais recente primeiro
      }
    });
  }, [datasComPendencias, dateSortOrder]);

  // Alternar ordenação
  const toggleDateSortOrder = () => {
    setDateSortOrder(prev => {
      if (prev === 'count') return 'date_desc';
      if (prev === 'date_desc') return 'date_asc';
      return 'count';
    });
  };

  const getSortIcon = () => {
    if (dateSortOrder === 'date_asc') return <ArrowUp className="h-4 w-4" />;
    if (dateSortOrder === 'date_desc') return <ArrowDown className="h-4 w-4" />;
    return <ArrowUpDown className="h-4 w-4" />;
  };

  const getSortTooltip = () => {
    if (dateSortOrder === 'count') return 'Ordenado por quantidade. Clique para ordenar por data (mais recente)';
    if (dateSortOrder === 'date_desc') return 'Ordenado por data (mais recente). Clique para ordenar por data (mais antiga)';
    return 'Ordenado por data (mais antiga). Clique para ordenar por quantidade';
  };

  const headerActions = (
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-2xl font-bold">Radiologia</h1>
        <p className="text-sm text-muted-foreground">Gestão completa de agendas, produção e controle de exames radiológicos</p>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedDataFilter} onValueChange={setSelectedDataFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por data" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as datas</SelectItem>
              {sortedDatasComPendencias.map((item) => (
                <SelectItem key={item.data} value={item.data}>
                  {format(new Date(item.data + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })} ({item.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={toggleDateSortOrder}
                >
                  {getSortIcon()}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{getSortTooltip()}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedClienteId} onValueChange={setSelectedClienteId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Selecione o cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os clientes</SelectItem>
              {clientesComPendencias.map((cliente) => (
                <SelectItem key={cliente.id} value={cliente.id}>
                  {cliente.nome_empresa}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const clienteIdFilter = selectedClienteId === "todos" ? undefined : selectedClienteId;
  const dataFilter = selectedDataFilter === "todas" ? undefined : selectedDataFilter;

  return (
    <AppLayout headerActions={headerActions}>
      <div className="p-4 space-y-6">

        <Tabs defaultValue="agendas" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="agendas" className="gap-2">
              <Calendar className="h-4 w-4" />
              Agendas
            </TabsTrigger>
            <TabsTrigger value="producao" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Produção
            </TabsTrigger>
            <TabsTrigger value="pendencias-atrasos" className="gap-2">
              <AlertCircle className="h-4 w-4" />
              Pendências e Atrasos
            </TabsTrigger>
            <TabsTrigger value="ajuste-laudos" className="gap-2">
              <FileEdit className="h-4 w-4" />
              Revisão de Laudos
            </TabsTrigger>
            <TabsTrigger value="ecg" className="gap-2">
              <Activity className="h-4 w-4" />
              Controle de ECG
            </TabsTrigger>
            <TabsTrigger value="historico-imports" className="gap-2">
              <History className="h-4 w-4" />
              Histórico de Imports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agendas" className="space-y-6">
            <AbaAgendasAtualizada clienteIdFilter={clienteIdFilter} />
          </TabsContent>

          <TabsContent value="producao" className="space-y-6">
            <AbaProducaoExamesAtualizada clienteIdFilter={clienteIdFilter} />
          </TabsContent>

          <TabsContent value="pendencias-atrasos" className="space-y-6">
            <AbaPendenciasAtrasos clienteIdFilter={clienteIdFilter} dataFilter={dataFilter} />
          </TabsContent>

          <TabsContent value="ajuste-laudos" className="space-y-6">
            <AbaAjusteLaudos clienteIdFilter={clienteIdFilter} />
          </TabsContent>

          <TabsContent value="ecg" className="space-y-6">
            <AbaControleECG clienteIdFilter={clienteIdFilter} />
          </TabsContent>

          <TabsContent value="historico-imports" className="space-y-6">
            <AbaHistoricoImportacoes clienteIdFilter={clienteIdFilter} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
