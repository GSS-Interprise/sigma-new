import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MedicoRecord {
  id: string;
  nome_completo: string;
  crm: string;
  email: string;
  telefone: string;
  phone_e164: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  estado: string | null;
  especialidade: string[] | null;
  rqe_numeros: string[] | null;
  status_medico: string | null;
  status_contrato: string | null;
  status_documentacao: string | null;
  documentos_url: string[] | null;
  cliente_vinculado_id: string | null;
  alocado_cliente_id: string[] | null;
  resumo_ia: string | null;
  resumo_ia_gerado_em: string | null;
  resumo_ia_gerado_por: string | null;
  resumo_ia_aprovado: boolean | null;
  resumo_ia_aprovado_por: string | null;
  resumo_ia_aprovado_em: string | null;
  aprovacao_contrato_assinado: boolean | null;
  aprovacao_documentacao_unidade: boolean | null;
  aprovacao_cadastro_unidade: boolean | null;
  data_aprovacao_corpo_medico: string | null;
  aprovado_corpo_medico_por: string | null;
  lead_id: string | null;
  created_at: string | null;
}

interface MigrationResult {
  medico_id: string;
  medico_nome: string;
  status: 'success' | 'skipped' | 'error';
  reason?: string;
  lead_id?: string;
  payload?: Record<string, unknown>;
  warnings_count?: number;
  summary_fields?: {
    phone_e164: string | null;
    cpf: string | null;
    crm: string | null;
    especialidade: string | null;
  };
}

// Normaliza telefone para E.164 (Brasil)
function normalizeToE164(phone: string): string | null {
  if (!phone) return null;
  
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, '');
  
  // Se já começa com 55 e tem 12-13 dígitos, está ok
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  
  // Se tem 10-11 dígitos (DDD + número), adiciona 55
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  
  // Se tem 8-9 dígitos (só número local), não conseguimos normalizar sem DDD
  return null;
}

// Gera telefone aleatório único no formato E.164 brasileiro
function generateRandomPhoneE164(): string {
  // DDDs válidos de São Paulo para evitar problemas
  const ddds = ['11', '21', '31', '41', '51', '47', '48', '19', '27', '85'];
  const ddd = ddds[Math.floor(Math.random() * ddds.length)];
  
  // Gera número de celular com 9 dígitos (começa com 9)
  const numero = '9' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  
  return `+55${ddd}${numero}`;
}

// Verifica se telefone já existe na tabela leads
async function phoneExistsInLeads(supabase: any, phone: string): Promise<boolean> {
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('phone_e164', phone)
    .maybeSingle();
  return !!data;
}

// Gera telefone aleatório que não existe no banco
async function getUniqueRandomPhone(supabase: any, maxAttempts = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const phone = generateRandomPhoneE164();
    const exists = await phoneExistsInLeads(supabase, phone);
    if (!exists) {
      return phone;
    }
  }
  // Fallback: adiciona timestamp para garantir unicidade
  const ddd = '11';
  const timestamp = Date.now().toString().slice(-8);
  return `+55${ddd}9${timestamp}`;
}

// Constrói nota de migração com campos sem equivalência
function buildMigrationNote(medico: MedicoRecord, clienteNome: string | null, clientesAlocadosNomes: string[]): string {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  const lines: string[] = [
    `--- MIGRAÇÃO AUTOMÁTICA (${timestamp}) ---`,
    `Origem: MedicoDialog (ID: ${medico.id})`,
    '',
  ];

  // Status documentação
  if (medico.status_documentacao) {
    lines.push(`[STATUS DOCUMENTAÇÃO]: ${medico.status_documentacao}`);
  }

  // Cliente vinculado
  lines.push(`[CLIENTE VINCULADO]: ${clienteNome || 'N/A'}`);

  // Clientes alocados
  if (clientesAlocadosNomes.length > 0) {
    lines.push(`[CLIENTES ALOCADOS]: ${clientesAlocadosNomes.join(', ')}`);
  } else {
    lines.push(`[CLIENTES ALOCADOS]: N/A`);
  }

  // Nota: documentos_url são migrados diretamente para medico_documentos como link_externo

  // Resumo IA
  lines.push('');
  lines.push('[RESUMO IA]:');
  if (medico.resumo_ia) {
    lines.push(medico.resumo_ia);
    if (medico.resumo_ia_gerado_em) {
      lines.push(`- Gerado em: ${medico.resumo_ia_gerado_em}`);
    }
    lines.push(`- Aprovado: ${medico.resumo_ia_aprovado ? 'Sim' : 'Não'}`);
    if (medico.resumo_ia_aprovado && medico.resumo_ia_aprovado_em) {
      lines.push(`- Aprovado em: ${medico.resumo_ia_aprovado_em}`);
    }
  } else {
    lines.push('Não gerado');
  }

  // Aprovações
  lines.push('');
  lines.push('[APROVAÇÕES]:');
  lines.push(`- Contrato assinado: ${medico.aprovacao_contrato_assinado ? 'Sim' : 'Não'}`);
  lines.push(`- Documentação unidade: ${medico.aprovacao_documentacao_unidade ? 'Sim' : 'Não'}`);
  lines.push(`- Cadastro unidade: ${medico.aprovacao_cadastro_unidade ? 'Sim' : 'Não'}`);
  lines.push(`- Corpo médico: ${medico.data_aprovacao_corpo_medico || 'Pendente'}`);

  lines.push('');
  lines.push('--- FIM MIGRAÇÃO ---');

  return lines.join('\n');
}

