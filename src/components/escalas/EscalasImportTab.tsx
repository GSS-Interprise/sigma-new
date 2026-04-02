import { useState, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Download,
  History,
  Clock
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

interface ImportedEscala {
  id_externo: string;
  profissional_nome: string;
  profissional_crm?: string;
  setor: string;
  unidade?: string;
  data_escala: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_plantao?: string;
  status_escala?: string;
  erro?: string;
}

interface IntegracaoLog {
  id: string;
  data_sincronizacao: string;
  sistema_origem: string;
  tipo_operacao: string;
  status: string;
  total_registros: number;
  registros_sucesso: number;
  registros_erro: number;
  mensagem: string | null;
  arquivo_nome: string | null;
}

const COLUNAS_ESPERADAS = [
  { campo: "id_externo", label: "ID Externo", obrigatorio: true },
  { campo: "profissional_nome", label: "Nome do Profissional", obrigatorio: true },
  { campo: "profissional_crm", label: "CRM", obrigatorio: false },
  { campo: "setor", label: "Setor", obrigatorio: true },
  { campo: "unidade", label: "Unidade", obrigatorio: false },
  { campo: "data_escala", label: "Data (YYYY-MM-DD)", obrigatorio: true },
  { campo: "hora_inicio", label: "Hora Início (HH:MM)", obrigatorio: true },
  { campo: "hora_fim", label: "Hora Fim (HH:MM)", obrigatorio: true },
  { campo: "tipo_plantao", label: "Tipo de Plantão", obrigatorio: false },
  { campo: "status_escala", label: "Status", obrigatorio: false },
];

export function EscalasImportTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [escalasPreview, setEscalasPreview] = useState<ImportedEscala[]>([]);
  const [errosValidacao, setErrosValidacao] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  // Buscar logs de integração
  const { data: logs = [] } = useQuery({
    queryKey: ["escalas-integracao-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalas_integracao_logs" as any)
        .select("*")
        .order("data_sincronizacao", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data as unknown) as IntegracaoLog[];
    },
  });

  // Processar arquivo
  const processarArquivo = async (file: File) => {
    setArquivo(file);
    setErrosValidacao([]);
    setEscalasPreview([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

      if (jsonData.length === 0) {
        setErrosValidacao(["Arquivo vazio ou sem dados válidos"]);
        return;
      }

      const erros: string[] = [];
      const escalasValidas: ImportedEscala[] = [];

      // Validar cada linha
      jsonData.forEach((row, index) => {
        const linha = index + 2; // +2 porque Excel começa em 1 e tem header

        // Mapear colunas (case insensitive)
        const escala: ImportedEscala = {
          id_externo: String(row["id_externo"] || row["ID Externo"] || row["ID"] || `IMPORT-${Date.now()}-${index}`),
          profissional_nome: String(row["profissional_nome"] || row["Nome do Profissional"] || row["Nome"] || ""),
          profissional_crm: String(row["profissional_crm"] || row["CRM"] || row["crm"] || ""),
          setor: String(row["setor"] || row["Setor"] || row["SETOR"] || ""),
          unidade: String(row["unidade"] || row["Unidade"] || row["UNIDADE"] || ""),
          data_escala: formatarData(row["data_escala"] || row["Data"] || row["DATA"]),
          hora_inicio: formatarHora(row["hora_inicio"] || row["Hora Início"] || row["Início"] || row["INICIO"]),
          hora_fim: formatarHora(row["hora_fim"] || row["Hora Fim"] || row["Fim"] || row["FIM"]),
          tipo_plantao: String(row["tipo_plantao"] || row["Tipo de Plantão"] || row["Tipo"] || ""),
          status_escala: String(row["status_escala"] || row["Status"] || row["STATUS"] || "confirmado"),
        };

        // Validações
        const errosLinha: string[] = [];

        if (!escala.profissional_nome) {
          errosLinha.push("Nome do profissional obrigatório");
        }
        if (!escala.setor) {
          errosLinha.push("Setor obrigatório");
        }
        if (!escala.data_escala || !/^\d{4}-\d{2}-\d{2}$/.test(escala.data_escala)) {
          errosLinha.push("Data inválida (use YYYY-MM-DD)");
        }
        if (!escala.hora_inicio || !/^\d{2}:\d{2}(:\d{2})?$/.test(escala.hora_inicio)) {
          errosLinha.push("Hora início inválida (use HH:MM)");
        }
        if (!escala.hora_fim || !/^\d{2}:\d{2}(:\d{2})?$/.test(escala.hora_fim)) {
          errosLinha.push("Hora fim inválida (use HH:MM)");
        }

        if (errosLinha.length > 0) {
          escala.erro = errosLinha.join("; ");
          erros.push(`Linha ${linha}: ${errosLinha.join("; ")}`);
        }

        escalasValidas.push(escala);
      });

      setEscalasPreview(escalasValidas);
      setErrosValidacao(erros);
    } catch (error) {
      console.error("Erro ao processar arquivo:", error);
      setErrosValidacao(["Erro ao processar arquivo. Verifique o formato."]);
    }
  };

  // Formatar data do Excel
  const formatarData = (valor: unknown): string => {
    if (!valor) return "";
    if (typeof valor === "number") {
      // Excel date serial number
      const date = new Date((valor - 25569) * 86400 * 1000);
      return format(date, "yyyy-MM-dd");
    }
    const str = String(valor);
    // Tentar DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [d, m, y] = str.split("/");
      return `${y}-${m}-${d}`;
    }
    return str;
  };

  // Formatar hora
  const formatarHora = (valor: unknown): string => {
    if (!valor) return "";
    if (typeof valor === "number") {
      // Excel time decimal
      const totalMinutes = Math.round(valor * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    const str = String(valor);
    // Garantir formato HH:MM
    if (/^\d{1,2}:\d{2}/.test(str)) {
      const [h, m] = str.split(":");
      return `${String(parseInt(h)).padStart(2, "0")}:${m.substring(0, 2)}`;
    }
    return str;
  };

  // Importar escalas
  const importarMutation = useMutation({
    mutationFn: async () => {
      const escalasParaImportar = escalasPreview.filter((e) => !e.erro);
      const total = escalasParaImportar.length;
      let sucesso = 0;
      let erro = 0;
      const errosDetalhados: Array<{ id_externo: string; erro: string }> = [];

      for (let i = 0; i < escalasParaImportar.length; i++) {
        const escala = escalasParaImportar[i];
        setProgresso(Math.round(((i + 1) / total) * 100));

        const { error } = await supabase.from("escalas_integradas" as any).upsert(
          {
            id_externo: escala.id_externo,
            sistema_origem: "DR_ESCALA",
            profissional_nome: escala.profissional_nome,
            profissional_crm: escala.profissional_crm || null,
            setor: escala.setor,
            unidade: escala.unidade || null,
            data_escala: escala.data_escala,
            hora_inicio: escala.hora_inicio,
            hora_fim: escala.hora_fim,
            tipo_plantao: escala.tipo_plantao || null,
            status_escala: escala.status_escala || "confirmado",
            sincronizado_em: new Date().toISOString(),
          },
          { onConflict: "id_externo,sistema_origem" }
        );

        if (error) {
          erro++;
          errosDetalhados.push({ id_externo: escala.id_externo, erro: error.message });
        } else {
          sucesso++;
        }
      }

      // Registrar log
      await supabase.from("escalas_integracao_logs" as any).insert({
        sistema_origem: "DR_ESCALA",
        tipo_operacao: arquivo?.name.endsWith(".csv") ? "csv" : "excel",
        status: erro === 0 ? "sucesso" : sucesso === 0 ? "erro" : "parcial",
        total_registros: total,
        registros_sucesso: sucesso,
        registros_erro: erro,
        mensagem: `Importação ${arquivo?.name}: ${sucesso} sucesso, ${erro} erros`,
        erros_detalhados: errosDetalhados.length > 0 ? errosDetalhados : null,
        arquivo_nome: arquivo?.name,
      });

      return { sucesso, erro };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["escalas-integradas"] });
      queryClient.invalidateQueries({ queryKey: ["escalas-integracao-logs"] });
      toast.success(`Importação concluída: ${result.sucesso} escalas importadas`);
      if (result.erro > 0) {
        toast.warning(`${result.erro} escalas com erro`);
      }
      limparImportacao();
    },
    onError: (error) => {
      toast.error("Erro na importação: " + (error as Error).message);
    },
  });

  const limparImportacao = () => {
    setArquivo(null);
    setEscalasPreview([]);
    setErrosValidacao([]);
    setProgresso(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const downloadModelo = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        id_externo: "ESC-001",
        profissional_nome: "Dr. João Silva",
        profissional_crm: "12345-SP",
        setor: "UTI",
        unidade: "Hospital Central",
        data_escala: "2024-01-15",
        hora_inicio: "07:00",
        hora_fim: "19:00",
        tipo_plantao: "12h",
        status_escala: "confirmado",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Escalas");
    XLSX.writeFile(wb, "modelo_importacao_escalas.xlsx");
  };

  const escalasValidas = escalasPreview.filter((e) => !e.erro);
  const escalasComErro = escalasPreview.filter((e) => e.erro);

  return (
    <div className="space-y-6">
      {/* Upload de arquivo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Escalas (Contingência)
          </CardTitle>
          <CardDescription>
            Importe escalas via arquivo CSV/Excel quando a integração via API não estiver disponível.
            O sistema irá atualizar registros existentes (baseado no ID externo).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processarArquivo(file);
                }}
              />
            </div>
            <Button variant="outline" onClick={downloadModelo}>
              <Download className="h-4 w-4 mr-2" />
              Baixar Modelo
            </Button>
          </div>

          {/* Colunas esperadas */}
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">Colunas esperadas:</p>
            <div className="flex flex-wrap gap-2">
              {COLUNAS_ESPERADAS.map((col) => (
                <Badge key={col.campo} variant={col.obrigatorio ? "default" : "secondary"}>
                  {col.label} {col.obrigatorio && "*"}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview e validação */}
      {escalasPreview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Preview da Importação
            </CardTitle>
            <div className="flex gap-4">
              <Badge variant="outline" className="text-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {escalasValidas.length} válidas
              </Badge>
              {escalasComErro.length > 0 && (
                <Badge variant="outline" className="text-red-600">
                  <XCircle className="h-3 w-3 mr-1" />
                  {escalasComErro.length} com erro
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Erros de validação */}
            {errosValidacao.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ScrollArea className="h-[100px]">
                    <ul className="list-disc pl-4 space-y-1">
                      {errosValidacao.map((erro, i) => (
                        <li key={i} className="text-sm">
                          {erro}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}

            {/* Tabela preview */}
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">Status</TableHead>
                    <TableHead>ID Externo</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {escalasPreview.slice(0, 50).map((escala, i) => (
                    <TableRow key={i} className={escala.erro ? "bg-red-50" : ""}>
                      <TableCell>
                        {escala.erro ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{escala.id_externo}</TableCell>
                      <TableCell>
                        {escala.profissional_nome}
                        {escala.profissional_crm && (
                          <span className="text-muted-foreground"> ({escala.profissional_crm})</span>
                        )}
                      </TableCell>
                      <TableCell>{escala.setor}</TableCell>
                      <TableCell>{escala.data_escala}</TableCell>
                      <TableCell>
                        {escala.hora_inicio} - {escala.hora_fim}
                      </TableCell>
                      <TableCell className="text-red-600 text-xs">{escala.erro}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {escalasPreview.length > 50 && (
                <p className="text-sm text-muted-foreground text-center mt-2">
                  Mostrando 50 de {escalasPreview.length} registros
                </p>
              )}
            </ScrollArea>

            {/* Progresso e ações */}
            {importando && (
              <div className="space-y-2">
                <Progress value={progresso} />
                <p className="text-sm text-center text-muted-foreground">Importando... {progresso}%</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={limparImportacao}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setImportando(true);
                  importarMutation.mutate();
                }}
                disabled={escalasValidas.length === 0 || importando}
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar {escalasValidas.length} Escalas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico de integrações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Sincronizações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Nenhuma sincronização registrada
            </p>
          ) : (
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Sucesso</TableHead>
                    <TableHead>Erros</TableHead>
                    <TableHead>Arquivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {format(parseISO(log.data_sincronizacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.tipo_operacao.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.status === "sucesso"
                              ? "default"
                              : log.status === "erro"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.total_registros}</TableCell>
                      <TableCell className="text-green-600">{log.registros_sucesso}</TableCell>
                      <TableCell className="text-red-600">{log.registros_erro}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {log.arquivo_nome || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
