import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configurações de chunk
const CHUNK_SIZE = 250; // Leads por execução (reduzido para evitar CPU timeout)
const UPSERT_BATCH = 50; // Leads por upsert

// Colunas esperadas no template (case-insensitive)
const EXPECTED_COLUMNS = {
  nome: ["nome", "name"],
  telefone: ["telefone", "phone", "celular", "whatsapp"],
  cpf: ["cpf"],
  uf: ["uf", "estado", "state"],
  email: ["email", "e-mail"],
  cidade: ["cidade", "city", "municipio"],
  data_nascimento: ["data_nasc", "data_nascimento", "nascimento", "datanasc", "dt_nasc", "dt_nascimento", "birth", "birthdate"],
  classificacao_contato: ["classificacao", "classificação", "situacao_contato", "situação_contato"],
  motivo_classificacao: ["motivo_classificacao", "motivo classificação", "motivo_bloqueio"],
  campanha_id: ["campanha_id", "id_campanha"],
};

type ImportClassification =
  | "opt_out"
  | "aposentado"
  | "sem_whatsapp"
  | "contato_invalido"
  | "perda_local";

function normalizeClassification(value: unknown): ImportClassification | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, ImportClassification> = {
    opt_out: "opt_out",
    nao_contatar: "opt_out",
    nao_chamar: "opt_out",
    aposentado: "aposentado",
    aposentada: "aposentado",
    sem_whatsapp: "sem_whatsapp",
    contato_invalido: "contato_invalido",
    telefone_invalido: "contato_invalido",
    perda: "perda_local",
    perdido: "perda_local",
    perda_local: "perda_local",
  };
  return aliases[normalized] || null;
}