// Transforma medico em payload para leads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function transformMedicoToLead(
  supabase: any,
  medico: MedicoRecord,
  existingLeadObservacoes: string | null,
  forceRandomPhone: boolean = false
): Promise<{ payload: Record<string, unknown>; warnings: string[]; phoneE164Valid: boolean; phoneWasGenerated: boolean }> {
  const warnings: string[] = [];
  let phoneWasGenerated = false;

  // Buscar nome do cliente vinculado
  let clienteNome: string | null = null;
  if (medico.cliente_vinculado_id) {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nome_empresa')
      .eq('id', medico.cliente_vinculado_id)
      .maybeSingle();
    if (cliente && typeof cliente === 'object' && 'nome_empresa' in cliente) {
      clienteNome = (cliente as { nome_empresa: string }).nome_empresa || null;
    }
  }

  // Buscar nomes dos clientes alocados
  const clientesAlocadosNomes: string[] = [];
  if (medico.alocado_cliente_id && medico.alocado_cliente_id.length > 0) {
    const { data: clientes } = await supabase
      .from('clientes')
      .select('nome_empresa')
      .in('id', medico.alocado_cliente_id);
    if (clientes && Array.isArray(clientes)) {
      for (const c of clientes) {
        if (c && typeof c === 'object' && 'nome_empresa' in c) {
          clientesAlocadosNomes.push((c as { nome_empresa: string }).nome_empresa);
        }
      }
    }
  }

  // Buscar vínculos de unidade
  const { data: vinculos } = await supabase
    .from('medico_vinculo_unidade')
    .select('unidade_id')
    .eq('medico_id', medico.id)
    .eq('status', 'ativo');
  
  const unidadesVinculadas: string[] = [];
  if (vinculos && Array.isArray(vinculos)) {
    for (const v of vinculos) {
      if (v && typeof v === 'object' && 'unidade_id' in v) {
        unidadesVinculadas.push((v as { unidade_id: string }).unidade_id);
      }
    }
  }

  // Normalizar telefone para E.164
  let phoneE164 = medico.phone_e164;
  const telefonesAdicionais: string[] = [];
  let phoneE164Valid = false;
  
  if (forceRandomPhone) {
    // Forçar geração de telefone aleatório (para resolver conflitos)
    phoneE164 = await getUniqueRandomPhone(supabase);
    phoneE164Valid = true;
    phoneWasGenerated = true;
    warnings.push(`Telefone aleatório gerado devido a conflito: ${phoneE164}`);
    
    // Guardar telefone original como adicional se existir
    if (medico.telefone) {
      telefonesAdicionais.push(medico.telefone);
    }
    if (medico.phone_e164 && medico.phone_e164 !== phoneE164) {
      telefonesAdicionais.push(medico.phone_e164);
    }
  } else if (!phoneE164 && medico.telefone) {
    const normalized = normalizeToE164(medico.telefone);
    if (normalized) {
      // Verificar se já existe no banco
      const exists = await phoneExistsInLeads(supabase, normalized);
      if (exists) {
        // Telefone já existe, gerar aleatório
        phoneE164 = await getUniqueRandomPhone(supabase);
        phoneE164Valid = true;
        phoneWasGenerated = true;
        telefonesAdicionais.push(normalized); // Guardar original como adicional
        warnings.push(`Telefone ${normalized} já existe. Gerado aleatório: ${phoneE164}`);
      } else {
        phoneE164 = normalized;
        phoneE164Valid = true;
      }
    } else {
      // Não conseguiu normalizar, gerar aleatório
      phoneE164 = await getUniqueRandomPhone(supabase);
      phoneE164Valid = true;
      phoneWasGenerated = true;
      warnings.push(`Telefone inválido "${medico.telefone}". Gerado aleatório: ${phoneE164}`);
      if (medico.telefone) {
        telefonesAdicionais.push(medico.telefone);
      }
    }
  } else if (phoneE164) {
    // Verificar se já existe no banco
    const exists = await phoneExistsInLeads(supabase, phoneE164);
    if (exists) {
      const originalPhone = phoneE164;
      phoneE164 = await getUniqueRandomPhone(supabase);
      phoneE164Valid = true;
      phoneWasGenerated = true;
      telefonesAdicionais.push(originalPhone);
      warnings.push(`Telefone ${originalPhone} já existe. Gerado aleatório: ${phoneE164}`);
    } else {
      phoneE164Valid = true;
    }
    if (medico.telefone) {
      // Se já tem phone_e164, o telefone original vira adicional
      const normalizedAdicional = normalizeToE164(medico.telefone);
      if (normalizedAdicional && normalizedAdicional !== phoneE164 && !telefonesAdicionais.includes(normalizedAdicional)) {
        telefonesAdicionais.push(normalizedAdicional);
      }
    }
  } else {
    // Sem telefone nenhum, gerar aleatório
    phoneE164 = await getUniqueRandomPhone(supabase);
    phoneE164Valid = true;
    phoneWasGenerated = true;
    warnings.push(`Sem telefone. Gerado aleatório: ${phoneE164}`);
  }

  // Especialidades
  const especialidades = medico.especialidade || [];
  const especialidadeSingular = especialidades.length > 0 ? especialidades[0] : null;

  // RQE: array -> string separado por vírgula
  const rqe = medico.rqe_numeros?.join(', ') || null;

  // Status (cast de enum para text)
  const statusMedico = medico.status_medico ? String(medico.status_medico) : 'Ativo';
  const statusContrato = medico.status_contrato || 'Ativo';

  // Construir nota de migração
  const migrationNote = buildMigrationNote(medico, clienteNome, clientesAlocadosNomes);
  
  // Adicionar warnings à nota se houver
  let fullNote = migrationNote;
  if (warnings.length > 0) {
    fullNote = `[AVISOS DE MIGRAÇÃO]:\n${warnings.map(w => `- ${w}`).join('\n')}\n\n${migrationNote}`;
  }

  // Concatenar com observações existentes (migração no topo)
  const observacoes = existingLeadObservacoes 
    ? `${fullNote}\n\n${existingLeadObservacoes}`
    : fullNote;

  // Data de nascimento: passar exatamente como string, sem manipulação de timezone
  // É apenas dia/mês/ano, sem horário
  let dataNascimento: string | null = null;
  if (medico.data_nascimento) {
    const rawDate = String(medico.data_nascimento);
    // Se contiver 'T', extrair apenas YYYY-MM-DD
    if (rawDate.includes('T')) {
      dataNascimento = rawDate.split('T')[0];
    } else {
      dataNascimento = rawDate.substring(0, 10);
    }
  }

  const payload = {
    nome: medico.nome_completo,
    phone_e164: phoneE164, // Sempre terá um valor válido agora
    email: medico.email,
    cpf: medico.cpf,
    crm: medico.crm,
    data_nascimento: dataNascimento,
    uf: medico.estado,
    especialidade: especialidadeSingular,
    especialidades: especialidades,
    rqe: rqe,
    status_medico: statusMedico,
    status_contrato: statusContrato,
    telefones_adicionais: telefonesAdicionais,
    unidades_vinculadas: unidadesVinculadas,
    observacoes: observacoes,
    origem: 'Migracao MedicoDialog',
    status: 'Convertido',
    data_conversao: new Date().toISOString(),
    migrado_de_medico_id: medico.id,
    migrado_de_medico_em: new Date().toISOString(),
  };

  return { payload, warnings, phoneE164Valid, phoneWasGenerated };
}

