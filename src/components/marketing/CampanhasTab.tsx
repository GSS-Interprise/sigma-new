import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  useCampanhas, useCampanhaMutations, 
  STATUS_CAMPANHA, CANAIS_CAMPANHA, CampanhaFilters 
} from "@/hooks/useCampanhas";
import { CampanhaDialog } from "./campanhas/CampanhaDialog";
import { CampanhaAcompanhamento } from "./campanhas/CampanhaAcompanhamento";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Plus, Search, MoreHorizontal, Edit, Pause, Play, 
  Copy, Archive, Trash2, BarChart3, Eye, 
  MessageSquare, Mail, Smartphone, Instagram, Bell, Zap,
  TrendingUp, Users, Send
} from "lucide-react";

const CANAL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageSquare className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  sms: <Smartphone className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  push: <Bell className="h-4 w-4" />,
  automacao: <Zap className="h-4 w-4" />,
};

export function CampanhasTab() {
  const [filters, setFilters] = useState<CampanhaFilters>({
    search: '',
    status: 'all',
    canal: 'all',
    periodo: 'all',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: campanhas, isLoading } = useCampanhas(filters);
  const { deleteMutation, duplicateMutation, updateStatusMutation } = useCampanhaMutations();

  const handleEdit = (id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleDuplicate = (id: string) => {
    duplicateMutation.mutate(id);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setDeleteId(null);
    }
  };

  const handleTogglePause = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pausada' ? 'ativa' : 'pausada';
    updateStatusMutation.mutate({ id, status: newStatus });
  };

  const handleArchive = (id: string) => {
    updateStatusMutation.mutate({ id, status: 'arquivada' });
  };

  // Resumo de KPIs do módulo
  const totalCampanhas = campanhas?.length || 0;
  const campanhasAtivas = campanhas?.filter(c => c.status === 'ativa').length || 0;
  const totalEnviados = campanhas?.reduce((acc, c) => acc + (c.total_enviados || 0), 0) || 0;
  const totalRespostas = campanhas?.reduce((acc, c) => acc + (c.total_respostas || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header com KPIs resumidos */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Campanhas de Marketing</h2>
          <p className="text-muted-foreground">Gerencie e acompanhe suas campanhas de captação</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Campanha
        </Button>
      </div>

      {/* KPIs resumidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCampanhas}</p>
                <p className="text-sm text-muted-foreground">Total de Campanhas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                <Play className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{campanhasAtivas}</p>
                <p className="text-sm text-muted-foreground">Campanhas Ativas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEnviados.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-muted-foreground">Total Enviados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalRespostas.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-muted-foreground">Total Respostas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="shadow-sm">
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar campanha..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-10"
              />
            </div>
            <Select 
              value={filters.periodo} 
              onValueChange={(value) => setFilters(prev => ({ ...prev, periodo: value }))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                <SelectItem value="mes_atual">Mês atual</SelectItem>
                <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                <SelectItem value="trimestre">Último trimestre</SelectItem>
              </SelectContent>
            </Select>
            <Select 
              value={filters.status} 
              onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_CAMPANHA).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select 
              value={filters.canal} 
              onValueChange={(value) => setFilters(prev => ({ ...prev, canal: value }))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                {Object.entries(CANAIS_CAMPANHA).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de campanhas */}
      <Card className="shadow-sm">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Público</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-center">Enviados</TableHead>
                <TableHead className="text-center">Aberturas</TableHead>
                <TableHead className="text-center">Respostas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!campanhas || campanhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhuma campanha encontrada
                  </TableCell>
                </TableRow>
              ) : (
                campanhas.map((campanha) => {
                  const statusConfig = STATUS_CAMPANHA[campanha.status as keyof typeof STATUS_CAMPANHA];
                  const canalConfig = CANAIS_CAMPANHA[campanha.canal as keyof typeof CANAIS_CAMPANHA];
                  const taxaAbertura = campanha.total_enviados 
                    ? ((campanha.total_aberturas || 0) / campanha.total_enviados * 100).toFixed(1) 
                    : '0';
                  const publicoResumo = campanha.publico_alvo?.especialidades?.length
                    ? `${campanha.publico_alvo.especialidades.slice(0, 2).join(', ')}${campanha.publico_alvo.especialidades.length > 2 ? '...' : ''}`
                    : 'Todos';

                  return (
                    <TableRow key={campanha.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {campanha.status === 'ativa' && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                          )}
                          <div>
                            <p className="font-medium">{campanha.nome}</p>
                            {campanha.objetivo && (
                              <p className="text-sm text-muted-foreground line-clamp-1">{campanha.objetivo}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig?.variant || 'outline'} className={statusConfig?.color}>
                          {statusConfig?.label || campanha.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {CANAL_ICONS[campanha.canal]}
                          <span>{canalConfig?.label || campanha.canal}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{publicoResumo}</span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {campanha.data_inicio 
                            ? format(new Date(campanha.data_inicio), 'dd/MM/yy', { locale: ptBR })
                            : '-'
                          }
                          {campanha.data_termino && (
                            <> - {format(new Date(campanha.data_termino), 'dd/MM/yy', { locale: ptBR })}</>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {campanha.total_enviados || 0}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{campanha.total_aberturas || 0}</span>
                        <span className="text-muted-foreground text-xs ml-1">({taxaAbertura}%)</span>
                      </TableCell>
                      <TableCell className="text-center font-medium text-emerald-600">
                        {campanha.total_respostas || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewingId(campanha.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Dashboard
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(campanha.id)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            {campanha.status === 'ativa' || campanha.status === 'pausada' ? (
                              <DropdownMenuItem onClick={() => handleTogglePause(campanha.id, campanha.status)}>
                                {campanha.status === 'pausada' ? (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Retomar
                                  </>
                                ) : (
                                  <>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Pausar
                                  </>
                                )}
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onClick={() => handleDuplicate(campanha.id)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleArchive(campanha.id)}>
                              <Archive className="h-4 w-4 mr-2" />
                              Arquivar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => setDeleteId(campanha.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Dialogs */}
      <CampanhaDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        campanhaId={editingId}
      />

      {viewingId && (
        <CampanhaAcompanhamento
          open={!!viewingId}
          onOpenChange={(open) => !open && setViewingId(null)}
          campanhaId={viewingId}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados da campanha serão permanentemente excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
