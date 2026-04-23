import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as XLSX from 'xlsx';
import { validateCPF } from "@/lib/validators";
import { ESPECIALIDADES_MEDICAS } from "./EspecialidadeMultiSelect";

// Detecta colunas extras de telefone (telefone1, tel2, celular3, whatsapp_2, etc.)
function findAdditionalPhoneKeys(rowKeys: string[]): string[] {
  const re = /^(telefone|phone|celular|whatsapp|tel|cel|fone|whats)[\s_\-]?(\d+)$/i;
  const found: { key: string; idx: number }[] = [];
  for (const k of rowKeys) {
    const norm = k.toLowerCase().trim();
    const m = norm.match(re);
    if (m) found.push({ key: k, idx: parseInt(m[2], 10) });
  }
  found.sort((a, b) => a.idx - b.idx);
  return found.map((f) => f.key);
}

interface ImportarMedicosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ImportarMedicosDialog({ open, onOpenChange, onSuccess }: ImportarMedicosDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);

  // Load clientes
  useState(() => {
    const loadClientes = async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nome_fantasia')
        .eq('status_cliente', 'Ativo')
        .order('nome_fantasia');
      if (data) setClientes(data);
    };
    loadClientes();
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Validate file type
      if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
        toast.error('Por favor, selecione um arquivo Excel (.xlsx ou .xls)');
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Por favor, selecione um arquivo');
      return;
    }

    setLoading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast.error('O arquivo está vazio');
        setLoading(false);
        return;
      }

      const medicosToInsert = [];
      const errors = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row: any = jsonData[i];
        const rowNum = i + 2; // +2 porque Excel começa em 1 e tem header

        // Validate required fields
        if (!row.nome_completo || !row.crm || !row.especialidade || !row.email || !row.telefone) {
          errors.push(`Linha ${rowNum}: Campos obrigatórios faltando`);
          continue;
        }

        // Parse especialidades (pode ser múltiplas separadas por vírgula, ponto-e-vírgula ou pipe)
        let especialidades: string[] = [];
        if (row.especialidade) {
          const rawEspecialidades = String(row.especialidade)
            .split(/[,;|]/)
            .map(e => e.trim())
            .filter(e => e.length > 0);
          
          // Validate each especialidade (case-insensitive)
          for (const esp of rawEspecialidades) {
            const especialidadeMatch = ESPECIALIDADES_MEDICAS.find(
              e => e.toLowerCase() === esp.toLowerCase()
            );
            
            if (!especialidadeMatch) {
              errors.push(`Linha ${rowNum}: Especialidade "${esp}" não é válida`);
            } else {
              especialidades.push(especialidadeMatch);
            }
          }
          
          if (especialidades.length === 0 && rawEspecialidades.length > 0) {
            continue; // Skip this row if no valid especialidades
          }
        }

        if (especialidades.length === 0) {
          errors.push(`Linha ${rowNum}: Pelo menos uma especialidade válida é obrigatória`);
          continue;
        }

        // Validate CPF if provided
        if (row.cpf) {
          const cleanCPF = String(row.cpf).replace(/[^\d]/g, '');
          if (!validateCPF(cleanCPF)) {
            errors.push(`Linha ${rowNum}: CPF inválido (${row.cpf})`);
            continue;
          }
        }

        // Validate email
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
          errors.push(`Linha ${rowNum}: Email inválido (${row.email})`);
          continue;
        }

        // Parse data_nascimento if provided
        let dataNascimento = null;
        if (row.data_nascimento) {
          try {
            // Excel dates come as numbers (days since 1900-01-01)
            if (typeof row.data_nascimento === 'number') {
              const excelDate = XLSX.SSF.parse_date_code(row.data_nascimento);
              dataNascimento = new Date(excelDate.y, excelDate.m - 1, excelDate.d).toISOString().split('T')[0];
            } else {
              // Try to parse as string
              const parsedDate = new Date(row.data_nascimento);
              if (!isNaN(parsedDate.getTime())) {
                dataNascimento = parsedDate.toISOString().split('T')[0];
              }
            }
          } catch (e) {
            errors.push(`Linha ${rowNum}: Data de nascimento inválida (${row.data_nascimento})`);
            continue;
          }
        }

        // Find cliente by name if provided
        let alocadoClienteId = null;
        if (row.cliente_vinculado) {
          const clienteNome = String(row.cliente_vinculado).trim().toLowerCase();
          const cliente = clientes.find(c => c.nome_fantasia.toLowerCase() === clienteNome);
          if (cliente) {
            alocadoClienteId = cliente.id;
          } else {
            errors.push(`Linha ${rowNum}: Cliente "${row.cliente_vinculado}" não encontrado`);
          }
        }

        medicosToInsert.push({
          nome_completo: String(row.nome_completo).trim(),
          crm: String(row.crm).trim(),
          especialidade: especialidades,
          email: String(row.email).trim().toLowerCase(),
          telefone: String(row.telefone).trim(),
          telefones_adicionais: (() => {
            const extras: string[] = [];
            const principal = String(row.telefone).replace(/\D/g, "");
            const seen = new Set<string>([principal]);
            for (const key of findAdditionalPhoneKeys(Object.keys(row))) {
              const raw = row[key];
              if (raw === undefined || raw === null || String(raw).trim() === "") continue;
              const digits = String(raw).replace(/\D/g, "");
              if (!digits || seen.has(digits)) continue;
              seen.add(digits);
              extras.push(String(raw).trim());
            }
            return extras.length > 0 ? extras : null;
          })(),
          cpf: row.cpf ? String(row.cpf).replace(/[^\d]/g, '') : null,
          data_nascimento: dataNascimento,
          estado: row.estado ? String(row.estado).toUpperCase().trim() : null,
          status_medico: row.status_medico || 'Ativo',
          status_contrato: row.status_contrato || null,
          alocado_cliente_id: alocadoClienteId,
        });
      }

      if (errors.length > 0) {
        toast.error(`Encontrados ${errors.length} erro(s) no arquivo`, {
          description: errors.slice(0, 3).join('\n'),
        });
      }

      if (medicosToInsert.length === 0) {
        toast.error('Nenhum médico válido para importar');
        setLoading(false);
        return;
      }

      // Insert into database
      const { error } = await supabase
        .from('medicos')
        .insert(medicosToInsert);

      if (error) throw error;

      toast.success(`${medicosToInsert.length} médico(s) importado(s) com sucesso`);
      onSuccess();
      onOpenChange(false);
      setFile(null);
    } catch (error: any) {
      console.error('Error importing:', error);
      toast.error('Erro ao importar médicos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    // Create template data
    const template = [
      {
        nome_completo: 'Dr. João Silva',
        crm: '12345/SP',
        especialidade: 'Cardiologia, Clínica Médica',
        email: 'joao@exemplo.com',
        telefone: '(11) 99999-9999',
        telefone1: '(11) 98888-7777',
        telefone2: '(11) 97777-6666',
        telefone3: '',
        cpf: '123.456.789-00',
        data_nascimento: '1980-05-15',
        estado: 'SP',
        status_medico: 'Ativo',
        status_contrato: 'ativo',
        cliente_vinculado: 'Nome do Cliente'
      }
    ];

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Médicos');

    // Save file
    XLSX.writeFile(wb, 'template_importacao_medicos.xlsx');
    toast.success('Template baixado com sucesso');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Médicos via Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Formato do arquivo Excel:</p>
                <ul className="text-sm list-disc list-inside space-y-1">
                  <li><strong>nome_completo</strong>: Nome completo do médico (obrigatório)</li>
                  <li><strong>crm</strong>: Número do CRM (obrigatório)</li>
                  <li><strong>especialidade</strong>: Uma ou mais especialidades separadas por vírgula (obrigatório). Ex: "Cardiologia, Clínica Médica"</li>
                  <li><strong>email</strong>: Email válido (obrigatório)</li>
                  <li><strong>telefone</strong>: Telefone de contato (obrigatório)</li>
                  <li><strong>telefone1, telefone2, telefone3...</strong>: Telefones adicionais (opcional, vazios são ignorados). Aceita também <code>celular2</code>, <code>whatsapp3</code>, etc.</li>
                  <li><strong>cpf</strong>: CPF no formato XXX.XXX.XXX-XX (opcional)</li>
                  <li><strong>data_nascimento</strong>: Data no formato AAAA-MM-DD (opcional)</li>
                  <li><strong>estado</strong>: Sigla do estado (opcional)</li>
                  <li><strong>status_medico</strong>: Ativo, Inativo ou Suspenso (opcional, padrão: Ativo)</li>
                  <li><strong>status_contrato</strong>: ativo, inativo, pendente ou cancelado (opcional)</li>
                  <li><strong>cliente_vinculado</strong>: Nome do cliente (opcional, deve corresponder exatamente ao nome cadastrado)</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>Especialidades válidas:</strong> As especialidades devem corresponder exatamente aos nomes da lista padrão. Baixe o template para ver o exemplo.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={downloadTemplate}
              className="flex-1"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Baixar Template
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Baixe o template e preencha com os dados dos médicos. As colunas devem seguir exatamente os nomes indicados acima.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Selecionar Arquivo Excel</label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={loading}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Arquivo selecionado: {file.name}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || loading}
            >
              {loading ? (
                'Importando...'
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
