import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, Navigate } from "react-router-dom";

const TABLES = [
  "ages_clientes", "ages_contrato_aditivos", "ages_contrato_itens", "ages_contrato_renovacoes",
  "ages_contratos", "ages_contratos_documentos", "ages_lead_anexos", "ages_lead_historico",
  "ages_leads", "ages_licitacoes", "ages_producao", "ages_profissionais",
  "ages_profissionais_documentos", "ages_propostas", "ages_unidades",
  "api_tokens", "auditoria_logs", "automacoes_config",
  "bi_client_import_rows", "bi_client_imports", "bi_clientes",
  "blacklist", "campanhas", "campanhas_envios",
  "captacao_contratos_board", "captacao_leads", "captacao_permissoes_usuario",
  "centros_custo", "chips", "clientes",
  "comunicacao_canais", "comunicacao_leituras", "comunicacao_mensagens",
  "comunicacao_notificacoes", "comunicacao_participantes",
  "config_lista_items", "conteudos",
  "contrato_aditivos_tempo", "contrato_anexos", "contrato_capitacao",
  "contrato_itens", "contrato_rascunho", "contrato_rascunho_anexos",
  "contrato_renovacoes", "contratos", "contratos_demanda",
  "contratos_dr_escala", "contratos_dr_oportunidade", "contratos_medico",
  "conversas", "demandas",
  "disparos_anotacoes", "disparos_campanhas", "disparos_contatos",
  "disparos_historico_contatos", "disparos_ia_logs", "disparos_log", "disparos_programados",
  "effect_sync_logs", "email_campanhas", "email_contatos",
  "email_interacoes", "email_respostas", "empresas_concorrentes",
  "escalas", "escalas_alertas", "escalas_ambulatoriais",
  "escalas_api_tokens", "escalas_inconsistencias",
  "leads", "licitacoes",
  "marketing_leads", "medico_documentos_log", "medico_indisponibilidades",
  "medico_kanban_card_anexos", "medico_kanban_cards", "medico_prontuario",
  "medico_remuneracao", "medico_vinculo_unidade", "medicos",
  "menu_permissions", "modulos_manutencao",
  "pagamentos_medico", "parceiros", "patrimonio",
  "permissoes", "permissoes_log", "profiles",
  "proposta", "proposta_itens", "propostas_medicas",
  "radiologia_agendas", "radiologia_agendas_escalas",
  "radiologia_ajuste_laudos", "radiologia_config_sla_cliente",
  "radiologia_ecg", "radiologia_exames_atraso",
  "radiologia_importacoes", "radiologia_imports_historico",
  "radiologia_pendencias", "radiologia_pendencias_comentarios",
  "radiologia_pendencias_historico", "radiologia_pendencias_snapshots",
  "radiologia_producao_comparacao", "radiologia_producao_exames",
  "recebimentos_cliente", "regiao_interesse_leads",
  "relacionamento_medico", "segmentos_publico", "servico", "setores",
  "sigzap_contacts", "sigzap_conversations", "sigzap_events",
  "sigzap_instances", "sigzap_messages",
  "suporte_comentarios", "suporte_sla_config", "suporte_tickets",
  "system_notifications", "unidades",
  "user_notas", "user_notas_anexos", "user_notas_checklist", "user_pastas",
  "user_roles", "whatsapp_rate_limit", "worklist_tarefas",
];

const BATCH_SIZE = 500;
const MAX_CONCURRENT = 3;
const MAX_CONSECUTIVE_ERRORS = 5;

function detectDelimiter(headerLine: string) {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

/**
 * Full RFC-4180 CSV parser that handles:
 * - Multiline fields (newlines inside quoted values)
 * - Escaped quotes ("" inside quoted fields)
 * - Delimiters inside quoted fields
 */
function parseCSV(text: string): Record<string, string>[] {
  // First, extract the header line (first line, never contains multiline)
  const firstNewline = text.indexOf('\n');
  if (firstNewline === -1) return [];
  
  const headerLine = text.substring(0, firstNewline).replace(/\r$/, '');
  const delimiter = detectDelimiter(headerLine);
  const headers = parseSimpleLine(headerLine, delimiter);
  
  // Now parse the rest character by character to handle multiline quoted fields
  const body = text.substring(firstNewline + 1);
  const rows: Record<string, string>[] = [];
  
  let i = 0;
  while (i < body.length) {
    const result = parseNextRow(body, i, delimiter);
    if (!result) break;
    
    const { values, nextIndex } = result;
    
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push(row);
    }
    
    i = nextIndex;
  }
  
  return rows;
}

function parseSimpleLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values.map(value => value.replace(/^"|"$/g, ""));
}

function parseNextRow(text: string, start: number, delimiter: string): { values: string[]; nextIndex: number } | null {
  // Skip leading whitespace/newlines
  while (start < text.length && (text[start] === '\r' || text[start] === '\n')) {
    start++;
  }
  if (start >= text.length) return null;

  const values: string[] = [];
  let i = start;
  
  while (i < text.length) {
    let value = "";
    
    if (text[i] === '"') {
      // Quoted field - can contain newlines, delimiters, escaped quotes
      i++; // skip opening quote
      while (i < text.length) {
        if (text[i] === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += text[i];
          i++;
        }
      }
      values.push(value.trim());
    } else {
      // Unquoted field - read until delimiter or newline
      while (i < text.length && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
        value += text[i];
        i++;
      }
      values.push(value.trim());
    }
    
    // Check what's next
    if (i >= text.length) break;
    
    if (text[i] === delimiter) {
      i++; // skip delimiter, continue to next field
      continue;
    }
    
    // End of row (newline)
    if (text[i] === '\r') i++;
    if (i < text.length && text[i] === '\n') i++;
    break;
  }
  
  return { values, nextIndex: i };
}

