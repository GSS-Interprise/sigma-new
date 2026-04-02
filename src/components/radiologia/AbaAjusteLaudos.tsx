import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Search, Link2, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { toLocalTime } from "@/lib/dateUtils";
import { FileUpload } from "./FileUpload";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const MOTIVOS = ["Erro de digitação", "Informação clínica incompleta", "Padrão fora do protocolo", "Solicitado pelo cliente", "Outro"];
const STATUS = ["Pendente", "Em Ajuste", "Ajustado"];

interface AbaAjusteLaudosProps {
  clienteIdFilter?: string;
}

interface PendenciaOption {
  id: string;
  acesso: string;
  nome_paciente: string;
  segmento: string;
  cliente_id: string;
  medico_id: string | null;
  medico_nome: string | null;
  cliente_nome: string | null;
}

export function AbaAjusteLaudos({ clienteIdFilter }: AbaAjusteLaudosProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPendencia, setSelectedPendencia] = useState<PendenciaOption | null>(null);
  
  const [formData, setFormData] = useState({
    cliente_id: "",
    medico_responsavel_id: "",
    segmento: "",
    identificador_laudo: "",
    data_emissao: "",
    motivo_ajuste: "",
    descricao_ajuste: "",
    status: "Pendente",
    responsavel_ajuste_id: "",
    prazo_ajuste: "",
    anexos: [] as string[],
    pendencia_id: "",
    nome_paciente: "",
    cod_acesso: ""
  });

  // Buscar ajustes existentes
  const { data: ajustes, isLoading } = useQuery({
    queryKey: ["radiologia_ajuste_laudos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("radiologia_ajuste_laudos")
        .select(`
          *,
          clientes:cliente_id(nome_empresa),
          medico_responsavel:medico_responsavel_id(nome_completo),
          responsavel_ajuste:responsavel_ajuste_id(nome_completo)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Buscar clientes que têm pendências — 2 queries fixas em vez de N+1
  const { data: clientes } = useQuery({
    queryKey: ["clientes_com_pendencias_radiologia"],
    queryFn: async () => {
      // Query 1: IDs distintos de clientes com pendências
      const { data: pendencias, error: pendError } = await supabase
        .from("radiologia_pendencias")
        .select("cliente_id");

      if (pendError) throw pendError;

      const idsComPendencias = new Set(
        (pendencias || []).map(p => p.cliente_id).filter(Boolean)
      );

      if (idsComPendencias.size === 0) return [];

      // Query 2: buscar apenas os clientes que têm pendências
      const { data: allClientes, error: clientesError } = await supabase
        .from("clientes")
        .select("id, nome_empresa")
        .in("id", [...idsComPendencias])
        .order("nome_empresa");

      if (clientesError) throw clientesError;
      return allClientes || [];
    }
  });

  // Buscar médicos que têm pendências
  const { data: medicos } = useQuery({
    queryKey: ["medicos_com_pendencias_radiologia"],
    queryFn: async () => {
      const { data: pendencias, error: pendenciasError } = await supabase
        .from("radiologia_pendencias")
        .select("medico_id")
        .not("medico_id", "is", null);
      
      if (pendenciasError) throw pendenciasError;
      
      const medicoIds = [...new Set(pendencias?.map(p => p.medico_id) || [])];
      
      if (medicoIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("medicos")
        .select("id, nome_completo")
        .in("id", medicoIds)
        .order("nome_completo");
      
      if (error) throw error;
      return data;
    }
  });

  // Buscar segmentos únicos das pendências
  const { data: segmentos } = useQuery({
    queryKey: ["segmentos_pendencias_radiologia"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("radiologia_pendencias")
        .select("segmento")
        .not("segmento", "is", null);
      
      if (error) throw error;
      
      const uniqueSegmentos = [...new Set(data?.map(p => p.segmento) || [])];
      return uniqueSegmentos.filter(s => s).sort();
    }
  });

  // Buscar pendências para autocomplete (apenas do cliente selecionado)
  const { data: pendenciasSearch } = useQuery({
    queryKey: ["pendencias_search", formData.cliente_id, searchTerm],
    queryFn: async () => {
      if (!formData.cliente_id) return [];
      
      let query = supabase
        .from("radiologia_pendencias")
        .select(`
          id,
          acesso,
          nome_paciente,
          segmento,
          cliente_id,
          medico_id,
          medico_atribuido_nome,
          clientes:cliente_id(nome_empresa)
        `)
        .eq("cliente_id", formData.cliente_id)
        .limit(50);
      
      if (searchTerm.length >= 2) {
        query = query.or(`acesso.ilike.%${searchTerm}%,nome_paciente.ilike.%${searchTerm}%`);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      
      return (data || []).map(p => ({
        id: p.id,
        acesso: p.acesso || "",
        nome_paciente: p.nome_paciente || "",
        segmento: p.segmento || "",
        cliente_id: p.cliente_id || "",
        medico_id: p.medico_id,
        medico_nome: p.medico_atribuido_nome,
        cliente_nome: (p.clientes as any)?.nome_empresa || ""
      })) as PendenciaOption[];
    },
    enabled: !!formData.cliente_id
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("radiologia_ajuste_laudos").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_ajuste_laudos"] });
      toast({ title: "Ajuste registrado com sucesso" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar ajuste", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("radiologia_ajuste_laudos").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_ajuste_laudos"] });
      toast({ title: "Ajuste atualizado" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("radiologia_ajuste_laudos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radiologia_ajuste_laudos"] });
      toast({ title: "Ajuste excluído" });
    }
  });

  const resetForm = () => {
    setFormData({
      cliente_id: "",
      medico_responsavel_id: "",
      segmento: "",
      identificador_laudo: "",
      data_emissao: "",
      motivo_ajuste: "",
      descricao_ajuste: "",
      status: "Pendente",
      responsavel_ajuste_id: "",
      prazo_ajuste: "",
      anexos: [],
      pendencia_id: "",
      nome_paciente: "",
      cod_acesso: ""
    });
    setEditingId(null);
    setSelectedPendencia(null);
    setSearchTerm("");
  };

  const handleSelectPendencia = (pendencia: PendenciaOption) => {
    setSelectedPendencia(pendencia);
    setFormData(prev => ({
      ...prev,
      pendencia_id: pendencia.id,
      cod_acesso: pendencia.acesso,
      nome_paciente: pendencia.nome_paciente,
      segmento: pendencia.segmento,
      medico_responsavel_id: pendencia.medico_id || prev.medico_responsavel_id,
      identificador_laudo: pendencia.acesso
    }));
    setSearchOpen(false);
    setSearchTerm("");
  };

  const handleClearPendencia = () => {
    setSelectedPendencia(null);
    setFormData(prev => ({
      ...prev,
      pendencia_id: "",
      cod_acesso: "",
      nome_paciente: "",
      segmento: "",
      identificador_laudo: ""
    }));
  };

  const handleEdit = (ajuste: any) => {
    setFormData({
      cliente_id: ajuste.cliente_id || "",
      medico_responsavel_id: ajuste.medico_responsavel_id || "",
      segmento: ajuste.segmento || "",
      identificador_laudo: ajuste.identificador_laudo || "",
      data_emissao: ajuste.data_emissao || "",
      motivo_ajuste: ajuste.motivo_ajuste || "",
      descricao_ajuste: ajuste.descricao_ajuste || "",
      status: ajuste.status || "Pendente",
      responsavel_ajuste_id: ajuste.responsavel_ajuste_id || "",
      prazo_ajuste: ajuste.prazo_ajuste ? ajuste.prazo_ajuste.substring(0, 16) : "",
      anexos: ajuste.anexos || [],
      pendencia_id: ajuste.pendencia_id || "",
      nome_paciente: ajuste.nome_paciente || "",
      cod_acesso: ajuste.cod_acesso || ""
    });
    setEditingId(ajuste.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: any = { ...formData };
    
    // Limpar campos opcionais vazios
    if (!submitData.responsavel_ajuste_id) delete submitData.responsavel_ajuste_id;
    if (!submitData.prazo_ajuste) delete submitData.prazo_ajuste;
    if (!submitData.pendencia_id) delete submitData.pendencia_id;
    if (!submitData.nome_paciente) delete submitData.nome_paciente;
    if (!submitData.cod_acesso) delete submitData.cod_acesso;
    
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Ajustado": return "default";
      case "Em Ajuste": return "secondary";
      default: return "destructive";
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Ajuste de Laudos</h3>
            <p className="text-sm text-muted-foreground">
              Controle de laudos que necessitam ajustes - vinculado às pendências importadas
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Ajuste
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Ajuste" : "Novo Ajuste de Laudo"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Seleção de Cliente */}
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select 
                    value={formData.cliente_id} 
                    onValueChange={(value) => {
                      setFormData({ ...formData, cliente_id: value });
                      handleClearPendencia();
                    }} 
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome_empresa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Busca de Pendência */}
                {formData.cliente_id && (
                  <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                    <Label className="flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      Vincular a Pendência (opcional)
                    </Label>
                    
                    {selectedPendencia ? (
                      <div className="flex items-center gap-2 p-3 bg-background border rounded-md">
                        <div className="flex-1">
                          <p className="font-medium">{selectedPendencia.nome_paciente || "Paciente não informado"}</p>
                          <p className="text-sm text-muted-foreground">
                            Acesso: {selectedPendencia.acesso} | Segmento: {selectedPendencia.segmento}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={handleClearPendencia}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={searchOpen}
                            className="w-full justify-start"
                          >
                            <Search className="h-4 w-4 mr-2" />
                            Buscar por acesso ou nome do paciente...
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[500px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput 
                              placeholder="Digite o acesso ou nome do paciente..." 
                              value={searchTerm}
                              onValueChange={setSearchTerm}
                            />
                            <CommandList>
                              <CommandEmpty>
                                {searchTerm.length < 2 
                                  ? "Digite pelo menos 2 caracteres para buscar..."
                                  : "Nenhuma pendência encontrada."
                                }
                              </CommandEmpty>
                              <CommandGroup heading="Pendências">
                                <ScrollArea className="h-[200px]">
                                  {pendenciasSearch?.map((p) => (
                                    <CommandItem
                                      key={p.id}
                                      value={p.id}
                                      onSelect={() => handleSelectPendencia(p)}
                                      className="cursor-pointer"
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{p.nome_paciente || "Paciente não informado"}</span>
                                        <span className="text-sm text-muted-foreground">
                                          Acesso: {p.acesso} | {p.segmento}
                                        </span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </ScrollArea>
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                )}

                {/* Campos preenchidos pela pendência ou manualmente */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Código de Acesso</Label>
                    <Input 
                      value={formData.cod_acesso} 
                      onChange={(e) => setFormData({ ...formData, cod_acesso: e.target.value })}
                      placeholder="Preenchido ao vincular pendência"
                      readOnly={!!selectedPendencia}
                      className={selectedPendencia ? "bg-muted" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do Paciente</Label>
                    <Input 
                      value={formData.nome_paciente} 
                      onChange={(e) => setFormData({ ...formData, nome_paciente: e.target.value })}
                      placeholder="Preenchido ao vincular pendência"
                      readOnly={!!selectedPendencia}
                      className={selectedPendencia ? "bg-muted" : ""}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Médico Responsável *</Label>
                    <Select 
                      value={formData.medico_responsavel_id} 
                      onValueChange={(value) => setFormData({ ...formData, medico_responsavel_id: value })} 
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {medicos?.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Segmento *</Label>
                    <Select 
                      value={formData.segmento} 
                      onValueChange={(value) => setFormData({ ...formData, segmento: value })} 
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {segmentos?.map((seg) => (
                          <SelectItem key={seg} value={seg}>{seg}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>ID Laudo *</Label>
                    <Input 
                      value={formData.identificador_laudo} 
                      onChange={(e) => setFormData({ ...formData, identificador_laudo: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Emissão *</Label>
                    <Input 
                      type="date" 
                      value={formData.data_emissao} 
                      onChange={(e) => setFormData({ ...formData, data_emissao: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status *</Label>
                    <Select 
                      value={formData.status} 
                      onValueChange={(value) => setFormData({ ...formData, status: value })} 
                      required
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Motivo *</Label>
                    <Select 
                      value={formData.motivo_ajuste} 
                      onValueChange={(value) => setFormData({ ...formData, motivo_ajuste: value })} 
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIVOS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Responsável Ajuste</Label>
                    <Select 
                      value={formData.responsavel_ajuste_id} 
                      onValueChange={(value) => setFormData({ ...formData, responsavel_ajuste_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {medicos?.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Prazo</Label>
                    <Input 
                      type="datetime-local" 
                      value={formData.prazo_ajuste} 
                      onChange={(e) => setFormData({ ...formData, prazo_ajuste: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição do Ajuste *</Label>
                  <Textarea 
                    value={formData.descricao_ajuste} 
                    onChange={(e) => setFormData({ ...formData, descricao_ajuste: e.target.value })} 
                    required 
                    rows={3} 
                    placeholder="Descreva o ajuste necessário..."
                  />
                </div>

                <FileUpload 
                  value={formData.anexos} 
                  onChange={(urls) => setFormData({ ...formData, anexos: urls })}
                  label="Anexos"
                  description="Adicione prints, PDFs, documentos ou qualquer tipo de arquivo"
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingId ? "Atualizar" : "Criar Ajuste"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Acesso</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Médico</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ajustes?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum ajuste de laudo registrado
                  </TableCell>
                </TableRow>
              )}
              {ajustes?.map((aj: any) => (
                <TableRow key={aj.id}>
                  <TableCell className="font-mono text-sm">
                    {aj.cod_acesso || aj.identificador_laudo}
                    {aj.pendencia_id && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        <Link2 className="h-3 w-3 mr-1" />
                        Vinculado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{aj.nome_paciente || "-"}</TableCell>
                  <TableCell>{(aj.clientes as any)?.nome_empresa}</TableCell>
                  <TableCell><Badge variant="outline">{aj.segmento}</Badge></TableCell>
                  <TableCell>{(aj.medico_responsavel as any)?.nome_completo}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(aj.status)}>{aj.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {aj.prazo_ajuste ? format(toLocalTime(aj.prazo_ajuste), "dd/MM/yyyy HH:mm") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(aj)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          if (confirm("Tem certeza que deseja excluir este ajuste?")) {
                            deleteMutation.mutate(aj.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
