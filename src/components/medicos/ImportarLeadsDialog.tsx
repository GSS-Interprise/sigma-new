import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet, Upload, Download, X, CheckCircle2, AlertCircle, Loader2, ChevronsUpDown, Check } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { EspecialidadeMultiSelect } from "@/components/medicos/EspecialidadeMultiSelect";

interface ImportarLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /**
   * Quando definido, leads importados serão vinculados a uma lista de disparo.
   * - { mode: "new", nome, descricao? }: cria uma nova lista com esse nome no servidor
   * - { mode: "existing", id }: adiciona à lista existente
   */
  listaDestino?:
    | { mode: "new"; nome: string; descricao?: string }
    | { mode: "existing"; id: string };
}

// Lista de origens padronizadas
const ORIGENS_PADRAO = [
  "INDICACAO",
  "WHATSAPP",
  "EMAIL",
  "TRAFEGO-PAGO",
  "LISTA-CAPTADORA",
];

// Lista de UFs brasileiras
const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export function ImportarLeadsDialog({ open, onOpenChange, onSuccess, listaDestino }: ImportarLeadsDialogProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string; details?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Novos campos obrigatórios de seleção
  const [selectedEspecialidades, setSelectedEspecialidades] = useState<string[]>([]);
  const [selectedOrigem, setSelectedOrigem] = useState<string>("");

  // Especialidades vêm da tabela normalizada `especialidades`
  const { data: especialidadesData = [] } = useEspecialidades();

  // Usar apenas lista fixa de origens (sem buscar do banco para evitar variações)
  const origensConsolidadas = ORIGENS_PADRAO;

  // Validar formato de telefone (apenas dígitos, padrão brasileiro)
  const validatePhone = (phone: string): { valid: boolean; normalized: string | null } => {
    if (!phone) return { valid: false, normalized: null };
    
    const digits = String(phone).replace(/\D/g, "");
    
    // Aceita apenas: 55 + DDD (2) + número (8-9) = 12-13 dígitos
    // ou DDD (2) + número (8-9) = 10-11 dígitos
    if (digits.length === 13 && digits.startsWith("55")) {
      return { valid: true, normalized: digits };
    }
    if (digits.length === 12 && digits.startsWith("55")) {
      return { valid: true, normalized: digits };
    }
    if (digits.length === 11) {
      return { valid: true, normalized: "55" + digits };
    }
    if (digits.length === 10) {
      return { valid: true, normalized: "55" + digits };
    }
    
    return { valid: false, normalized: null };
  };

  // Validar CPF básico (agora opcional)
  const validateCPF = (cpf: string): boolean => {
    if (!cpf) return true; // Opcional
    const digits = String(cpf).replace(/\D/g, "");
    return digits.length === 11;
  };

  // Validar UF (obrigatório)
  const validateUF = (uf: string): boolean => {
    if (!uf) return false;
    const normalized = String(uf).trim().toUpperCase();
    return UFS_BRASIL.includes(normalized);
  };

  // Validar data de nascimento (agora opcional)
  const validateDataNascimento = (dateValue: any): boolean => {
    if (!dateValue) return true; // Agora é opcional
    
    // Se for número (Excel date serial)
    if (typeof dateValue === 'number') return true;
    
    const dateString = String(dateValue).trim();
    if (!dateString) return true;
    
    // Formato brasileiro: DD/MM/YYYY ou DD-MM-YYYY
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(dateString)) return true;
    
    // Formato ISO: YYYY-MM-DD
    if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(dateString)) return true;
    
    return false;
  };

  const validateColumns = (headersList: string[]) => {
    const normalizedHeaders = headersList.map(h => h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    
    const hasNome = normalizedHeaders.some(h => h === "nome" || h === "name");
    const hasTelefone = normalizedHeaders.some(h => h === "telefone" || h === "phone" || h === "celular" || h === "whatsapp");
    const hasUF = normalizedHeaders.some(h => h === "uf" || h === "estado" || h === "state");

    const missing = [];
    if (!hasNome) missing.push("Nome");
    if (!hasTelefone) missing.push("Telefone");
    if (!hasUF) missing.push("UF");

    if (missing.length > 0) {
      return { valid: false, message: `Colunas obrigatórias não encontradas: ${missing.join(", ")}` };
    }

    return { valid: true, message: `${headersList.length} colunas detectadas` };
  };

  const validateData = (data: Record<string, any>[], headersList: string[]) => {
    const normalizedHeaders = headersList.map(h => h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    
    // Encontrar índices das colunas
    const nomeCol = headersList.find((_, i) => normalizedHeaders[i] === "nome" || normalizedHeaders[i] === "name");
    const telefoneCol = headersList.find((_, i) => ["telefone", "phone", "celular", "whatsapp"].includes(normalizedHeaders[i]));
    const dataNascCol = headersList.find((_, i) => 
      ["data_nasc", "datanasc", "data_nascimento", "nascimento", "dt_nasc", "dt_nascimento", "birth", "birthdate"].includes(normalizedHeaders[i])
    );
    const cpfCol = headersList.find((_, i) => normalizedHeaders[i] === "cpf");
    const ufCol = headersList.find((_, i) => normalizedHeaders[i] === "uf" || normalizedHeaders[i] === "estado");

    const errors: string[] = [];
    let validRows = 0;

    data.forEach((row, idx) => {
      const rowNum = idx + 2; // +2 para header e índice 0
      const rowErrors: string[] = [];

      // Validar Nome (obrigatório)
      const nome = nomeCol ? row[nomeCol] : null;
      if (!nome || String(nome).trim() === "") {
        rowErrors.push("Nome vazio");
      }

      // Validar Telefone (obrigatório)
      const telefone = telefoneCol ? row[telefoneCol] : null;
      const phoneValidation = validatePhone(String(telefone || ""));
      if (!phoneValidation.valid) {
        rowErrors.push(`Telefone inválido: ${telefone || "(vazio)"}`);
      }

      // Validar Data de Nascimento (opcional, mas se preenchido deve ser válido)
      const dataNasc = dataNascCol ? row[dataNascCol] : null;
      if (dataNasc && !validateDataNascimento(dataNasc)) {
        rowErrors.push(`Data nascimento inválida: ${dataNasc}`);
      }

      // CPF e UF são opcionais - validar apenas se preenchidos
      const cpf = cpfCol ? row[cpfCol] : null;
      if (cpf && !validateCPF(String(cpf))) {
        rowErrors.push(`CPF inválido: ${cpf}`);
      }

      const uf = ufCol ? row[ufCol] : null;
      if (uf && !validateUF(String(uf))) {
        rowErrors.push(`UF inválida: ${uf}`);
      }

      if (rowErrors.length > 0) {
        if (errors.length < 10) {
          errors.push(`Linha ${rowNum}: ${rowErrors.join(", ")}`);
        }
      } else {
        validRows++;
      }
    });

    return { validRows, totalRows: data.length, errors };
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Selecione um arquivo Excel (.xlsx ou .xls)");
      return;
    }

    setFile(selectedFile);
    setValidationResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[];

        if (jsonData.length === 0) {
          toast.error("Planilha vazia");
          return;
        }

        const cols = Object.keys(jsonData[0]);
        setHeaders(cols);
        setPreview(jsonData.slice(0, 5));
        
        // Validar colunas primeiro
        const colValidation = validateColumns(cols);
        if (!colValidation.valid) {
          setValidationResult(colValidation);
          return;
        }

        // Validar dados
        const dataValidation = validateData(jsonData, cols);
        if (dataValidation.validRows === 0) {
          setValidationResult({
            valid: false,
            message: `Nenhum registro válido encontrado`,
            details: dataValidation.errors,
          });
        } else if (dataValidation.errors.length > 0) {
          setValidationResult({
            valid: true,
            message: `${dataValidation.validRows} de ${dataValidation.totalRows} registros válidos`,
            details: dataValidation.errors,
          });
        } else {
          setValidationResult({
            valid: true,
            message: `${dataValidation.totalRows} registros válidos`,
          });
        }
      } catch (error) {
        toast.error("Erro ao ler arquivo");
        console.error(error);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragOver(true);
    } else if (e.type === "dragleave") {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const canImport = file && validationResult?.valid && selectedEspecialidades.length > 0 && selectedOrigem;

  const handleImport = async () => {
    if (!canImport) return;

    setIsUploading(true);

    try {
      // Criar job de importação primeiro (para feedback imediato)
      const { data: job, error: jobError } = await supabase
        .from("lead_import_jobs")
        .insert({
          status: "pendente",
          arquivo_nome: file.name,
          total_linhas: 0,
          created_by: user?.id,
          created_by_nome: user?.email,
        })
        .select()
        .single();

      if (jobError) {
        console.error("Erro ao criar job:", jobError);
        throw new Error("Erro ao iniciar importação");
      }

      // Enviar arquivo para processamento com especialidade e origem
      const formData = new FormData();
      formData.append("file", file);
      formData.append("job_id", job.id);
      formData.append("arquivo_nome", file.name);
      // Compatibilidade: envia a primeira como `especialidade` (string) e a lista completa em `especialidades`
      formData.append("especialidade", selectedEspecialidades[0] || "");
      formData.append("especialidades", JSON.stringify(selectedEspecialidades));
      formData.append("origem", selectedOrigem);
      if (listaDestino?.mode === "existing") {
        formData.append("lista_destino_id", listaDestino.id);
      } else if (listaDestino?.mode === "new") {
        formData.append("lista_destino_nome", listaDestino.nome);
        if (listaDestino.descricao) {
          formData.append("lista_destino_descricao", listaDestino.descricao);
        }
      }

      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-leads-excel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao processar importação");
      }

      toast.success("Importação iniciada! Acompanhe o progresso na aba de histórico.");
      handleClose();
      onSuccess?.();
    } catch (error: any) {
      console.error("Erro na importação:", error);
      toast.error(error.message || "Erro ao importar");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setValidationResult(null);
    setSelectedEspecialidade("");
    setSelectedOrigem("");
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const template = [
      {
        Nome: "João da Silva",
        Telefone: "5547999758708",
        data_nasc: "03/01/1990",
        CPF: "11155511187",
        UF: "SP",
        Cidade: "São Paulo",
        Email: "joao@email.com",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, "template-leads.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Importar Leads do Excel
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 max-h-[calc(90vh-180px)] pr-4">
        <div className="text-sm text-muted-foreground mb-4">
          Preencha os campos abaixo e depois carregue a planilha.
        </div>

        {/* Seleção de Especialidade e Origem ANTES do upload */}
        <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-muted/30 rounded-lg border">
          <div className="space-y-2">
            <Label htmlFor="especialidade" className="font-medium">
              Especialidade <span className="text-destructive">*</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedEspecialidade || "Selecione a especialidade..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 bg-popover" align="start">
                <Command>
                  <CommandInput placeholder="Buscar especialidade..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma especialidade encontrada.</CommandEmpty>
                    <CommandGroup className="max-h-64 overflow-auto">
                      {especialidadesConsolidadas.map((esp) => (
                        <CommandItem
                          key={esp}
                          value={esp}
                          onSelect={() => setSelectedEspecialidade(esp)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedEspecialidade === esp ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {esp}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Todos os leads importados receberão esta especialidade
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="origem" className="font-medium">
              Origem <span className="text-destructive">*</span>
            </Label>
            <Select value={selectedOrigem} onValueChange={setSelectedOrigem}>
              <SelectTrigger id="origem">
                <SelectValue placeholder="Selecione a origem..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {origensConsolidadas.map((ori) => (
                  <SelectItem key={ori} value={ori}>
                    {ori}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Todos os leads importados receberão esta origem
            </p>
          </div>
        </div>

        {/* Instruções */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-green-800 mb-1">Formato da planilha:</p>
              <ul className="text-green-700 space-y-0.5 list-disc list-inside">
                <li><strong>Nome</strong>, <strong>Telefone</strong>, <strong>UF</strong> e <strong>Data de Nascimento (data_nasc)</strong> são obrigatórios</li>
                <li>Telefone deve estar no formato: <code className="bg-green-100 px-1 rounded">5547999758708</code> (só números)</li>
                <li>Data nascimento: <code className="bg-green-100 px-1 rounded">DD/MM/YYYY</code> ou <code className="bg-green-100 px-1 rounded">YYYY-MM-DD</code></li>
                <li>A combinação Nome + Data Nascimento funciona como identificador único (anti-duplicação)</li>
                <li>Colunas opcionais: CPF, Email, Cidade</li>
              </ul>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="mt-3">
            <Download className="mr-2 h-4 w-4" />
            Baixar Template
          </Button>
        </div>

        {/* Upload Area */}
        {!file ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
              ${isDragOver 
                ? "border-green-500 bg-green-50" 
                : "border-muted-foreground/25 hover:border-green-400 hover:bg-green-50/50"
              }
            `}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              Arraste o arquivo Excel aqui ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Formatos aceitos: .xlsx, .xls
            </p>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Arquivo selecionado */}
            <div className={`
              flex items-center gap-3 p-3 rounded-lg border-2 border-dashed
              ${validationResult?.valid 
                ? "border-green-500 bg-green-50" 
                : "border-red-500 bg-red-50"
              }
            `}>
              {validationResult?.valid ? (
                <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className={`text-sm ${validationResult?.valid ? "text-green-600" : "text-red-600"}`}>
                  {validationResult?.message}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setFile(null);
                  setPreview([]);
                  setHeaders([]);
                  setValidationResult(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Erros de validação */}
            {validationResult?.details && validationResult.details.length > 0 && (
              <Alert variant="destructive" className="bg-red-50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Problemas encontrados:</p>
                  <ul className="text-xs space-y-0.5 max-h-[100px] overflow-auto">
                    {validationResult.details.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                  {validationResult.valid && (
                    <p className="mt-2 text-muted-foreground">
                      Registros com erros serão ignorados durante a importação.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Preview */}
            {validationResult?.valid && preview.length > 0 && (
              <div className="flex-1 min-h-0">
                <p className="text-sm font-medium mb-2">Preview (primeiras {preview.length} linhas)</p>
                <ScrollArea className="border rounded-lg h-[150px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((header) => (
                          <TableHead key={header} className="whitespace-nowrap">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row, idx) => (
                        <TableRow key={idx}>
                          {headers.map((header) => (
                            <TableCell key={header} className="whitespace-nowrap max-w-[200px] truncate">
                              {String(row[header] || "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            {/* Aviso de processamento em background */}
            {validationResult?.valid && (
              <Alert className="bg-blue-50 border-blue-200">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  A importação será processada em segundo plano. Você pode acompanhar o progresso na aba de histórico.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Aviso se não selecionou especialidade/origem */}
        {file && validationResult?.valid && (!selectedEspecialidade || !selectedOrigem) && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Selecione a <strong>Especialidade</strong> e a <strong>Origem</strong> antes de importar.
            </AlertDescription>
          </Alert>
        )}
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!canImport || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Importar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
