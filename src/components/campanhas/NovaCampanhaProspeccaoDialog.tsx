import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rocket, MapPin, Stethoscope, Smartphone, Brain, Settings2, Zap, Shield } from "lucide-react";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NovaCampanhaProspeccaoDialog({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState("basico");
  const [nome, setNome] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState<string>("");
  const [regiaoEstado, setRegiaoEstado] = useState<string>("");
  const [chipIds, setChipIds] = useState<string[]>([]);
  const [rotationStrategy, setRotationStrategy] = useState("round_robin");
  const [limiteDiario, setLimiteDiario] = useState(120);
  const [batchSize, setBatchSize] = useState(10);
  const [delayMinMs, setDelayMinMs] = useState(8);
  const [delayMaxMs, setDelayMaxMs] = useState(25);
  const [delayBatchMin, setDelayBatchMin] = useState(5);
  const [delayBatchMax, setDelayBatchMax] = useState(10);
  const [mensagemInicial, setMensagemInicial] = useState("");
  // Briefing IA — campos estruturados (anti-burro)
  const [bNomeServico, setBNomeServico] = useState(""); // Ex: "Plantão UTI Pediátrica"
  const [bHospital, setBHospital] = useState(""); // Ex: "Hospital Regional do Oeste"
  const [bCidade, setBCidade] = useState(""); // Ex: "Chapecó / SC"
  const [bTipoServico, setBTipoServico] = useState(""); // plantao_12h, plantao_24h, rotineiro, producao
  const [bRequisitos, setBRequisitos] = useState(""); // Ex: "RQE em Pediatria ou experiência UTI"
  const [bEstrutura, setBEstrutura] = useState(""); // Ex: "10 leitos, suporte de especialidades"
  const [bContratacao, setBContratacao] = useState("PJ"); // PJ, CLT, Cooperativa
  const [bValorMin, setBValorMin] = useState(""); // Ex: "1200"
  const [bValorMax, setBValorMax] = useState(""); // Ex: "1800"
  const [bValorPor, setBValorPor] = useState("plantão 12h"); // plantão 12h, plantão 24h, hora, mês
  const [bBeneficios, setBBeneficios] = useState<string[]>([]); // Hospedagem, Alimentação, Passagem, etc.
  const [bHandoffNome, setBHandoffNome] = useState(""); // Ex: "Ester"
  const [bHandoffTelefone, setBHandoffTelefone] = useState(""); // Ex: "554799514821"
  const [bObjecao1, setBObjecao1] = useState("");
  const [bResposta1, setBResposta1] = useState("");
  const [bObjecao2, setBObjecao2] = useState("");
  const [bResposta2, setBResposta2] = useState("");
  const [bInfoExtra, setBInfoExtra] = useState(""); // Algo mais que a IA precisa saber?
  const qc = useQueryClient();

  const { data: especialidades = [] } = useQuery({
    queryKey: ["especialidades-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("especialidades")
        .select("id, nome, area")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: chips = [] } = useQuery({
    queryKey: ["chips-disparo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("id, nome, numero, status, pode_disparar")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: poolCount } = useQuery({
    queryKey: ["pool-count", especialidadeId, regiaoEstado],
    enabled: !!especialidadeId || !!regiaoEstado,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("merged_into_id", null)
        .not("phone_e164", "is", null)
        .neq("phone_e164", "");

      if (regiaoEstado) q = q.eq("uf", regiaoEstado);

      if (especialidadeId) {
        const { count } = await supabase
          .from("lead_especialidades")
          .select("lead_id", { count: "exact", head: true })
          .eq("especialidade_id", especialidadeId);
        return count || 0;
      }

      const { count } = await q;
      return count || 0;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const briefing = {
        nome_servico: bNomeServico,
        hospital: bHospital,
        cidade: bCidade,
        tipo_servico: bTipoServico,
        requisitos: bRequisitos,
        estrutura: bEstrutura,
        contratacao: bContratacao,
        valor_min: bValorMin,
        valor_max: bValorMax,
        valor_por: bValorPor,
        beneficios: bBeneficios,
        handoff_nome: bHandoffNome,
        handoff_telefone: bHandoffTelefone,
        objecoes: [
          ...(bObjecao1 ? [{ objecao: bObjecao1, resposta: bResposta1 }] : []),
          ...(bObjecao2 ? [{ objecao: bObjecao2, resposta: bResposta2 }] : []),
        ],
        info_extra: bInfoExtra,
      };

      const { data, error } = await supabase
        .from("campanhas")
        .insert({
          nome,
          canal: "whatsapp" as any,
          status: "ativa" as any,
          tipo_campanha: "prospeccao",
          especialidade_id: especialidadeId || null,
          regiao_estado: regiaoEstado || null,
          chip_ids: chipIds.length > 0 ? chipIds : null,
          chip_id: chipIds[0] || null,
          chip_fallback_id: chipIds[1] || null,
          rotation_strategy: rotationStrategy,
          limite_diario_campanha: limiteDiario,
          batch_size: batchSize,
          delay_min_ms: delayMinMs * 1000,
          delay_max_ms: delayMaxMs * 1000,
          delay_between_batches_min: delayBatchMin * 60,
          delay_between_batches_max: delayBatchMax * 60,
          mensagem_inicial: mensagemInicial || null,
          briefing_ia: briefing,
          criado_por: user.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      toast.success("Campanha de prospecção criada!");
      resetForm();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const resetForm = () => {
    setNome("");
    setEspecialidadeId("");
    setRegiaoEstado("");
    setChipIds([]);
    setRotationStrategy("round_robin");
    setLimiteDiario(120);
    setBatchSize(10);
    setDelayMinMs(8);
    setDelayMaxMs(25);
    setDelayBatchMin(5);
    setDelayBatchMax(10);
    setMensagemInicial("");
    setBNomeServico("");
    setBHospital("");
    setBCidade("");
    setBTipoServico("");
    setBRequisitos("");
    setBEstrutura("");
    setBContratacao("PJ");
    setBValorMin("");
    setBValorMax("");
    setBValorPor("plantão 12h");
    setBBeneficios([]);
    setBHandoffNome("");
    setBHandoffTelefone("");
    setBObjecao1("");
    setBResposta1("");
    setBObjecao2("");
    setBResposta2("");
    setBInfoExtra("");
    setTab("basico");
  };

  const espSelecionada = especialidades.find((e) => e.id === especialidadeId);
  const briefingCompleto = [bNomeServico, bHospital, bCidade, bTipoServico, bHandoffNome, bHandoffTelefone]
    .every((c) => c.trim().length > 0);
  const canCreate = nome.trim().length > 0 && briefingCompleto;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Nova Campanha de Prospecção
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="basico" className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="disparo" className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Disparo
            </TabsTrigger>
            <TabsTrigger value="mensagem" className="flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" />
              Mensagem
            </TabsTrigger>
            <TabsTrigger value="ia" className="flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5" />
              Briefing IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basico" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Nome da campanha *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Intensivistas Pediátricos - SC"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Especialidade
                </Label>
                <Select value={especialidadeId} onValueChange={setEspecialidadeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as especialidades" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-64">
                      {especialidades.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
                {espSelecionada && (
                  <Badge variant="outline" className="text-xs">
                    {espSelecionada.area}
                  </Badge>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Estado (UF)
                </Label>
                <Select value={regiaoEstado} onValueChange={setRegiaoEstado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todo o Brasil" />
                  </SelectTrigger>
                  <SelectContent>
                    {UF_LIST.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(especialidadeId || regiaoEstado) && poolCount !== undefined && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="font-medium text-primary">
                  ~{poolCount.toLocaleString("pt-BR")} leads
                </span>{" "}
                disponíveis para esses filtros
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Chips WhatsApp (selecione 1 ou mais)
              </Label>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => {
                  const selected = chipIds.includes(c.id);
                  return (
                    <Badge
                      key={c.id}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() =>
                        setChipIds((prev) =>
                          selected
                            ? prev.filter((id) => id !== c.id)
                            : [...prev, c.id]
                        )
                      }
                    >
                      {c.nome} {c.numero ? `(${c.numero})` : ""}
                    </Badge>
                  );
                })}
              </div>
              {chipIds.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {chipIds.length} chips selecionados — rotação{" "}
                  {rotationStrategy === "round_robin" ? "alternada" : "aleatória"} entre eles
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="disparo" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Configurações de proteção anti-bloqueio. Valores conservadores recomendados.
            </p>

            <div className="space-y-1.5">
              <Label>Limite diário de disparos</Label>
              <Input
                type="number"
                value={limiteDiario}
                onChange={(e) => setLimiteDiario(Number(e.target.value))}
                min={1}
                max={500}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tamanho do lote</Label>
                <Input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  min={1}
                  max={50}
                />
                <p className="text-xs text-muted-foreground">Msgs por lote</p>
              </div>

              <div className="space-y-1.5">
                <Label>Rotação de chips</Label>
                <Select value={rotationStrategy} onValueChange={setRotationStrategy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round_robin">Alternada (Round Robin)</SelectItem>
                    <SelectItem value="random">Aleatória</SelectItem>
                    <SelectItem value="single">Chip único</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Delay entre msgs (seg)</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={delayMinMs}
                    onChange={(e) => setDelayMinMs(Number(e.target.value))}
                    min={3}
                    max={60}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="number"
                    value={delayMaxMs}
                    onChange={(e) => setDelayMaxMs(Number(e.target.value))}
                    min={5}
                    max={120}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">seg</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Pausa entre lotes (min)</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={delayBatchMin}
                    onChange={(e) => setDelayBatchMin(Number(e.target.value))}
                    min={1}
                    max={30}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="number"
                    value={delayBatchMax}
                    onChange={(e) => setDelayBatchMax(Number(e.target.value))}
                    min={2}
                    max={60}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>
            </div>

            {limiteDiario > 0 && batchSize > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p>
                  <span className="font-medium">~{limiteDiario}</span> msgs/dia
                  {chipIds.length > 1 && (
                    <> ÷ {chipIds.length} chips = <span className="font-medium">~{Math.round(limiteDiario / chipIds.length)}</span>/chip</>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Cada lote de {batchSize} msgs demora ~{Math.round((batchSize * (delayMinMs + delayMaxMs)) / 2 / 60)}min,
                  pausa de {delayBatchMin}-{delayBatchMax}min entre lotes.
                  {poolCount ? (
                    <> Estimativa: ~{Math.ceil((poolCount || 0) / limiteDiario)} dias para {poolCount?.toLocaleString("pt-BR")} leads.</>
                  ) : null}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="mensagem" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Mensagem inicial do disparo</Label>
              <Textarea
                value={mensagemInicial}
                onChange={(e) => setMensagemInicial(e.target.value)}
                placeholder="Olá Dr(a). {{nome}}, tudo bem? Sou da GSS Saúde..."
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{nome}}"} para o nome do médico. Esta é a primeira mensagem
                enviada pelo disparo automático.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="ia" className="space-y-4 mt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <Brain className="h-4 w-4 inline mr-1" />
              Preencha cada campo — a IA vai usar essas informações pra conversar com os médicos automaticamente.
              Quanto mais completo, melhor a conversa.
            </div>

            <ScrollArea className="h-[400px] pr-3">
              <div className="space-y-4">
                {/* BLOCO 1: Sobre a vaga */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">Sobre a vaga</h4>

                  <div className="space-y-1">
                    <Label>Nome do serviço *</Label>
                    <Input
                      value={bNomeServico}
                      onChange={(e) => setBNomeServico(e.target.value)}
                      placeholder="Ex: UTI Pediátrica, Pronto Socorro, Ambulatório de Cardiologia"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Hospital / Unidade *</Label>
                      <Input
                        value={bHospital}
                        onChange={(e) => setBHospital(e.target.value)}
                        placeholder="Ex: Hospital Regional do Oeste"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Cidade *</Label>
                      <Input
                        value={bCidade}
                        onChange={(e) => setBCidade(e.target.value)}
                        placeholder="Ex: Chapecó / SC"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Tipo de serviço *</Label>
                      <Select value={bTipoServico} onValueChange={setBTipoServico}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="plantao_12h">Plantão 12h</SelectItem>
                          <SelectItem value="plantao_24h">Plantão 24h</SelectItem>
                          <SelectItem value="rotineiro">Rotineiro (diário)</SelectItem>
                          <SelectItem value="sobreaviso">Sobreaviso</SelectItem>
                          <SelectItem value="ambulatorio">Ambulatório</SelectItem>
                          <SelectItem value="producao">Produção</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Contratação</Label>
                      <Select value={bContratacao} onValueChange={setBContratacao}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PJ">PJ (nota fiscal)</SelectItem>
                          <SelectItem value="CLT">CLT</SelectItem>
                          <SelectItem value="Cooperativa">Cooperativa</SelectItem>
                          <SelectItem value="RPA">RPA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Requisito mínimo do médico</Label>
                    <Input
                      value={bRequisitos}
                      onChange={(e) => setBRequisitos(e.target.value)}
                      placeholder="Ex: RQE em Pediatria ou experiência comprovada em UTI Pediátrica"
                    />
                    <p className="text-xs text-muted-foreground">
                      A IA vai verificar isso na conversa antes de encaminhar o médico
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label>Estrutura do local (opcional)</Label>
                    <Textarea
                      value={bEstrutura}
                      onChange={(e) => setBEstrutura(e.target.value)}
                      placeholder="Ex: 10 leitos, 1 plantonista + 1 rotineiro por turno, suporte de especialidades"
                      rows={2}
                    />
                  </div>
                </div>

                {/* BLOCO 2: Valores e benefícios */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">Valores e benefícios</h4>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Valor mínimo (R$)</Label>
                      <Input
                        type="number"
                        value={bValorMin}
                        onChange={(e) => setBValorMin(e.target.value)}
                        placeholder="1200"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor máximo (R$)</Label>
                      <Input
                        type="number"
                        value={bValorMax}
                        onChange={(e) => setBValorMax(e.target.value)}
                        placeholder="1800"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Por</Label>
                      <Select value={bValorPor} onValueChange={setBValorPor}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="plantão 12h">Plantão 12h</SelectItem>
                          <SelectItem value="plantão 24h">Plantão 24h</SelectItem>
                          <SelectItem value="hora">Hora</SelectItem>
                          <SelectItem value="mês">Mês</SelectItem>
                          <SelectItem value="procedimento">Procedimento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Benefícios inclusos</Label>
                    <div className="flex flex-wrap gap-2">
                      {["Hospedagem", "Alimentação", "Passagem aérea", "Deslocamento", "Seguro", "Pagamento semanal", "Pagamento quinzenal"].map(
                        (b) => (
                          <Badge
                            key={b}
                            variant={bBeneficios.includes(b) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() =>
                              setBBeneficios((prev) =>
                                prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
                              )
                            }
                          >
                            {b}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* BLOCO 3: Handoff */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">
                    Quando o médico estiver interessado
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Quem a IA deve avisar quando um médico demonstrar interesse real?
                    A IA vai pedir permissão ao médico antes de passar o contato.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Nome do responsável *</Label>
                      <Input
                        value={bHandoffNome}
                        onChange={(e) => setBHandoffNome(e.target.value)}
                        placeholder="Ex: Ester, Bruna"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>WhatsApp do responsável *</Label>
                      <Input
                        value={bHandoffTelefone}
                        onChange={(e) => setBHandoffTelefone(e.target.value)}
                        placeholder="Ex: 47999514821"
                      />
                    </div>
                  </div>
                </div>

                {/* BLOCO 4: Objeções */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm border-b pb-1">
                    Objeções comuns (opcional)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Se um médico disser algo negativo, como a IA deve responder?
                  </p>

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={bObjecao1}
                        onChange={(e) => setBObjecao1(e.target.value)}
                        placeholder='Ex: "É muito longe"'
                      />
                      <Input
                        value={bResposta1}
                        onChange={(e) => setBResposta1(e.target.value)}
                        placeholder="Resposta: Oferecemos hospedagem e passagem"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={bObjecao2}
                        onChange={(e) => setBObjecao2(e.target.value)}
                        placeholder='Ex: "O valor está baixo"'
                      />
                      <Input
                        value={bResposta2}
                        onChange={(e) => setBResposta2(e.target.value)}
                        placeholder="Resposta: Negociável conforme volume e disponibilidade"
                      />
                    </div>
                  </div>
                </div>

                {/* BLOCO 5: Info extra */}
                <div className="space-y-1.5">
                  <Label>Algo mais que a IA precisa saber? (opcional)</Label>
                  <Textarea
                    value={bInfoExtra}
                    onChange={(e) => setBInfoExtra(e.target.value)}
                    placeholder="Qualquer informação adicional sobre a vaga, o hospital, a cidade ou regras especiais"
                    rows={2}
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Indicador de completude */}
            {(() => {
              const campos = [bNomeServico, bHospital, bCidade, bTipoServico, bHandoffNome, bHandoffTelefone];
              const preenchidos = campos.filter((c) => c.trim()).length;
              const total = campos.length;
              const pct = Math.round((preenchidos / total) * 100);
              return (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={pct === 100 ? "text-green-600 font-medium" : "text-amber-600"}>
                      {pct === 100 ? "Briefing completo!" : `${preenchidos}/${total} campos obrigatórios preenchidos`}
                    </span>
                    <span className="text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-amber-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>

        <div className="flex justify-between items-center pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {tab === "basico" && "Configure o alvo da campanha"}
            {tab === "disparo" && "Proteções anti-bloqueio"}
            {tab === "mensagem" && "Defina a mensagem de abertura"}
            {tab === "ia" && "Briefing para a IA conversar"}
          </p>
          <div className="flex gap-2">
            {tab !== "basico" && (
              <Button
                variant="outline"
                onClick={() => {
                  const order = ["basico", "disparo", "mensagem", "ia"];
                  const idx = order.indexOf(tab);
                  setTab(order[Math.max(0, idx - 1)]);
                }}
              >
                Voltar
              </Button>
            )}
            {tab !== "ia" ? (
              <Button
                onClick={() => {
                  const order = ["basico", "disparo", "mensagem", "ia"];
                  const idx = order.indexOf(tab);
                  setTab(order[Math.min(order.length - 1, idx + 1)]);
                }}
              >
                Próximo
              </Button>
            ) : (
              <Button
                onClick={() => criar.mutate()}
                disabled={!canCreate || criar.isPending}
              >
                {criar.isPending ? "Criando..." : "Criar Campanha"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
