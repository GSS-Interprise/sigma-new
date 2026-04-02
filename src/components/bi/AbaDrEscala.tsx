import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDrEscalaBI } from "@/hooks/useDrEscalaBI";
import { Calendar, Users, Clock, Building2, Loader2, TrendingUp, BarChart3 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

const ANOS = [2024, 2025, 2026, 2027];

export function AbaDrEscala() {
  const currentDate = new Date();
  const [mes, setMes] = useState(currentDate.getMonth() + 1);
  const [ano, setAno] = useState(currentDate.getFullYear());
  const [localId, setLocalId] = useState<number | undefined>(undefined);
  const [setorId, setSetorId] = useState<number | undefined>(undefined);

  const {
    locais,
    setores,
    plantoes,
    profissionaisAgregados,
    plantoesPorDia,
    totalPlantoes,
    totalProfissionais,
    isLoading,
    isError,
    error,
  } = useDrEscalaBI(mes, ano, localId, setorId);

  // Dados para o gráfico de profissionais (top 10)
  const chartProfissionais = profissionaisAgregados
    .slice(0, 10)
    .map((p) => ({
      nome: p.nome.split(" ").slice(0, 2).join(" "), // Primeiros 2 nomes
      plantoes: p.totalPlantoes,
    }));

  // Dados para o gráfico de linha (plantões por dia)
  const chartPlantoesDia = plantoesPorDia.map((p) => ({
    dia: format(parseISO(p.data), "dd/MM", { locale: ptBR }),
    plantoes: p.count,
  }));

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Mês</label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Ano</label>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANOS.map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Local</label>
              <Select
                value={localId ? String(localId) : "__all__"}
                onValueChange={(v) => setLocalId(v === "__all__" ? undefined : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os locais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os locais</SelectItem>
                  {locais.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Setor</label>
              <Select
                value={setorId ? String(setorId) : "__all__"}
                onValueChange={(v) => setSetorId(v === "__all__" ? undefined : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os setores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os setores</SelectItem>
                  {setores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Carregando dados...</span>
        </div>
      )}

      {isError && (
        <Card className="border-destructive">
          <CardContent className="py-6">
            <p className="text-destructive">Erro ao carregar dados: {(error as Error)?.message}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total de Plantões</p>
                    <p className="text-3xl font-bold">{totalPlantoes.toLocaleString("pt-BR")}</p>
                  </div>
                  <Clock className="h-8 w-8 text-primary opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Profissionais</p>
                    <p className="text-3xl font-bold">{totalProfissionais}</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-500 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Locais</p>
                    <p className="text-3xl font-bold">{locais.length}</p>
                  </div>
                  <Building2 className="h-8 w-8 text-green-500 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Média/Dia</p>
                    <p className="text-3xl font-bold">
                      {plantoesPorDia.length > 0
                        ? Math.round(totalPlantoes / plantoesPorDia.length)
                        : 0}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-orange-500 opacity-80" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos e Tabelas */}
          <Tabs defaultValue="visao-geral" className="space-y-4">
            <TabsList>
              <TabsTrigger value="visao-geral" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="profissionais" className="gap-2">
                <Users className="h-4 w-4" />
                Por Profissional
              </TabsTrigger>
              <TabsTrigger value="detalhes" className="gap-2">
                <Calendar className="h-4 w-4" />
                Detalhes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visao-geral" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Gráfico de linha - Plantões por dia */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Plantões por Dia</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartPlantoesDia}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="dia" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="plantoes"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Gráfico de barras - Top profissionais */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top 10 Profissionais</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartProfissionais} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" fontSize={12} />
                          <YAxis dataKey="nome" type="category" width={120} fontSize={11} />
                          <Tooltip />
                          <Bar dataKey="plantoes" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="profissionais">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profissionais e Plantões</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Profissional</TableHead>
                          <TableHead className="text-right">Total Plantões</TableHead>
                          <TableHead className="text-right">Dias Diferentes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profissionaisAgregados.map((p, idx) => (
                          <TableRow key={p.nome}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {idx < 3 && (
                                  <Badge variant={idx === 0 ? "default" : "secondary"}>
                                    #{idx + 1}
                                  </Badge>
                                )}
                                {p.nome}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {p.totalPlantoes}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {p.datasPlantoes.length}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="detalhes">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Todos os Plantões</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Hora</TableHead>
                          <TableHead>Profissional</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plantoes.slice(0, 200).map((p, idx) => (
                          <TableRow key={`${p.data}-${p.hora}-${p.nome_profissional}-${idx}`}>
                            <TableCell>
                              {format(parseISO(p.data), "dd/MM/yyyy", { locale: ptBR })}
                            </TableCell>
                            <TableCell>{p.hora}</TableCell>
                            <TableCell>{p.nome_profissional}</TableCell>
                          </TableRow>
                        ))}
                        {plantoes.length > 200 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              Mostrando 200 de {plantoes.length} registros. Use os filtros para refinar.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