// Merge arrays removing duplicates
function mergeArrays<T>(arr1: T[] | null | undefined, arr2: T[] | null | undefined): T[] {
  const combined = [...(arr1 || []), ...(arr2 || [])];
  return [...new Set(combined)];
}

// Migra URLs do campo documentos_url para medico_documentos como link_externo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function migrateDocumentosUrlToMedicoDocumentos(
  supabase: any,
  medicoId: string,
  documentosUrl: string[] | null,
  dryRun: boolean
): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = [];
  
  if (!documentosUrl || documentosUrl.length === 0) {
    return { count: 0, warnings };
  }
  
  if (dryRun) {
    return { count: documentosUrl.length, warnings: [`DRY RUN: ${documentosUrl.length} links externos seriam inseridos em medico_documentos`] };
  }
  
  let insertedCount = 0;
  
  for (const url of documentosUrl) {
    try {
      // Verificar se já existe documento com essa URL externa para este médico
      const { data: existingDoc } = await supabase
        .from('medico_documentos')
        .select('id')
        .eq('medico_id', medicoId)
        .eq('url_externa', url)
        .maybeSingle();
      
      if (existingDoc) {
        // Já existe, pular
        continue;
      }
      
      // Determinar nome do arquivo a partir da URL
      let arquivoNome = 'Link Externo';
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          arquivoNome = decodeURIComponent(pathParts[pathParts.length - 1]) || 'Link Externo';
        }
        // Identificar o provedor
        if (urlObj.hostname.includes('drive.google')) {
          arquivoNome = `Google Drive - ${arquivoNome}`;
        } else if (urlObj.hostname.includes('onedrive') || urlObj.hostname.includes('sharepoint')) {
          arquivoNome = `OneDrive - ${arquivoNome}`;
        } else if (urlObj.hostname.includes('dropbox')) {
          arquivoNome = `Dropbox - ${arquivoNome}`;
        }
      } catch {
        // URL inválida, usar nome padrão
      }
      
      // Inserir em medico_documentos como link_externo
      const { error: insertError } = await supabase
        .from('medico_documentos')
        .insert({
          medico_id: medicoId,
          tipo_documento: 'link_externo',
          arquivo_nome: arquivoNome,
          url_externa: url,
          observacoes: 'Migrado automaticamente do campo documentos_url'
        });
      
      if (insertError) {
        warnings.push(`Erro ao inserir link externo ${url}: ${insertError.message}`);
      } else {
        insertedCount++;
      }
    } catch (docError) {
      warnings.push(`Exceção ao processar link ${url}: ${docError instanceof Error ? docError.message : 'Erro'}`);
    }
  }
  
  if (insertedCount > 0) {
    warnings.push(`${insertedCount} de ${documentosUrl.length} links externos inseridos em medico_documentos`);
  }
  
  return { count: insertedCount, warnings };
}