async function applyImportClassification(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  leadId: string,
  phone: string,
  name: string,
  classification: ImportClassification | null,
  reason: string | null,
  campaignId: string | null,
) {
  if (!classification) return;
  const description = reason || `Classificação recebida na importação: ${classification}`;

  if (classification === "opt_out") {
    await supabase.from("leads").update({ opt_out: true }).eq("id", leadId);
    await supabase.from("blacklist").upsert(
      {
        phone_e164: phone,
        nome: name,
        origem: "importacao",
        reason: description,
      },
      { onConflict: "phone_e164" },
    );
  } else if (classification === "perda_local") {
    if (!campaignId) {
      throw new Error("Classificação perda_local exige a coluna campanha_id");
    }
    const { data: updated, error } = await supabase
      .from("campanha_leads")
      .update({
        status: "descartado",
        resultado_final: "perdido",
        motivo_perdido: reason || "importacao_perda_local",
        data_status: new Date().toISOString(),
      })
      .eq("campanha_id", campaignId)
      .eq("lead_id", leadId)
      .select("id");
    if (error) throw error;
    if (!updated?.length) throw new Error("Médico não pertence à campanha informada para perda_local");
  } else {
    const status = classification === "aposentado"
      ? "retired"
      : classification === "sem_whatsapp"
        ? "no_whatsapp"
        : "invalid_contact";
    await supabase.from("lead_contactability").upsert({
      lead_id: leadId,
      status,
      reason: description,
      reported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  await supabase.from("lead_historico").insert({
    lead_id: leadId,
    tipo_evento: "campanha_status_change",
    descricao_resumida: `Classificação importada: ${classification}`,
    metadados: {
      origem: "importacao_excel",
      classificacao: classification,
      motivo: reason,
      campanha_id: campaignId,
      escopo: classification === "perda_local" ? "campanha" : "global",
    },
  });
}

// Detecta colunas de telefones adicionais: telefone1, telefone2, tel1, celular2, whatsapp3, phone_2, etc.
// Retorna array ordenado por número (1, 2, 3...) com o nome ORIGINAL da coluna.
function findAdditionalPhoneColumns(headers: string[], primaryCol: string | null): string[] {
  const matches: { col: string; idx: number }[] = [];
  const primaryNorm = primaryCol ? normalizeColumnName(primaryCol) : null;
  const re = /^(telefone|phone|celular|whatsapp|tel|cel|fone|whats)[\s_\-]?(\d+)$/;
  for (const header of headers) {
    const norm = normalizeColumnName(header);
    if (norm === primaryNorm) continue;
    const m = norm.match(re);
    if (m) {
      matches.push({ col: header, idx: parseInt(m[2], 10) });
    }
  }
  matches.sort((a, b) => a.idx - b.idx);
  return matches.map((m) => m.col);
}

// UFs válidas
const UFS_VALIDAS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

function normalizeColumnName(col: string): string {
  return col.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findColumnMatch(headers: string[], expectedNames: string[]): string | null {
  for (const header of headers) {
    const normalized = normalizeColumnName(header);
    for (const expected of expectedNames) {
      if (normalized === expected || normalized.includes(expected)) {
        return header;
      }
    }
  }
  return null;
}

// Normaliza telefone para formato padrão: apenas dígitos, com 55 na frente
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  
  const digits = String(phone).replace(/\D/g, "");
  
  // Aceita apenas formatos válidos brasileiros
  // 55 + DDD (2) + número (8-9) = 12-13 dígitos
  if (digits.length === 13 && digits.startsWith("55")) {
    return digits;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return digits;
  }
  // DDD (2) + número (8-9) = 10-11 dígitos -> adiciona 55
  if (digits.length === 11) {
    return "55" + digits;
  }
  if (digits.length === 10) {
    return "55" + digits;
  }
  
  return null;
}

function getLeadUniqueKey(data: Record<string, any>): string | null {
  const cpfDigits = data.cpf ? String(data.cpf).replace(/\D/g, "") : "";
  if (cpfDigits.length === 11) return `cpf_${cpfDigits}`;

  if (data.nome && data.data_nascimento) {
    return `${String(data.nome).trim().toLowerCase()}_${data.data_nascimento}`;
  }

  return null;
}

/**
 * Importação não é edição em massa: quando o médico já existe, preservamos os
 * dados canônicos e usamos a planilha apenas para completar lacunas. Isso evita
 * regredir etapa/status, trocar origem ou substituir o telefone principal.
 */
function buildExistingLeadPatch(
  existing: Record<string, any>,
  incoming: Record<string, any>,
): Record<string, any> {
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  const fillIfEmpty = [
    "email",
    "cidade",
    "uf",
    "data_nascimento",
    "cpf",
    "especialidade",
    "especialidade_id",
    "origem",
    "arquivo_id",
  ];

  for (const field of fillIfEmpty) {
    const current = existing[field];
    const next = incoming[field];
    if ((current === null || current === undefined || current === "") && next) {
      patch[field] = next;
    }
  }

  const primary = String(existing.phone_e164 || "").replace(/\D/g, "");
  const additional = new Set<string>(
    (Array.isArray(existing.telefones_adicionais) ? existing.telefones_adicionais : [])
      .map((phone: unknown) => String(phone || "").replace(/\D/g, ""))
      .filter(Boolean),
  );
  const importedPhones = [
    incoming.phone_e164,
    ...(Array.isArray(incoming.telefones_adicionais) ? incoming.telefones_adicionais : []),
  ];
  for (const phone of importedPhones) {
    const normalized = String(phone || "").replace(/\D/g, "");
    if (normalized && normalized !== primary) additional.add(normalized);
  }
  if (additional.size > 0) {
    patch.telefones_adicionais = Array.from(additional);
  }

  return patch;
}

// Valida CPF (apenas verifica se tem 11 dígitos) - opcional agora
function validateCPF(cpf: string): string | null {
  if (!cpf) return null;
  const digits = String(cpf).replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return digits;
}

// Valida UF
function validateUF(uf: string): string | null {
  if (!uf) return null;
  const normalized = String(uf).trim().toUpperCase().substring(0, 2);
  if (!UFS_VALIDAS.includes(normalized)) return null;
  return normalized;
}

// Parseia data de nascimento de múltiplos formatos para YYYY-MM-DD
function parseBirthDate(dateValue: any): string | null {
  if (!dateValue) return null;
  
  // Se for número (Excel date serial)
  if (typeof dateValue === 'number') {
    // Excel date serial: dias desde 1899-12-30
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (year >= 1900 && year <= 2100) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }
  
  const dateString = String(dateValue).trim();
  if (!dateString) return null;
  
  // Remove espaços e horário se existir
  const cleanDate = dateString.split(/[\sT]/)[0];
  
  // Formato brasileiro: DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = cleanDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }
  
  // Formato ISO: YYYY-MM-DD ou YYYY/MM/DD
  const isoMatch = cleanDate.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Validação JWT obrigatória ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = authHeader.replace("Bearer ", "");

  // Permitir chamadas internas de encadeamento de chunks (service role key)
  const isInternalCall = token === supabaseServiceKey;

  if (!isInternalCall) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
  // --- Fim validação JWT ---

  // Conectar ao Supabase com service role para operações de dados
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let jobId: string | null = null;

  try {
    // Determinar se é primeira execução (FormData) ou continuação (JSON)
    const contentType = req.headers.get("content-type") || "";
    let storagePath: string | null = null;
    let chunkAtual = 0;
    let arquivoNome = "";
    let especialidadeParam = "";
    let especialidadesParam: string[] = [];
    let origemParam = "";
    let listaDestinoId = "";

    if (contentType.includes("multipart/form-data")) {
      // PRIMEIRA EXECUÇÃO: receber arquivo do FormData
      const formData = await req.formData();
      const file = formData.get("file") as File;
      jobId = formData.get("job_id") as string;
      arquivoNome = formData.get("arquivo_nome") as string || file?.name || "upload.xlsx";
      especialidadeParam = formData.get("especialidade") as string || "";
      // Lista completa de especialidades (multi-select). Aceita JSON array.
      const especialidadesRaw = formData.get("especialidades") as string | null;
      if (especialidadesRaw) {
        try {
          const parsed = JSON.parse(especialidadesRaw);
          if (Array.isArray(parsed)) {
            especialidadesParam = parsed.map((s) => String(s).trim()).filter(Boolean);
          }
        } catch (_) { /* ignora */ }
      }
      if (especialidadesParam.length === 0 && especialidadeParam) {
        especialidadesParam = [especialidadeParam];
      }
      origemParam = formData.get("origem") as string || "Importação Excel";
      const listaDestinoIdParam = (formData.get("lista_destino_id") as string) || "";
      const listaDestinoNomeParam = (formData.get("lista_destino_nome") as string) || "";
      const listaDestinoDescParam = (formData.get("lista_destino_descricao") as string) || "";
      
      if (!file) {
        return new Response(
          JSON.stringify({ error: "Nenhum arquivo enviado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upload do arquivo para Storage - sanitizar nome do arquivo
      const sanitizedFileName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-zA-Z0-9._-]/g, "_") // Substitui caracteres especiais por _
        .replace(/_+/g, "_"); // Remove underscores duplicados
      
      const storageFileName = `imports/${jobId}/${sanitizedFileName}`;
      const arrayBuffer = await file.arrayBuffer();
      
      const { error: uploadError } = await supabase.storage
        .from("lead-anexos")
        .upload(storageFileName, arrayBuffer, {
          contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
      }

      storagePath = storageFileName;

      // Se foi solicitado criar uma nova lista de disparo, criar agora
      let listaDestinoIdFinal = listaDestinoIdParam || "";
      if (!listaDestinoIdFinal && listaDestinoNomeParam) {
        const { data: importOwner } = await supabase
          .from("lead_import_jobs")
          .select("created_by, created_by_nome")
          .eq("id", jobId)
          .maybeSingle();
        const { data: novaLista, error: listaErr } = await supabase
          .from("disparo_listas")
          .insert({
            nome: listaDestinoNomeParam,
            descricao: listaDestinoDescParam || `Importada de ${arquivoNome}`,
            excluir_blacklist: true,
            created_by: importOwner?.created_by || null,
            created_by_nome: importOwner?.created_by_nome || null,
          })
          .select("id")
          .single();
        if (listaErr) {
          throw new Error(`Erro ao criar lista de disparo: ${listaErr.message}`);
        }
        listaDestinoIdFinal = novaLista.id;
      }
      listaDestinoId = listaDestinoIdFinal;

      // Atualizar job com path do Storage e parâmetros
      await supabase
        .from("lead_import_jobs")
        .update({ 
          status: "processando", 
          started_at: new Date().toISOString(),
          arquivo_nome: arquivoNome,
          arquivo_storage_path: storagePath,
          chunk_atual: 0,
          // Salvar parâmetros no job para uso em chunks subsequentes
          mapeamento_colunas: {
            _params: {
              especialidade: especialidadeParam,
              especialidades: especialidadesParam,
              origem: origemParam,
              lista_destino_id: listaDestinoIdFinal || null,
            }
          },
        })
        .eq("id", jobId);
    } else {
      // CONTINUAÇÃO: receber JSON com job_id e chunk
      const body = await req.json();
      jobId = body.job_id;
      chunkAtual = body.chunk_atual || 0;
      const listaDestinoIdOverride = typeof body.lista_destino_id === "string" ? body.lista_destino_id : "";
      const resetCounts = body.reset_counts === true;

      // Buscar dados do job
      const { data: job, error: jobError } = await supabase
        .from("lead_import_jobs")
        .select("arquivo_storage_path, arquivo_nome, mapeamento_colunas")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        throw new Error("Job não encontrado");
      }

      storagePath = job.arquivo_storage_path;
      arquivoNome = job.arquivo_nome;
      
      // Recuperar parâmetros salvos
      const params = (job.mapeamento_colunas as any)?._params || {};
      especialidadeParam = params.especialidade || "";
      especialidadesParam = Array.isArray(params.especialidades) ? params.especialidades : (especialidadeParam ? [especialidadeParam] : []);
      origemParam = params.origem || "Importação Excel";
      listaDestinoId = listaDestinoIdOverride || params.lista_destino_id || "";

      if (resetCounts && chunkAtual === 0) {
        await supabase
          .from("lead_import_jobs")
          .update({ inseridos: 0, atualizados: 0, ignorados: 0, erros: [], status: "processando", finished_at: null })
          .eq("id", jobId);
      }
    }

    if (!storagePath || !jobId) {
      throw new Error("Dados inválidos para processamento");
    }

    // Resolver especialidade_ids (uma vez por execução) a partir dos nomes
    const especialidadeIdsResolved: string[] = [];
    if (especialidadesParam.length > 0) {
      const { data: espRows } = await supabase
        .from("especialidades")
        .select("id, nome")
        .in("nome", especialidadesParam);
      const byNameLower = new Map((espRows || []).map((r: any) => [String(r.nome).toLowerCase(), r.id]));
      for (const nome of especialidadesParam) {
        const id = byNameLower.get(nome.toLowerCase());
        if (id) especialidadeIdsResolved.push(id);
      }
    }
    // Primeira especialidade_id: usada na coluna escalar legada de leads
    const especialidadeIdResolved: string | null = especialidadeIdsResolved[0] || null;

    // Caminho do JSON pré-processado (evita re-parsear XLSX/CSV em cada chunk)
    const jsonStoragePath = storagePath.replace(/\.(xlsx|xls|csv)$/i, '.json');
    let jsonData: Record<string, any>[];

    if (chunkAtual === 0) {
      // PRIMEIRO CHUNK: parsear XLSX e salvar como JSON para chunks seguintes
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("lead-anexos")
        .download(storagePath);

      if (downloadError || !fileData) {
        throw new Error(`Erro ao baixar arquivo: ${downloadError?.message}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const XLSX = await import("https://esm.sh/xlsx@0.18.5");
      const workbook = XLSX.read(uint8Array, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      jsonData = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[];

      if (jsonData.length === 0) {
        await supabase
          .from("lead_import_jobs")
          .update({ 
            status: "erro", 
            erros: ["Planilha vazia"],
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        return new Response(
          JSON.stringify({ error: "Planilha vazia" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Salvar JSON no storage para chunks subsequentes (muito mais rápido de parsear)
      const jsonBlob = new Blob([JSON.stringify(jsonData)], { type: "application/json" });
      await supabase.storage
        .from("lead-anexos")
        .upload(jsonStoragePath, jsonBlob, {
          contentType: "application/json",
          upsert: true,
        });

      console.log(`XLSX convertido para JSON: ${jsonData.length} linhas salvas em ${jsonStoragePath}`);
    } else {
      // CHUNKS SUBSEQUENTES: ler JSON pré-processado (muito mais leve em CPU)
      const { data: jsonFile, error: jsonError } = await supabase.storage
        .from("lead-anexos")
        .download(jsonStoragePath);

      if (jsonError || !jsonFile) {
        throw new Error(`Erro ao baixar JSON pré-processado: ${jsonError?.message}`);
      }

      const jsonText = await jsonFile.text();
      jsonData = JSON.parse(jsonText);
      console.log(`JSON pré-processado carregado: ${jsonData.length} linhas (chunk ${chunkAtual + 1})`);
    }

    // Validar e mapear colunas
    const headers = Object.keys(jsonData[0]);
    const columnMapping: Record<string, string | null> = {};
    
    for (const [field, aliases] of Object.entries(EXPECTED_COLUMNS)) {
      columnMapping[field] = findColumnMatch(headers, aliases);
    }

    // Detectar colunas de telefones adicionais (telefone1, telefone2, ...)
    const additionalPhoneCols = findAdditionalPhoneColumns(headers, columnMapping.telefone);
    if (additionalPhoneCols.length > 0) {
      console.log(`Colunas de telefones adicionais detectadas: ${additionalPhoneCols.join(", ")}`);
    }
    
    // Validar colunas obrigatórias - Nome, Telefone e UF são obrigatórios
    const missingColumns: string[] = [];
    if (!columnMapping.nome) missingColumns.push("Nome");
    if (!columnMapping.telefone) missingColumns.push("Telefone");
    if (!columnMapping.uf) missingColumns.push("UF");

    if (missingColumns.length > 0) {
      const error = `Colunas obrigatórias não encontradas: ${missingColumns.join(", ")}`;
      await supabase
        .from("lead_import_jobs")
        .update({ 
          status: "erro", 
          erros: [error],
          mapeamento_colunas: {
            ...columnMapping,
            _params: {
              especialidade: especialidadeParam,
              especialidades: especialidadesParam,
              origem: origemParam,
              lista_destino_id: listaDestinoId || null,
            },
          },
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      return new Response(
        JSON.stringify({ error, expected: ["Nome", "Telefone", "UF", "Data Nascimento (opcional)", "CPF (opcional)", "Email (opcional)", "Cidade (opcional)"], found: headers }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calcular chunks
    const totalChunks = Math.ceil(jsonData.length / CHUNK_SIZE);
    const startIndex = chunkAtual * CHUNK_SIZE;
    const endIndex = Math.min(startIndex + CHUNK_SIZE, jsonData.length);
    const chunkData = jsonData.slice(startIndex, endIndex);

    // Atualizar job com total de chunks (primeira execução)
    if (chunkAtual === 0) {
      await supabase
        .from("lead_import_jobs")
        .update({ 
          total_linhas: jsonData.length,
          mapeamento_colunas: {
            ...columnMapping,
            _params: {
              especialidade: especialidadeParam,
              especialidades: especialidadesParam,
              origem: origemParam,
              lista_destino_id: listaDestinoId || null,
            },
          },
          total_chunks: totalChunks,
        })
        .eq("id", jobId);
    }

    // Buscar resultados atuais do job (acumular de chunks anteriores)
    const { data: currentJob } = await supabase
      .from("lead_import_jobs")
      .select("inseridos, atualizados, ignorados, erros")
      .eq("id", jobId)
      .single();

    // Garantir que erros anteriores sejam preservados como array de objetos
    const previousErrors: Array<{linha: number; motivo: string; dados: Record<string, any>}> = [];
    if (currentJob?.erros && Array.isArray(currentJob.erros)) {
      for (const e of currentJob.erros) {
        if (typeof e === 'object' && e !== null) {
          previousErrors.push(e as any);
        } else if (typeof e === 'string') {
          try {
            previousErrors.push(JSON.parse(e));
          } catch {
            previousErrors.push({ linha: 0, motivo: e, dados: {} });
          }
        }
      }
    }

    const results = {
      inserted: currentJob?.inseridos || 0,
      updated: currentJob?.atualizados || 0,
      skipped: currentJob?.ignorados || 0,
      errors: previousErrors,
    };

    // Processar linhas do chunk atual - usando Map para deduplicar por telefone (phone_e164)
    const leadsMap = new Map<string, {
      rowNum: number;
      data: Record<string, any>;
      originalRow: Record<string, any>;
      classification: ImportClassification | null;
      classificationReason: string | null;
      campaignId: string | null;
    }>();
    
    for (let i = 0; i < chunkData.length; i++) {
      const row = chunkData[i];
      const rowNum = startIndex + i + 2; // +2 para compensar header e índice 0
      
      const nome = row[columnMapping.nome!];
      const telefone = row[columnMapping.telefone!];
      const cpfRaw = columnMapping.cpf ? row[columnMapping.cpf] : null;
      const ufRaw = row[columnMapping.uf!]; // UF é obrigatório
      const dataNascRaw = columnMapping.data_nascimento ? row[columnMapping.data_nascimento] : null;
      const classificationRaw = columnMapping.classificacao_contato
        ? row[columnMapping.classificacao_contato]
        : null;
      const classification = normalizeClassification(classificationRaw);
      const classificationReason = columnMapping.motivo_classificacao && row[columnMapping.motivo_classificacao]
        ? String(row[columnMapping.motivo_classificacao]).trim()
        : null;
      const campaignId = columnMapping.campanha_id && row[columnMapping.campanha_id]
        ? String(row[columnMapping.campanha_id]).trim()
        : null;

      if (classificationRaw && !classification) {
        results.skipped++;
        if (results.errors.length < 500) {
          results.errors.push({
            linha: rowNum,
            motivo: `Classificação inválida: ${String(classificationRaw)}`,
            dados: { nome: String(nome || ""), classificacao: String(classificationRaw) },
          });
        }
        continue;
      }
      if (classification === "perda_local" && !campaignId) {
        results.skipped++;
        if (results.errors.length < 500) {
          results.errors.push({
            linha: rowNum,
            motivo: "perda_local exige Campanha_ID",
            dados: { nome: String(nome || ""), classificacao: "perda_local" },
          });
        }
        continue;
      }
      
      // Validar Nome
      if (!nome || String(nome).trim() === "") {
        results.skipped++;
        if (results.errors.length < 500) {
          results.errors.push({
            linha: rowNum,
            motivo: "Nome vazio",
            dados: { nome: nome || "", telefone: telefone || "" }
          });
        }
        continue;
      }
      
      // Validar Telefone
      const phone_e164 = normalizePhone(String(telefone || ""));
      if (!phone_e164) {
        results.skipped++;
        if (results.errors.length < 500) {
          results.errors.push({
            linha: rowNum,
            motivo: "Telefone inválido (deve ter 10-13 dígitos no formato brasileiro)",
            dados: { nome: String(nome).trim(), telefone: String(telefone || "").trim() }
          });
        }
        continue;
      }
      
      // Data de Nascimento agora é OPCIONAL - parsear se existir
      const dataNascimento = dataNascRaw ? parseBirthDate(dataNascRaw) : null;
      
      // Se preencheu data de nascimento mas ela é inválida, avisar mas não bloquear
      if (dataNascRaw && !dataNascimento) {
        if (results.errors.length < 500) {
          results.errors.push({
            linha: rowNum,
            motivo: "Data de nascimento inválida - será ignorada (use formato DD/MM/YYYY ou YYYY-MM-DD)",
            dados: { nome: String(nome).trim(), data_nasc: String(dataNascRaw || "").toString() }
          });
        }
        // Continua processando sem a data de nascimento
      }
      
      // Validar UF (obrigatório)
      const uf = validateUF(String(ufRaw || ""));
      if (!uf) {
        results.skipped++;
        if (results.errors.length < 500) {
          results.errors.push({
            linha: rowNum,
            motivo: "UF inválido ou ausente (deve ser sigla de estado brasileiro, ex: SP, RJ, MG)",
            dados: { nome: String(nome).trim(), uf: String(ufRaw || "").trim() }
          });
        }
        continue;
      }
      
      // CPF (opcional)
      const cpf = cpfRaw ? validateCPF(String(cpfRaw)) : null;
      
      // Verificar duplicata dentro do próprio arquivo pelo telefone
      if (leadsMap.has(phone_e164)) {
        const existing = leadsMap.get(phone_e164)!;
        results.skipped++;
        if (results.errors.length < 500) {
          results.errors.push({
            linha: rowNum,
            motivo: `Lead duplicado no arquivo - mesmo telefone (igual à linha ${existing.rowNum})`,
            dados: { 
              nome: String(nome).trim(), 
              telefone: phone_e164
            }
          });
        }
        continue;
      }
      
      const leadData: Record<string, any> = {
        nome: String(nome).trim(),
        phone_e164,
        status: "Novo",
        arquivo_id: arquivoNome,
        especialidade: especialidadeParam || null,
        especialidade_id: especialidadeIdResolved,
        origem: origemParam || "Importação Excel",
        updated_at: new Date().toISOString(),
      };
      
      // Campos opcionais
      if (dataNascimento) leadData.data_nascimento = dataNascimento;
      if (cpf) leadData.cpf = cpf;
      
      // UF obrigatório (já validado)
      leadData.uf = uf;
      
      if (columnMapping.email && row[columnMapping.email]) {
        const email = String(row[columnMapping.email]).trim();
        if (email && email.includes("@")) {
          leadData.email = email;
        }
      }
      
      if (columnMapping.cidade && row[columnMapping.cidade]) {
        leadData.cidade = String(row[columnMapping.cidade]).trim();
      }

      // Telefones adicionais (telefone1, telefone2, ...)
      if (additionalPhoneCols.length > 0) {
        const adicionais: string[] = [];
        const seen = new Set<string>([phone_e164]);
        for (const col of additionalPhoneCols) {
          const raw = row[col];
          if (raw === undefined || raw === null || String(raw).trim() === "") continue;
          const normalized = normalizePhone(String(raw));
          if (!normalized) continue;
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          adicionais.push(normalized);
        }
        if (adicionais.length > 0) {
          leadData.telefones_adicionais = adicionais;
        }
      }

      leadsMap.set(phone_e164, {
        rowNum,
        data: leadData,
        originalRow: row,
        classification,
        classificationReason,
        campaignId,
      });
    }

    // Converter Map para array para upsert
    const leadsToUpsert = Array.from(leadsMap.values());
    const leadIdsImportados: string[] = [];

    // Processar em lotes. A tabela leads não tem constraint única em phone_e164,
    // então upsert(onConflict: "phone_e164") falha. Fazemos merge manual por telefone.
    for (let i = 0; i < leadsToUpsert.length; i += UPSERT_BATCH) {
      const batch = leadsToUpsert.slice(i, i + UPSERT_BATCH);
      const batchData = batch.map(b => b.data);

      const phones = batchData.map((d) => d.phone_e164).filter(Boolean);
      const phoneVariants = Array.from(new Set(phones.flatMap((phone) => [phone, `+${phone}`])));
      const chaveUnicas = Array.from(new Set(batchData.map(getLeadUniqueKey).filter(Boolean) as string[]));
      const { data: existentesPorTelefone, error: existingError } = await supabase
        .from("leads")
        .select("id, phone_e164, chave_unica, email, cidade, uf, data_nascimento, cpf, especialidade, especialidade_id, origem, arquivo_id, status, telefones_adicionais")
        .in("phone_e164", phoneVariants)
        .order("created_at", { ascending: true });

      if (existingError) throw existingError;

      const { data: existentesPorChave, error: keyError } = chaveUnicas.length > 0
        ? await supabase
          .from("leads")
          .select("id, phone_e164, chave_unica, email, cidade, uf, data_nascimento, cpf, especialidade, especialidade_id, origem, arquivo_id, status, telefones_adicionais")
          .in("chave_unica", chaveUnicas)
          .order("created_at", { ascending: true })
        : { data: [], error: null };

      if (keyError) throw keyError;

      const leadByPhone = new Map<string, Record<string, any>>();
      const leadByUniqueKey = new Map<string, Record<string, any>>();
      for (const row of [...(existentesPorTelefone || []), ...(existentesPorChave || [])]) {
        const normalizedExistingPhone = String(row.phone_e164 || "").replace(/\D/g, "");
        if (normalizedExistingPhone && !leadByPhone.has(normalizedExistingPhone)) {
          leadByPhone.set(normalizedExistingPhone, row);
        }
        const uniqueKey = String(row.chave_unica || "");
        if (uniqueKey && !leadByUniqueKey.has(uniqueKey)) {
          leadByUniqueKey.set(uniqueKey, row);
        }
      }

      const insertRows: Record<string, any>[] = [];
      const insertMeta: typeof batch = [];

      for (const item of batch) {
        const existingLead = leadByPhone.get(item.data.phone_e164)
          || leadByUniqueKey.get(getLeadUniqueKey(item.data) || "");
        if (existingLead) {
          const safePatch = buildExistingLeadPatch(existingLead, item.data);
          const { data: updated, error: updateError } = await supabase
            .from("leads")
            .update(safePatch)
            .eq("id", existingLead.id)
            .select("id")
            .single();

          if (updateError) {
            results.skipped++;
            if (results.errors.length < 500) {
              results.errors.push({
                linha: item.rowNum,
                motivo: updateError.message,
                dados: {
                  nome: item.data.nome,
                  telefone: item.data.phone_e164,
                  email: item.data.email || ""
                }
              });
            }
          } else {
            results.updated++;
            if (updated?.id) {
              leadIdsImportados.push(updated.id);
              await applyImportClassification(
                supabase,
                updated.id,
                item.data.phone_e164,
                item.data.nome,
                item.classification,
                item.classificationReason,
                item.campaignId,
              );
            }
          }
        }
        else {
          insertRows.push(item.data);
          insertMeta.push(item);
        }
      }

      if (insertRows.length > 0) {
        const { data: insertedRows, error: insertError } = await supabase
          .from("leads")
          .insert(insertRows)
          .select("id");

        if (insertError) {
          for (const item of insertMeta) {
            results.skipped++;
            if (results.errors.length < 500) {
              results.errors.push({
                linha: item.rowNum,
                motivo: insertError.message,
                dados: {
                  nome: item.data.nome,
                  telefone: item.data.phone_e164,
                  email: item.data.email || ""
                }
              });
            }
          }
        } else {
          results.inserted += insertedRows?.length || insertRows.length;
          for (let insertedIndex = 0; insertedIndex < (insertedRows || []).length; insertedIndex++) {
            const row = insertedRows![insertedIndex];
            const item = insertMeta[insertedIndex];
            if (row?.id) {
              leadIdsImportados.push(row.id);
              await applyImportClassification(
                supabase,
                row.id,
                item.data.phone_e164,
                item.data.nome,
                item.classification,
                item.classificationReason,
                item.campaignId,
              );
            }
          }
        }
      }
    }

    // Se este import tem lista de destino, vincular leads à lista
    if (listaDestinoId && leadIdsImportados.length > 0) {
      const itensRows = leadIdsImportados.map((lead_id) => ({
        lista_id: listaDestinoId,
        lead_id,
      }));
      // Em lotes para evitar payload gigante
      const ITEM_BATCH = 500;
      for (let i = 0; i < itensRows.length; i += ITEM_BATCH) {
        const slice = itensRows.slice(i, i + ITEM_BATCH);
        const { error: itemErr } = await supabase
          .from("disparo_lista_itens")
          .upsert(slice, { onConflict: "lista_id,lead_id", ignoreDuplicates: true });
        if (itemErr) {
          console.error("Erro vinculando leads à lista:", itemErr.message);
        }
      }
    }

    // Popular junction table lead_especialidades para todos os leads x todas as especialidades selecionadas
    if (especialidadeIdsResolved.length > 0 && leadIdsImportados.length > 0) {
      const espRows: { lead_id: string; especialidade_id: string; fonte: string }[] = [];
      for (const lead_id of leadIdsImportados) {
        for (const especialidade_id of especialidadeIdsResolved) {
          espRows.push({ lead_id, especialidade_id, fonte: "import_excel" });
        }
      }
      const ESP_BATCH = 500;
      for (let i = 0; i < espRows.length; i += ESP_BATCH) {
        const slice = espRows.slice(i, i + ESP_BATCH);
        const { error: espErr } = await supabase
          .from("lead_especialidades")
          .upsert(slice, { onConflict: "lead_id,especialidade_id", ignoreDuplicates: true });
        if (espErr) {
          console.error("Erro vinculando especialidades aos leads:", espErr.message);
        }
      }
    }

    // Atualizar progresso do job
    const linhasProcessadas = endIndex;
    const isLastChunk = chunkAtual >= totalChunks - 1;

    await supabase
      .from("lead_import_jobs")
      .update({ 
        chunk_atual: chunkAtual,
        linhas_processadas: linhasProcessadas,
        inseridos: results.inserted,
        atualizados: results.updated,
        ignorados: results.skipped,
        erros: results.errors.slice(0, 500),
        ...(isLastChunk ? { 
          status: "concluido", 
          finished_at: new Date().toISOString() 
        } : {}),
      })
      .eq("id", jobId);

    // Se não for o último chunk, agendar próxima execução usando waitUntil
    if (!isLastChunk) {
      const nextChunk = chunkAtual + 1;
      
      // Função para chamar o próximo chunk
      const triggerNextChunk = async () => {
        try {
          console.log(`[waitUntil] Disparando chunk ${nextChunk + 1}/${totalChunks}...`);
          
          const chainResponse = await fetch(`${supabaseUrl}/functions/v1/import-leads-excel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              job_id: jobId,
              chunk_atual: nextChunk,
              lista_destino_id: listaDestinoId || undefined,
            }),
          });
          
          if (!chainResponse.ok) {
            console.error(`[waitUntil] Erro HTTP ao chamar chunk ${nextChunk}: ${chainResponse.status}`);
            // Marcar job como erro
            await supabase
              .from("lead_import_jobs")
              .update({ 
                status: "erro", 
                erros: [...results.errors.slice(0, 490), {
                  linha: 0,
                  motivo: `Falha HTTP ao iniciar chunk ${nextChunk + 1}/${totalChunks}: ${chainResponse.status}`,
                  dados: {}
                }],
                finished_at: new Date().toISOString(),
              })
              .eq("id", jobId);
          } else {
            console.log(`[waitUntil] Chunk ${nextChunk + 1}/${totalChunks} iniciado com sucesso`);
          }
        } catch (err: any) {
          console.error("[waitUntil] Erro ao chamar próximo chunk:", err);
          await supabase
            .from("lead_import_jobs")
            .update({ 
              status: "erro", 
              erros: [...results.errors.slice(0, 490), {
                linha: 0,
                motivo: `Erro de rede ao iniciar chunk ${nextChunk + 1}/${totalChunks}: ${err.message || 'Erro desconhecido'}`,
                dados: {}
              }],
              finished_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        }
      };
      
      // Usar EdgeRuntime.waitUntil para executar após resposta ser enviada
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime && typeof runtime.waitUntil === 'function') {
        runtime.waitUntil(triggerNextChunk());
        console.log(`Chunk ${chunkAtual + 1} concluído, próximo agendado via waitUntil`);
      } else {
        // Fallback: await direto (pode travar no timeout)
        console.log(`waitUntil não disponível, usando await direto...`);
        await triggerNextChunk();
      }

      return new Response(
        JSON.stringify({
          success: true,
          chunk: chunkAtual,
          totalChunks,
          linhasProcessadas,
          message: `Chunk ${chunkAtual + 1}/${totalChunks} processado, continuando...`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Último chunk - limpar arquivos do Storage (XLSX original + JSON pré-processado)
    await supabase.storage
      .from("lead-anexos")
      .remove([storagePath, jsonStoragePath]);

    return new Response(
      JSON.stringify({
        success: true,
        completed: true,
        totalChunks,
        results: {
          total: jsonData.length,
          inserted: results.inserted,
          updated: results.updated,
          skipped: results.skipped,
          errorsCount: results.errors.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro na importação:", error);
    
    // Atualizar job como erro
    if (jobId) {
      const errSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      await errSupabase
        .from("lead_import_jobs")
        .update({ 
          status: "erro", 
          erros: [error.message || "Erro desconhecido"],
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