export default function AdminImport() {
  const [searchParams] = useSearchParams();
  const key = searchParams.get("key");

  if (key !== "sigma2026") {
    return <Navigate to="/" replace />;
  }

  return <AdminImportContent />;
}

function AdminImportContent() {
  const [table, setTable] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [processedRows, setProcessedRows] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const handleImport = async () => {
    if (!table || !file) return;

    setStatus("processing");
    setLogs([]);
    setProgress(0);
    setProcessedRows(0);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      setTotalRows(rows.length);
      addLog(`CSV carregado: ${rows.length} linhas, tabela: ${table}`);

      if (rows.length === 0) {
        addLog("❌ Nenhuma linha válida encontrada no CSV");
        setStatus("error");
        return;
      }

      addLog(`Colunas detectadas: ${Object.keys(rows[0]).join(", ")}`);

      // Clean rows: empty→null, "[]"→"{}", "[x,y]"→"{x,y}"
      const cleanedRows = rows.map(row => {
        const clean: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (value === "" || value === undefined || value === null) {
            clean[key] = null;
          } else if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed === "") {
              clean[key] = null;
            } else if (trimmed === "[]") {
              clean[key] = "{}";
            } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
              clean[key] = "{" + trimmed.slice(1, -1) + "}";
            } else {
              clean[key] = value;
            }
          } else {
            clean[key] = value;
          }
        }
        return clean;
      });

      const totalBatches = Math.ceil(cleanedRows.length / BATCH_SIZE);
      let errorCount = 0;
      let successCount = 0;
      let consecutiveErrors = 0;

      addLog(`📦 Total: ${totalBatches} lotes de até ${BATCH_SIZE} linhas (${MAX_CONCURRENT} em paralelo)`);

      // Process batches with concurrency control
      for (let i = 0; i < totalBatches; i += MAX_CONCURRENT) {
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          addLog("⛔ Importação interrompida: muitos erros consecutivos.");
          break;
        }

        const batchPromises: Promise<{ batchNum: number; count: number; error?: string }>[] = [];

        for (let j = 0; j < MAX_CONCURRENT && (i + j) < totalBatches; j++) {
          const batchIndex = i + j;
          const batch = cleanedRows.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
          const batchNum = batchIndex + 1;

          batchPromises.push(
            (async () => {
              try {
                const { error } = await (supabase.from(table as any) as any).upsert(batch, {
                  onConflict: "id",
                  ignoreDuplicates: false,
                });
                if (error) {
                  return { batchNum, count: 0, error: error.message };
                }
                return { batchNum, count: batch.length };
              } catch (err: any) {
                return { batchNum, count: 0, error: err.message || "Erro desconhecido" };
              }
            })()
          );
        }

        const results = await Promise.all(batchPromises);

        for (const result of results) {
          if (result.error) {
            errorCount++;
            consecutiveErrors++;
            addLog(`❌ Lote ${result.batchNum}/${totalBatches}: ${result.error}`);
          } else {
            consecutiveErrors = 0;
            successCount += result.count;
            // Only log every 10 batches or last batch to avoid log spam on large imports
            if (result.batchNum % 10 === 0 || result.batchNum === totalBatches) {
              addLog(`✅ Lote ${result.batchNum}/${totalBatches} OK (${successCount} linhas inseridas)`);
            }
          }
        }

        const done = Math.min((i + MAX_CONCURRENT) * BATCH_SIZE, cleanedRows.length);
        setProcessedRows(done);
        setProgress(Math.round((done / cleanedRows.length) * 100));
      }

      if (errorCount === 0) {
        addLog(`🎉 Importação concluída! ${successCount} linhas inseridas.`);
        setStatus("done");
      } else {
        addLog(`⚠️ Concluída com ${errorCount} erro(s). ${successCount} linhas inseridas.`);
        setStatus("error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      addLog(`❌ Erro fatal: ${msg}`);
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importação CSV Admin
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Tabela de destino</label>
            <Select value={table} onValueChange={setTable}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a tabela..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {TABLES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Arquivo CSV</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
            {file && <p className="text-xs text-muted-foreground">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
          </div>

          <Button
            onClick={handleImport}
            disabled={!table || !file || status === "processing"}
            className="w-full"
          >
            {status === "processing" ? (
              <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Importando...</>
            ) : (
              "Iniciar Importação"
            )}
          </Button>

          {status !== "idle" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>{processedRows} / {totalRows} linhas</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />

              {status === "done" && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 className="h-4 w-4" /> Importação concluída!
                </div>
              )}
              {status === "error" && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> Importação com erros
                </div>
              )}
            </div>
          )}

          {logs.length > 0 && (
            <div className="bg-muted rounded-md p-4 max-h-80 overflow-y-auto">
              <p className="text-xs font-semibold mb-2">Log:</p>
              {logs.map((log, i) => (
                <p key={i} className="text-xs font-mono whitespace-pre-wrap">{log}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
