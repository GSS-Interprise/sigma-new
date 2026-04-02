import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Campanha, CampanhaEnvio, STATUS_CAMPANHA, 
  useCampanha, useCampanhaEnvios 
} from "@/hooks/useCampanhas";
import { 
  Send, CheckCircle, Eye, MousePointer, MessageSquare, 
  TrendingUp, DollarSign, Download, X, Search,
  Clock, AlertCircle, BarChart3, PieChart
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart as RechartsPieChart, Pie, Cell, Legend
} from "recharts";

interface CampanhaAcompanhamentoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string;
}

const KPI_COLORS = {
  enviados: 'text-blue-600 bg-blue-100',
  entregues: 'text-emerald-600 bg-emerald-100',
  aberturas: 'text-purple-600 bg-purple-100',
  cliques: 'text-orange-600 bg-orange-100',
  respostas: 'text-pink-600 bg-pink-100',
  conversoes: 'text-green-600 bg-green-100',
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

export function CampanhaAcompanhamento({ open, onOpenChange, campanhaId }: CampanhaAcompanhamentoProps) {
  const { data: campanha, isLoading: isLoadingCampanha } = useCampanha(campanhaId);
  const { data: envios, isLoading: isLoadingEnvios } = useCampanhaEnvios(campanhaId);
  const [activeTab, setActiveTab] = useState("kpis");
  const [searchEnvio, setSearchEnvio] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  if (!campanha) return null;

  const kpis = {
    enviados: campanha.total_enviados || 0,
    entregues: campanha.total_entregues || 0,
    aberturas: campanha.total_aberturas || 0,
    cliques: campanha.total_cliques || 0,
    respostas: campanha.total_respostas || 0,
    conversoes: campanha.total_conversoes || 0,
    custo: campanha.custo_total || 0,
    roi: campanha.total_conversoes && campanha.custo_total 
      ? ((campanha.total_conversoes * 100) / campanha.custo_total).toFixed(1)
      : '0',
  };

  const taxaAbertura = kpis.enviados ? ((kpis.aberturas / kpis.enviados) * 100).toFixed(1) : '0';
  const taxaClique = kpis.aberturas ? ((kpis.cliques / kpis.aberturas) * 100).toFixed(1) : '0';
  const taxaConversao = kpis.enviados ? ((kpis.conversoes / kpis.enviados) * 100).toFixed(1) : '0';

  // Mock data for charts - in production, this would come from real data
  const aberturasPorHorario = [
    { hora: '06h', aberturas: 12 },
    { hora: '08h', aberturas: 45 },
    { hora: '10h', aberturas: 78 },
    { hora: '12h', aberturas: 56 },
    { hora: '14h', aberturas: 89 },
    { hora: '16h', aberturas: 67 },
    { hora: '18h', aberturas: 43 },
    { hora: '20h', aberturas: 23 },
  ];

  const curvaRespostas = [
    { dia: '1', respostas: 5 },
    { dia: '2', respostas: 12 },
    { dia: '3', respostas: 18 },
    { dia: '4', respostas: 22 },
    { dia: '5', respostas: 25 },
    { dia: '6', respostas: 27 },
    { dia: '7', respostas: 28 },
  ];

  const engajamentoPorEspecialidade = [
    { name: 'Cardiologia', value: 35 },
    { name: 'Radiologia', value: 28 },
    { name: 'Ortopedia', value: 20 },
    { name: 'Outros', value: 17 },
  ];

  const filteredEnvios = envios?.filter(e => {
    const matchSearch = !searchEnvio || 
      e.destinatario_nome?.toLowerCase().includes(searchEnvio.toLowerCase()) ||
      e.destinatario_email?.toLowerCase().includes(searchEnvio.toLowerCase());
    const matchStatus = filterStatus === 'all' || e.status === filterStatus;
    return matchSearch && matchStatus;
  }) || [];

  const handleExportCSV = () => {
    const headers = ['Nome', 'Email', 'Telefone', 'Status', 'Data Envio', 'Abertura', 'Clique', 'Resposta'];
    const rows = filteredEnvios.map(e => [
      e.destinatario_nome || '',
      e.destinatario_email || '',
      e.destinatario_telefone || '',
      e.status,
      e.data_envio ? format(new Date(e.data_envio), 'dd/MM/yyyy HH:mm') : '',
      e.data_abertura ? format(new Date(e.data_abertura), 'dd/MM/yyyy HH:mm') : '',
      e.data_clique ? format(new Date(e.data_clique), 'dd/MM/yyyy HH:mm') : '',
      e.data_resposta ? format(new Date(e.data_resposta), 'dd/MM/yyyy HH:mm') : '',
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campanha_${campanha.nome}_envios.csv`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">{campanha.nome}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{campanha.objetivo}</p>
            </div>
            <Badge variant={STATUS_CAMPANHA[campanha.status as keyof typeof STATUS_CAMPANHA]?.variant || 'outline'}>
              {STATUS_CAMPANHA[campanha.status as keyof typeof STATUS_CAMPANHA]?.label || campanha.status}
            </Badge>
          </div>
        </DialogHeader>

        {isLoadingCampanha ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="kpis" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                KPIs e Gráficos
              </TabsTrigger>
              <TabsTrigger value="logs" className="gap-2">
                <Clock className="h-4 w-4" />
                Logs de Envio
              </TabsTrigger>
              <TabsTrigger value="exportar" className="gap-2">
                <Download className="h-4 w-4" />
                Exportar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="kpis" className="space-y-6">
              {/* KPIs principais */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${KPI_COLORS.enviados}`}>
                        <Send className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{kpis.enviados}</p>
                        <p className="text-sm text-muted-foreground">Enviados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${KPI_COLORS.entregues}`}>
                        <CheckCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{kpis.entregues}</p>
                        <p className="text-sm text-muted-foreground">Entregues</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${KPI_COLORS.aberturas}`}>
                        <Eye className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{kpis.aberturas}</p>
                        <p className="text-sm text-muted-foreground">Aberturas ({taxaAbertura}%)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${KPI_COLORS.cliques}`}>
                        <MousePointer className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{kpis.cliques}</p>
                        <p className="text-sm text-muted-foreground">Cliques ({taxaClique}%)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${KPI_COLORS.respostas}`}>
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{kpis.respostas}</p>
                        <p className="text-sm text-muted-foreground">Respostas</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${KPI_COLORS.conversoes}`}>
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{kpis.conversoes}</p>
                        <p className="text-sm text-muted-foreground">Conversões ({taxaConversao}%)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg text-red-600 bg-red-100">
                        <DollarSign className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">R$ {kpis.custo.toLocaleString('pt-BR')}</p>
                        <p className="text-sm text-muted-foreground">Custo Total</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg text-emerald-600 bg-emerald-100">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{kpis.roi}%</p>
                        <p className="text-sm text-muted-foreground">ROI</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Gráficos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Aberturas por Horário</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={aberturasPorHorario}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hora" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="aberturas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Curva de Respostas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={curvaRespostas}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dia" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Line 
                          type="monotone" 
                          dataKey="respostas" 
                          stroke="#10b981" 
                          strokeWidth={2}
                          dot={{ fill: '#10b981' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="shadow-sm md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Engajamento por Especialidade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <RechartsPieChart>
                        <Pie
                          data={engajamentoPorEspecialidade}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {engajamentoPorEspecialidade.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={searchEnvio}
                    onChange={(e) => setSearchEnvio(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="enviado">Enviado</SelectItem>
                    <SelectItem value="entregue">Entregue</SelectItem>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="clicado">Clicado</SelectItem>
                    <SelectItem value="respondido">Respondido</SelectItem>
                    <SelectItem value="falha">Falha</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoadingEnvios ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Envio</TableHead>
                        <TableHead>Abertura</TableHead>
                        <TableHead>Motivo Falha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEnvios.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            Nenhum envio encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEnvios.map((envio) => (
                          <TableRow key={envio.id}>
                            <TableCell className="font-medium">{envio.destinatario_nome || '-'}</TableCell>
                            <TableCell className="text-sm">
                              {envio.destinatario_email || envio.destinatario_telefone || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={envio.status === 'falha' ? 'destructive' : 'outline'}>
                                {envio.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {envio.data_envio 
                                ? format(new Date(envio.data_envio), 'dd/MM HH:mm', { locale: ptBR })
                                : '-'
                              }
                            </TableCell>
                            <TableCell className="text-sm">
                              {envio.data_abertura 
                                ? format(new Date(envio.data_abertura), 'dd/MM HH:mm', { locale: ptBR })
                                : '-'
                              }
                            </TableCell>
                            <TableCell className="text-sm text-red-600">
                              {envio.motivo_falha || '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="exportar" className="space-y-4">
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Exportar Dados da Campanha</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Button variant="outline" className="h-20 flex-col gap-2" onClick={handleExportCSV}>
                    <Download className="h-6 w-6" />
                    <span>Exportar CSV</span>
                    <span className="text-xs text-muted-foreground">Lista de envios completa</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex-col gap-2" disabled>
                    <Download className="h-6 w-6" />
                    <span>Relatório PDF</span>
                    <span className="text-xs text-muted-foreground">Em breve</span>
                  </Button>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