// Migra documentos de medico_documentos para lead_anexos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function migrateDocuments(
  supabase: any,
  medicoId: string,
  leadId: string,
  dryRun: boolean
): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = [];
  
  // Buscar documentos do médico
  const { data: documentos, error } = await supabase
    .from('medico_documentos')
    .select('*')
    .eq('medico_id', medicoId);
  
  if (error) {
    warnings.push(`Erro ao buscar documentos: ${error.message}`);
    return { count: 0, warnings };
  }
  
  if (!documentos || documentos.length === 0) {
    return { count: 0, warnings };
  }
  
  if (dryRun) {
    return { count: documentos.length, warnings: [`DRY RUN: ${documentos.length} documentos seriam migrados`] };
  }
  
  let migratedCount = 0;
  
  for (const doc of documentos) {
    try {
      // Determinar a URL do arquivo
      let arquivoUrl = '';
      
      if (doc.tipo_documento === 'link_externo' && doc.url_externa) {
        // Link externo (Google Drive, OneDrive, etc.)
        arquivoUrl = doc.url_externa;
      } else if (doc.arquivo_path) {
        // Arquivo no storage - gerar URL pública
        const { data: urlData } = await supabase.storage
          .from('medicos-documentos')
          .getPublicUrl(doc.arquivo_path);
        arquivoUrl = urlData?.publicUrl || doc.arquivo_path;
      }
      
      if (!arquivoUrl) {
        warnings.push(`Documento ${doc.id} sem URL válida - pulando`);
        continue;
      }
      
      // Verificar se já existe anexo com mesmo arquivo_url para este lead
      const { data: existingAnexo } = await supabase
        .from('lead_anexos')
        .select('id')
        .eq('lead_id', leadId)
        .eq('arquivo_url', arquivoUrl)
        .maybeSingle();
      
      if (existingAnexo) {
        // Já existe, pular
        continue;
      }
      
      // Inserir no lead_anexos
      const { error: insertError } = await supabase
        .from('lead_anexos')
        .insert({
          lead_id: leadId,
          arquivo_nome: doc.arquivo_nome || 'Documento Migrado',
          arquivo_url: arquivoUrl,
          arquivo_tipo: doc.tipo_documento === 'link_externo' ? 'link_externo' : (doc.tipo_documento || 'outro'),
          usuario_id: doc.uploaded_by,
          usuario_nome: 'Migração Automática',
        });
      
      if (insertError) {
        warnings.push(`Erro ao migrar documento ${doc.id}: ${insertError.message}`);
      } else {
        migratedCount++;
      }
    } catch (docError) {
      warnings.push(`Exceção ao migrar documento ${doc.id}: ${docError instanceof Error ? docError.message : 'Erro'}`);
    }
  }
  
  if (migratedCount > 0) {
    warnings.push(`${migratedCount} de ${documentos.length} documentos migrados com sucesso`);
  }
  
  return { count: migratedCount, warnings };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Create client with user's JWT to verify authentication and role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Não autorizado: Token de autenticação ausente',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a client with user token to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error('[migrate-medicos-to-leads] Auth error:', authError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Não autorizado: Sessão inválida',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role client to check admin role (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if user is admin
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      console.log(`[migrate-medicos-to-leads] Access denied for user ${user.id} - not admin`);
      return new Response(JSON.stringify({
        success: false,
        error: 'Acesso negado: Apenas administradores podem executar migrações',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[migrate-medicos-to-leads] Admin access verified for user ${user.id}`);

    const { dry_run = true, limit = 10, offset = 0, medico_ids } = await req.json();

    // Se medico_ids foi informado, usar busca por IDs específicos
    const hasSpecificIds = Array.isArray(medico_ids) && medico_ids.length > 0;

    console.log(`[migrate-medicos-to-leads] Starting migration - dry_run: ${dry_run}, ${hasSpecificIds ? `specific_ids: ${medico_ids.length}` : `limit: ${limit}, offset: ${offset}`}`);

    let medicos: MedicoRecord[] | null = null;
    let fetchError: Error | null = null;

    if (hasSpecificIds) {
      // Buscar médicos por IDs específicos (ignora limit/offset)
      const { data, error } = await supabase
        .from('medicos')
        .select('*')
        .in('id', medico_ids);
      
      medicos = data as MedicoRecord[] | null;
      fetchError = error;

      // Ordenar na mesma ordem dos IDs enviados
      if (medicos && medicos.length > 0) {
        const idOrder = new Map(medico_ids.map((id: string, index: number) => [id, index]));
        medicos.sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));
      }
    } else {
      // Busca padrão: médicos sem lead_id com limit/offset
      const { data, error } = await supabase
        .from('medicos')
        .select('*')
        .is('lead_id', null)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);
      
      medicos = data as MedicoRecord[] | null;
      fetchError = error;
    }

    if (fetchError) {
      throw new Error(`Erro ao buscar médicos: ${fetchError.message}`);
    }

    if (!medicos || medicos.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: hasSpecificIds ? 'Nenhum dos médicos informados foi encontrado' : 'Nenhum médico para migrar',
        total_processed: 0,
        results: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[migrate-medicos-to-leads] Found ${medicos.length} médicos to process`);

    const results: MigrationResult[] = [];
    const includeFullPayload = dry_run && limit <= 10;

    for (const medicoRaw of medicos) {
      const medico = medicoRaw as MedicoRecord;
      try {
        // 1. Verificar idempotência: já existe lead com migrado_de_medico_id?
        const { data: existingByMigration } = await supabase
          .from('leads')
          .select('id')
          .eq('migrado_de_medico_id', medico.id)
          .maybeSingle();

        if (existingByMigration && typeof existingByMigration === 'object' && 'id' in existingByMigration) {
          const existingId = (existingByMigration as { id: string }).id;
          // Já foi migrado, apenas vincular se necessário
          if (!medico.lead_id && !dry_run) {
            await supabase
              .from('medicos')
              .update({ lead_id: existingId })
              .eq('id', medico.id);
          }
          results.push({
            medico_id: medico.id,
            medico_nome: medico.nome_completo,
            status: 'skipped',
            reason: 'Já migrado anteriormente',
            lead_id: existingId,
          });
          continue;
        }

        // 2. Verificar duplicidade por CPF+CRM e fazer merge se existir
        if (medico.cpf && medico.crm) {
          const { data: existingByCpfCrm } = await supabase
            .from('leads')
            .select('id, observacoes, telefones_adicionais, unidades_vinculadas')
            .eq('cpf', medico.cpf)
            .eq('crm', medico.crm)
            .maybeSingle();

          if (existingByCpfCrm && typeof existingByCpfCrm === 'object' && 'id' in existingByCpfCrm) {
            const existing = existingByCpfCrm as { 
              id: string; 
              observacoes: string | null;
              telefones_adicionais: string[] | null;
              unidades_vinculadas: string[] | null;
            };
            
            if (!dry_run) {
              // Transformar para obter dados de merge
              const { payload, warnings } = await transformMedicoToLead(supabase, medico, existing.observacoes);
              
              // Merge arrays
              const mergedTelefones = mergeArrays(
                existing.telefones_adicionais, 
                payload.telefones_adicionais as string[]
              );
              const mergedUnidades = mergeArrays(
                existing.unidades_vinculadas, 
                payload.unidades_vinculadas as string[]
              );

              await supabase
                .from('leads')
                .update({ 
                  migrado_de_medico_id: medico.id,
                  migrado_de_medico_em: new Date().toISOString(),
                  observacoes: payload.observacoes, // Já concatenado pelo transform
                  telefones_adicionais: mergedTelefones,
                  unidades_vinculadas: mergedUnidades,
                })
                .eq('id', existing.id);

              await supabase
                .from('medicos')
                .update({ lead_id: existing.id })
                .eq('id', medico.id);

              // Primeiro, migrar links externos de documentos_url para medico_documentos
              await migrateDocumentosUrlToMedicoDocumentos(supabase, medico.id, medico.documentos_url, false);
              // Depois, migrar documentos para lead_anexos
              const docResult = await migrateDocuments(supabase, medico.id, existing.id, false);
              
              results.push({
                medico_id: medico.id,
                medico_nome: medico.nome_completo,
                status: 'skipped',
                reason: `Lead existente com mesmo CPF+CRM - dados mesclados. Documentos migrados: ${docResult.count}`,
                lead_id: existing.id,
              });
            } else {
              // Dry run para merge
              const docResult = await migrateDocuments(supabase, medico.id, existing.id, true);
              results.push({
                medico_id: medico.id,
                medico_nome: medico.nome_completo,
                status: 'skipped',
                reason: `DRY RUN - Lead existente (CPF+CRM) seria atualizado. Docs: ${docResult.count}`,
                lead_id: existing.id,
              });
            }
            continue;
          }
        }

        // 3. Transformar médico em lead (agora sempre gera telefone aleatório se necessário)
        const { payload, warnings, phoneE164Valid, phoneWasGenerated } = await transformMedicoToLead(supabase, medico, null);

        // phoneE164Valid agora sempre será true, pois geramos aleatório se necessário
        if (!phoneE164Valid) {
          // Fallback extremo - não deveria acontecer
          results.push({
            medico_id: medico.id,
            medico_nome: medico.nome_completo,
            status: 'error',
            reason: `Falha crítica ao gerar telefone. Telefone original: ${medico.telefone || 'N/A'}`,
            warnings_count: warnings.length,
            summary_fields: {
              phone_e164: null,
              cpf: medico.cpf,
              crm: medico.crm,
              especialidade: (medico.especialidade || [])[0] || null,
            },
          });
          continue;
        }

        if (dry_run) {
          const result: MigrationResult = {
            medico_id: medico.id,
            medico_nome: medico.nome_completo,
            status: 'success',
            reason: `DRY RUN - seria criado. ${phoneWasGenerated ? 'Tel. gerado aleatório. ' : ''}Warnings: ${warnings.length > 0 ? warnings.join('; ') : 'nenhum'}`,
            warnings_count: warnings.length,
            summary_fields: {
              phone_e164: payload.phone_e164 as string | null,
              cpf: payload.cpf as string | null,
              crm: payload.crm as string | null,
              especialidade: payload.especialidade as string | null,
            },
          };
          
          // Incluir payload completo apenas se limit <= 10
          if (includeFullPayload) {
            result.payload = payload;
          }
          
          results.push(result);
          continue;
        }

        // 4. Inserir novo lead com retry em caso de conflito de telefone
        let newLeadId: string | null = null;
        let insertAttempts = 0;
        const maxInsertAttempts = 3;
        let currentPayload = payload;
        
        while (insertAttempts < maxInsertAttempts && !newLeadId) {
          insertAttempts++;
          
          const { data: newLead, error: insertError } = await supabase
            .from('leads')
            .insert(currentPayload)
            .select('id')
            .single();

          if (insertError) {
            // Verificar se é erro de telefone duplicado
            if (insertError.message.includes('leads_phone_e164_key') || insertError.message.includes('duplicate key')) {
              console.log(`[migrate-medicos-to-leads] Conflito de telefone para ${medico.nome_completo}, tentativa ${insertAttempts}. Gerando novo...`);
              // Gerar novo telefone e tentar novamente
              const retryResult = await transformMedicoToLead(supabase, medico, null, true);
              currentPayload = retryResult.payload;
              warnings.push(...retryResult.warnings);
            } else {
              throw new Error(`Erro ao inserir lead: ${insertError.message}`);
            }
          } else {
            newLeadId = (newLead as { id: string }).id;
          }
        }

        if (!newLeadId) {
          throw new Error(`Falha ao inserir lead após ${maxInsertAttempts} tentativas de resolver conflito de telefone`);
        }

        

        // 5. Atualizar médico com lead_id
        const { error: updateError } = await supabase
          .from('medicos')
          .update({ lead_id: newLeadId })
          .eq('id', medico.id);

        if (updateError) {
          console.error(`[migrate-medicos-to-leads] Erro ao atualizar médico ${medico.id}: ${updateError.message}`);
        }

        // 6. Migrar links externos de documentos_url para medico_documentos
        const linksResult = await migrateDocumentosUrlToMedicoDocumentos(supabase, medico.id, medico.documentos_url, false);
        if (linksResult.warnings.length > 0) {
          warnings.push(...linksResult.warnings);
        }

        // 7. Migrar documentos de medico_documentos para lead_anexos
        const docResult = await migrateDocuments(supabase, medico.id, newLeadId, false);
        if (docResult.warnings.length > 0) {
          warnings.push(...docResult.warnings);
        }

        // 7. Registrar auditoria (resiliente - não abortar se falhar)
        try {
          await supabase.from('auditoria_logs').insert({
            modulo: 'Médicos',
            tabela: 'leads',
            acao: 'MIGRATION',
            registro_id: newLeadId,
            registro_descricao: `Migração médico -> lead: ${medico.nome_completo}`,
            dados_antigos: { medico_id: medico.id },
            dados_novos: { lead_id: newLeadId, documentos_migrados: docResult.count },
            usuario_nome: 'Sistema (migrate-medicos-to-leads)',
            detalhes: `Migração automática do MedicoDialog para LeadProntuarioDialog. Documentos migrados: ${docResult.count}`,
          });
        } catch (auditError) {
          console.warn(`[migrate-medicos-to-leads] Warning: Falha ao registrar auditoria para ${medico.id}:`, auditError);
          warnings.push('Falha ao registrar auditoria (não-crítico)');
        }

        results.push({
          medico_id: medico.id,
          medico_nome: medico.nome_completo,
          status: 'success',
          lead_id: newLeadId,
          reason: warnings.length > 0 ? `Migrado com warnings: ${warnings.join('; ')}` : 'Migrado com sucesso',
          warnings_count: warnings.length,
        });

      } catch (error) {
        console.error(`[migrate-medicos-to-leads] Error processing médico ${medico.id}:`, error);
        results.push({
          medico_id: medico.id,
          medico_nome: medico.nome_completo,
          status: 'error',
          reason: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    // Resumo
    const summary = {
      total_processed: results.length,
      success: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      dry_run: dry_run,
      include_full_payload: includeFullPayload,
    };

    console.log(`[migrate-medicos-to-leads] Completed:`, summary);

    return new Response(JSON.stringify({
      success: true,
      summary,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[migrate-medicos-to-leads] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
