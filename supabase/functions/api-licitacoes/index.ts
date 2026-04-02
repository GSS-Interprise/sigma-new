import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function inferTipoFromModalidade(modalidade: string | null | undefined): string | null {
  if (!modalidade) return null;
  const n = modalidade.trim().toUpperCase();
  if (n.includes('PREGÃO') || n.includes('PREGAO') || n.includes('CONCORRÊNCIA') || n.includes('CONCORRENCIA')) return 'MODALIDADE';
  if (n.includes('CREDENCIAMENTO') || n.includes('CHAMAMENTO')) return 'PROC. AUXILIAR';
  if (n.includes('DISPENSA') || n.includes('INEXIGIBILIDADE')) return 'CONTR. DIRETA';
  return null;
}

// Função para buscar status válidos dinamicamente do banco
async function getValidStatuses(supabase: any): Promise<string[]> {
  const { data, error } = await supabase
    .from('kanban_status_config')
    .select('status_id')
    .eq('modulo', 'licitacoes')
    .eq('ativo', true);
  
  if (error) {
    console.error('Error fetching valid statuses:', error);
    return ['captacao_edital']; // fallback
  }
  
  return data.map((row: any) => row.status_id);
}

// Resposta de erro padronizada - SEMPRE retorna 200 para facilitar debug em automações
function errorResponse(code: string, message: string, details?: any, originalStatus = 400) {
  console.error('API_ERROR_RESPONSE', { code, message, details, originalStatus });
  return new Response(
    JSON.stringify({ 
      success: false,
      error: { 
        code, 
        message, 
        details,
        original_http_status: originalStatus,
        timestamp: new Date().toISOString()
      } 
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Resposta de sucesso padronizada
function successResponse(data: any, message: string, status = 200) {
  return new Response(
    JSON.stringify({ 
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function validateToken(authHeader: string | null, supabase: any) {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  const { data } = await supabase.rpc('validate_api_token', { _token: token });
  return data;
}

async function normalizeStatus(status: string | undefined, supabase: any): Promise<string> {
  if (!status) return 'captacao_edital';
  
  const normalized = status.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\//g, '_');
  
  const validStatuses = await getValidStatuses(supabase);
  return validStatuses.includes(normalized) ? normalized : 'captacao_edital';
}

// Função para converter datas de vários formatos para ISO com timezone Brasil
// IMPORTANTE: Adiciona -03:00 para garantir que a hora seja interpretada corretamente
function parseDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  
  // Já está em formato ISO com timezone (YYYY-MM-DDTHH:mm:ss-03:00 ou similar)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/.test(dateStr)) {
    return dateStr;
  }
  
  // Já está em formato ISO com Z (UTC)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(dateStr)) {
    return dateStr;
  }
  
  // Formato ISO sem timezone (YYYY-MM-DDTHH:mm:ss) - adiciona timezone Brasil
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    return `${dateStr}-03:00`;
  }
  
  // Formato ISO apenas data (YYYY-MM-DD) - mantém sem hora
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Formato brasileiro DD/MM/YYYY HH:mm ou DD/MM/YYYY
  const brMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (brMatch) {
    const [, day, month, year, hours, minutes] = brMatch;
    if (hours && minutes) {
      // Adiciona timezone Brasil -03:00 para datas com hora
      return `${year}-${month}-${day}T${hours}:${minutes}:00-03:00`;
    }
    return `${year}-${month}-${day}`;
  }
  
  // Formato DD-MM-YYYY HH:mm ou DD-MM-YYYY
  const dashMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (dashMatch) {
    const [, day, month, year, hours, minutes] = dashMatch;
    if (hours && minutes) {
      // Adiciona timezone Brasil -03:00 para datas com hora
      return `${year}-${month}-${day}T${hours}:${minutes}:00-03:00`;
    }
    return `${year}-${month}-${day}`;
  }
  
  // Tenta usar Date.parse como fallback - NÃO converte para ISO pois perde timezone
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    // Criar data e formatar manualmente para preservar hora local
    const d = new Date(parsed);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
  }
  
  console.warn('Could not parse date:', dateStr);
  return null;
}

function calculatePriority(dataDisputa?: string, prioridade?: string): string {
  if (prioridade) return prioridade;
  if (!dataDisputa) return 'Média';
  
  const isoDate = parseDate(dataDisputa);
  if (!isoDate) return 'Média';
  
  const disputaDate = new Date(isoDate);
  const hoje = new Date();
  const diffDays = Math.ceil((disputaDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  
  return diffDays <= 10 ? 'Alta' : 'Média';
}

// Helpers para path e validações
function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
}

function getSubpath(pathname: string): string {
  const anchor = '/api-licitacoes';
  const idx = pathname.lastIndexOf(anchor);
  if (idx === -1) return pathname;
  return pathname.slice(idx + anchor.length);
}

function cleanText(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return undefined;

  let s = value.trim();
  if (!s) return undefined;

  // remove aspas sobrando (muito comum em payload quebrado do n8n)
  for (let i = 0; i < 3; i++) {
    const startsQuote = s.startsWith('"') || s.startsWith("'");
    const endsQuote = s.endsWith('"') || s.endsWith("'");
    if (startsQuote && endsQuote && s.length >= 2) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }

  while (s.startsWith('"') || s.startsWith("'")) s = s.slice(1).trim();
  while (s.endsWith('"') || s.endsWith("'")) s = s.slice(0, -1).trim();

  return s || undefined;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appendRawPayloadToObjeto(base: string | undefined, raw: any, reason: string): string {
  const baseText = (base ?? '').trim();

  let rawJson = '';
  try {
    rawJson = JSON.stringify(raw, null, 2);
  } catch {
    rawJson = String(raw);
  }

  const limited = rawJson.length > 4000 ? `${rawJson.slice(0, 4000)}\n…` : rawJson;
  const reasonSafe = escapeHtml(reason);

  const header = `<hr><small><strong>Importado do n8n (${reasonSafe})</strong></small>`;
  const payload = `<pre>${escapeHtml(limited)}</pre>`;

  if (!baseText) return `${header}${payload}`;
  return `${baseText}<br><br>${header}${payload}`;
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const tokenId = await validateToken(req.headers.get('Authorization'), supabase);
    if (!tokenId) {
      return errorResponse('UNAUTHORIZED', 'Token inválido ou ausente. Verifique o header Authorization com formato: Bearer <token>', null, 401);
    }

    const url = new URL(req.url);
    const subpath = getSubpath(url.pathname);
    const pathParts = subpath.split('/').filter(Boolean);
    const method = req.method;

    console.log('API_DEBUG', { 
      originalPath: url.pathname, 
      subpath, 
      pathParts, 
      method, 
      queryParams: Object.fromEntries(url.searchParams) 
    });

    // GET /api-licitacoes/columns - Listar colunas do Kanban
    if (method === 'GET' && pathParts.length === 1 && pathParts[0] === 'columns') {
      const { data: columns, error } = await supabase
        .from('kanban_status_config')
        .select('*')
        .eq('modulo', 'licitacoes')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

      if (error) throw error;

      return successResponse(columns, 'Colunas do Kanban recuperadas com sucesso');
    }

    // GET /api-licitacoes
    if (method === 'GET' && pathParts.length === 0) {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const search = url.searchParams.get('search');
      const status = url.searchParams.get('status');
      const municipioUf = url.searchParams.get('municipioUf');
      const modalidade = url.searchParams.get('modalidade'); // maps to subtipo_modalidade
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const tag = url.searchParams.get('tag');

      let query = supabase
        .from('licitacoes')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false });

      if (search) {
        query = query.or(`titulo.ilike.%${search}%,licitacao_codigo.ilike.%${search}%,objeto.ilike.%${search}%`);
      }
      if (status) query = query.eq('status', await normalizeStatus(status, supabase));
      if (municipioUf) query = query.ilike('municipio_uf', `%${municipioUf}%`);
      if (modalidade) query = query.ilike('subtipo_modalidade', `%${modalidade}%`);
      if (from) query = query.gte('data_disputa', from);
      if (to) query = query.lte('data_disputa', to);
      if (tag) query = query.contains('etiquetas', [tag]);

      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return successResponse({ items: data, page, limit, total: count }, `${count} licitações encontradas`);
    }

    // GET /api-licitacoes/:id
    if (method === 'GET' && pathParts.length === 1 && pathParts[0] !== 'columns') {
      const idParam = pathParts[0];
      console.log('GET Single ID attempt:', { idParam, isUuid: isUuid(idParam) });

      if (!isUuid(idParam)) {
        return errorResponse('INVALID_ID', `O ID "${idParam}" não é um UUID válido. Formato esperado: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, null, 400);
      }

      const { data, error } = await supabase
        .from('licitacoes')
        .select('*')
        .eq('id', idParam)
        .single();

      if (error && error.code === 'PGRST116') {
        return errorResponse('NOT_FOUND', `Licitação com ID "${idParam}" não encontrada`, null, 404);
      }
      if (error) throw error;

      return successResponse(data, 'Licitação recuperada com sucesso');
    }

    // POST /api-licitacoes - Criar nova licitação
    if (method === 'POST' && pathParts.length === 0) {
      let rawBody: any;
      try {
        rawBody = await req.clone().json();
      } catch (_e) {
        // Alguns fluxos (ex: n8n) enviam body como texto; tentamos parse manual
        const text = await req.text();
        try {
          rawBody = JSON.parse(text);
        } catch (_e2) {
          // Último fallback: não bloqueia — registra tudo dentro de objeto
          rawBody = {
            fonte: 'n8n',
            objeto: `Payload não-JSON recebido (fallback):\n\n${text}`,
          };
        }
      }

      const body0 = Array.isArray(rawBody) ? rawBody[0] : rawBody;

      const fonteReq = cleanText(body0?.fonte) ?? (typeof body0?.fonte === 'string' ? body0.fonte : undefined);
      // Heurística: payload do n8n/Effect frequentemente não manda "fonte", então detectamos pelo formato
      const isN8n = (fonteReq ?? '').toLowerCase() === 'n8n'
        || !!body0?.portalNome
        || !!body0?.pregao
        || !!body0?.refer
        || !!body0?.orgaoDetalhe
        || !!body0?.uasgNome;

      // Mapeamento flexível (n8n/Effect)
      const effectIdCandidate = cleanText(body0?.effect_id) ?? cleanText(body0?.id) ?? cleanText(body0?.refer);
      const numeroEditalCandidate = cleanText(body0?.numero_edital) ?? cleanText(body0?.pregao) ?? effectIdCandidate;
      const licitacaoCodigoCandidate = cleanText(body0?.licitacao_codigo) ?? numeroEditalCandidate ?? effectIdCandidate;

      const orgaoCandidate = cleanText(body0?.orgao)
        ?? cleanText(body0?.orgaoDetalhe?.nomeOrgao)
        ?? cleanText(body0?.uasgNome);

      const modalidadeCandidate = cleanText(body0?.modalidade)
        ?? cleanText(body0?.tipo)
        ?? cleanText(body0?.modalidadeCuston);

      const municipioCandidate = cleanText(body0?.municipio_uf)
        ?? cleanText(body0?.orgaoDetalhe?.municipio);
      const ufCandidate = cleanText(body0?.uf);
      const municipioUfCandidate = municipioCandidate
        ? ((ufCandidate && !municipioCandidate.includes('/')) ? `${municipioCandidate}/${ufCandidate}` : municipioCandidate)
        : undefined;

      const rawColumnId = cleanText(body0?.column_id)
        ?? cleanText(body0?.Columnid)
        ?? cleanText(body0?.columnId);

      const cleanedColumnId = rawColumnId && isUuid(rawColumnId) ? rawColumnId : undefined;
      const invalidColumnId = rawColumnId && !isUuid(rawColumnId) ? rawColumnId : undefined;

      // Sanitização/normalização de strings (evita payloads quebrados do n8n com aspas sobrando)
      const body: any = {
        ...body0,
        titulo: cleanText(body0?.titulo) ?? cleanText(body0?.pregao) ?? (numeroEditalCandidate ? `Edital ${numeroEditalCandidate}` : undefined),
        licitacao_codigo: licitacaoCodigoCandidate,
        numero_edital: numeroEditalCandidate,
        municipio_uf: municipioUfCandidate,
        subtipo_modalidade: cleanText(body0?.subtipo_modalidade) || modalidadeCandidate,
        tipo_modalidade: cleanText(body0?.tipo_modalidade) || inferTipoFromModalidade(cleanText(body0?.subtipo_modalidade) || modalidadeCandidate),
        orgao: orgaoCandidate,
        // objeto pode conter HTML, então preservamos quando vier string
        objeto: typeof body0?.objeto === 'string' ? body0.objeto : cleanText(body0?.objeto),
        observacoes: typeof body0?.observacoes === 'string' ? body0.observacoes : cleanText(body0?.observacoes),
        effect_id: effectIdCandidate,
        fonte: fonteReq ?? body0?.fonte,
        tipo_licitacao: cleanText(body0?.tipo_licitacao) ?? cleanText(body0?.perfil) ?? null,
        responsavel_id: cleanText(body0?.responsavel_id),
        column_id: cleanedColumnId,
      };

      // Fallback agressivo para n8n: nunca bloquear criação por falta de mapeamento
      if (isN8n) {
        const reasons: string[] = [];

        if (!body.numero_edital) {
          body.numero_edital = body.effect_id || body.licitacao_codigo;
          reasons.push('numero_edital ausente');
        }

        if (!body.orgao) {
          body.orgao = 'Não informado';
          reasons.push('orgao ausente');
        }

        if (!body.titulo) {
          body.titulo = body.numero_edital ? `Edital ${body.numero_edital}` : 'Licitação importada';
          reasons.push('titulo ausente');
        }

        if (!body.objeto) {
          // tenta completar com itens, se existirem
          const item0Desc = cleanText(body0?.item?.[0]?.descricao) ?? cleanText(body0?.item?.[0]?.objeto);
          body.objeto = item0Desc ? `${body.titulo}<br>${escapeHtml(item0Desc)}` : body.titulo;
          reasons.push('objeto ausente');
        }

        if (invalidColumnId) {
          reasons.push(`column_id não é UUID: ${invalidColumnId}`);
        }

        if (reasons.length > 0) {
          body.objeto = appendRawPayloadToObjeto(body.objeto, body0, reasons.join('; '));
        }
      }

      // Debug: log do body recebido
      console.log('POST_BODY_RECEIVED', JSON.stringify({
        is_array: Array.isArray(rawBody),
        array_length: Array.isArray(rawBody) ? rawBody.length : undefined,
        fonte: body?.fonte,
        effect_id: body?.effect_id,
        titulo: body?.titulo,
        licitacao_codigo: body?.licitacao_codigo,
        numero_edital: body?.numero_edital,
        column_id: body?.column_id,
        full_body_keys: body ? Object.keys(body) : [],
      }));

      // Validação de campos obrigatórios (somente hard-gate fora do n8n)
      const missingFields: string[] = [];
      if (!body.numero_edital) missingFields.push('numero_edital');
      if (!body.orgao) missingFields.push('orgao');
      if (!body.objeto) missingFields.push('objeto');

      if (missingFields.length > 0 && !isN8n) {
        return errorResponse(
          'MISSING_FIELDS',
          `Campos obrigatórios não informados: ${missingFields.join(', ')}`,
          { required_fields: ['numero_edital', 'orgao', 'objeto'], missing: missingFields },
          400,
        );
      }

      // Idempotência para n8n: se já existe, atualiza ao invés de rejeitar
      let existingLicitacao: any = null;

      if (body.effect_id) {
        const { data: existing, error: existingError } = await supabase
          .from('licitacoes')
          .select('id, titulo, licitacao_codigo, effect_id')
          .eq('effect_id', body.effect_id)
          .maybeSingle();

        if (existingError) {
          console.warn('DUPLICATE_CHECK_WARNING(effect_id)', existingError);
        }

        if (existing) {
          if (!isN8n) {
            return errorResponse(
              'DUPLICATE_EFFECT_ID',
              `Licitação do Effect com ID "${body.effect_id}" já existe no sistema`,
              { existing_id: existing.id, existing_titulo: existing.titulo, existing_codigo: existing.licitacao_codigo },
              409,
            );
          }
          existingLicitacao = existing;
        }
      }

      if (!existingLicitacao && body.licitacao_codigo) {
        const { data: existing, error: existingError } = await supabase
          .from('licitacoes')
          .select('id, titulo, effect_id, licitacao_codigo')
          .eq('licitacao_codigo', body.licitacao_codigo)
          .maybeSingle();

        if (existingError) {
          console.warn('DUPLICATE_CHECK_WARNING(licitacao_codigo)', existingError);
        }

        if (existing) {
          if (!isN8n) {
            return errorResponse(
              'DUPLICATE_CODIGO',
              `Licitação com código "${body.licitacao_codigo}" já existe no sistema`,
              { existing_id: existing.id, existing_titulo: existing.titulo },
              409,
            );
          }
          existingLicitacao = existing;
        }
      }

      const prioridade = calculatePriority(body.data_disputa, body.prioridade);

      // Determinar status via column_id ou status direto
      let status = 'captacao_edital';
      let columnInfo = null;

      if (body.column_id) {
        // Buscar o status vinculado ao column_id
        const { data: coluna, error: colunaError } = await supabase
          .from('kanban_status_config')
          .select('id, status_id, label')
          .eq('id', body.column_id)
          .eq('modulo', 'licitacoes')
          .single();

        if (colunaError || !coluna) {
          if (!isN8n) {
            // Listar colunas válidas para ajudar o usuário
            const { data: validColumns } = await supabase
              .from('kanban_status_config')
              .select('id, status_id, label')
              .eq('modulo', 'licitacoes')
              .eq('ativo', true);

            return errorResponse(
              'INVALID_COLUMN_ID',
              `O column_id "${body.column_id}" não existe ou não está ativo`,
              { valid_columns: validColumns },
              400,
            );
          }

          console.warn('N8N_INVALID_COLUMN_ID_FALLBACK', { column_id: body.column_id, colunaError });
          body.objeto = appendRawPayloadToObjeto(body.objeto, body0, `column_id inválido/inativo: ${body.column_id}`);
        } else {
          status = coluna.status_id;
          columnInfo = coluna;
        }
      } else if (body.status) {
        status = await normalizeStatus(body.status, supabase);
      }

      // Log completo do body para debug
      console.log('INSERT_DATA_MAPPING', JSON.stringify({
        received: {
          titulo: body.titulo,
          numero_edital: body.numero_edital,
          effect_id: body.effect_id,
          column_id: body.column_id,
          tipo_licitacao: body.tipo_licitacao,
          data_disputa: body.data_disputa,
          orgao: body.orgao,
          objeto: typeof body.objeto === 'string' ? body.objeto.substring(0, 100) : undefined,
        },
        computed_status: status,
        existing_mode: existingLicitacao ? 'update' : 'insert',
      }));

      const insertData: any = {
        titulo: body.titulo,
        licitacao_codigo: body.licitacao_codigo,
        numero_edital: body.numero_edital || body.licitacao_codigo,
        municipio_uf: body.municipio_uf,
        subtipo_modalidade: body.subtipo_modalidade || body.modalidade,
        tipo_modalidade: body.tipo_modalidade || inferTipoFromModalidade(body.subtipo_modalidade || body.modalidade),
        orgao: body.orgao || 'Não informado',
        valor_estimado: body.valor_estimado,
        data_disputa: parseDate(body.data_disputa),
        objeto: body.objeto || body.titulo,
        observacoes: body.observacoes,
        fonte: body.fonte || 'API',
        effect_id: body.effect_id,
        status,
        etiquetas: Array.isArray(body.etiquetas) ? body.etiquetas : [],
        responsavel_id: body.responsavel_id,
        tipo_licitacao: body.tipo_licitacao || null,
        prioridade: body.prioridade || null,
      };

      if (existingLicitacao && isN8n) {
        const updateData: any = { ...insertData };
        if (!Array.isArray(body.etiquetas)) delete updateData.etiquetas;
        // CRITICAL: Never overwrite status on n8n updates — users manage status manually
        delete updateData.status;
        // Also preserve user-managed fields
        delete updateData.responsavel_id;
        delete updateData.prioridade;
        delete updateData.etiquetas;
        delete updateData.tipo_licitacao;

        const { data: updatedLicitacao, error: updateError } = await supabase
          .from('licitacoes')
          .update(updateData)
          .eq('id', existingLicitacao.id)
          .select()
          .single();

        if (updateError) {
          console.error('UPDATE_ERROR', updateError);
          return errorResponse('UPDATE_ERROR', `Erro ao atualizar licitação existente: ${updateError.message}`, { db_error: updateError }, 500);
        }

        // Registrar atividade de atualização (melhor esforço)
        await supabase.from('licitacoes_atividades').insert({
          licitacao_id: updatedLicitacao.id,
          tipo: 'comentario',
          descricao: `Licitação atualizada via n8n${body.effect_id ? ` (Effect ID: ${body.effect_id})` : ''}`,
          user_id: body.responsavel_id || null,
        });

        return successResponse({
          card_id: updatedLicitacao.id,
          licitacao: updatedLicitacao,
          column: columnInfo,
          updated_existing: true,
          attachment_endpoint: `/api-licitacoes/${updatedLicitacao.id}/attachments`,
        }, 'Licitação já existia — atualizada com sucesso', 200);
      }

      const { data: newLicitacao, error } = await supabase
        .from('licitacoes')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('INSERT_ERROR', error);
        return errorResponse('INSERT_ERROR', `Erro ao inserir licitação: ${error.message}`, { db_error: error }, 500);
      }

      // Criar tarefa na worklist
      const { error: worklistError } = await supabase.from('worklist_tarefas').insert({
        modulo: 'licitacoes',
        titulo: body.titulo || `Edital ${body.numero_edital}`,
        descricao: `Novo edital: ${body.licitacao_codigo || body.numero_edital}`,
        status,
        prioridade,
        licitacao_id: newLicitacao.id,
        responsavel_id: body.responsavel_id,
      });

      if (worklistError) {
        console.warn('WORKLIST_WARNING', worklistError);
      }

      // Registrar atividade de criação
      const fonteCriacao = body.fonte || 'API';
      const { error: atividadeError } = await supabase.from('licitacoes_atividades').insert({
        licitacao_id: newLicitacao.id,
        tipo: 'comentario',
        descricao: `Licitação criada via ${fonteCriacao}${body.effect_id ? ` (Effect ID: ${body.effect_id})` : ''}`,
        user_id: body.responsavel_id || null,
      });

      if (atividadeError) {
        console.warn('ATIVIDADE_WARNING', atividadeError);
      }

      return successResponse({
        card_id: newLicitacao.id,
        licitacao: newLicitacao,
        column: columnInfo,
        worklist_created: !worklistError,
        atividade_created: !atividadeError,
        attachment_endpoint: `/api-licitacoes/${newLicitacao.id}/attachments`
      }, 'Licitação criada com sucesso', 201);
    }

    // PUT /api-licitacoes/:id - Atualização completa
    if (method === 'PUT' && pathParts.length === 1) {
      const id = pathParts[0];
      
      if (!isUuid(id)) {
        return errorResponse('INVALID_ID', `O ID "${id}" não é um UUID válido`, null, 400);
      }

      let body;
      try {
        body = await req.json();
      } catch (e) {
        return errorResponse('INVALID_JSON', 'O corpo da requisição não é um JSON válido', null, 400);
      }

      // Verificar se licitação existe
      const { data: existingLicitacao, error: fetchError } = await supabase
        .from('licitacoes')
        .select('id')
        .eq('id', id)
        .single();

      if (fetchError || !existingLicitacao) {
        return errorResponse('NOT_FOUND', `Licitação com ID "${id}" não encontrada`, null, 404);
      }

      const updateData: any = {};
      if (body.titulo) updateData.titulo = body.titulo;
      if (body.licitacao_codigo) {
        updateData.licitacao_codigo = body.licitacao_codigo;
        updateData.numero_edital = body.licitacao_codigo;
      }
      if (body.numero_edital) updateData.numero_edital = body.numero_edital;
      if (body.municipio_uf) updateData.municipio_uf = body.municipio_uf;
      if (body.modalidade) {
        updateData.subtipo_modalidade = body.modalidade;
        updateData.tipo_modalidade = inferTipoFromModalidade(body.modalidade);
      }
      if (body.subtipo_modalidade) updateData.subtipo_modalidade = body.subtipo_modalidade;
      if (body.tipo_modalidade) updateData.tipo_modalidade = body.tipo_modalidade;
      if (body.orgao) updateData.orgao = body.orgao;
      if (body.valor_estimado !== undefined) updateData.valor_estimado = body.valor_estimado;
      if (body.data_disputa) updateData.data_disputa = parseDate(body.data_disputa);
      if (body.objeto) updateData.objeto = body.objeto;
      if (body.observacoes) updateData.observacoes = body.observacoes;
      if (body.fonte) updateData.fonte = body.fonte;
      if (body.effect_id) updateData.effect_id = body.effect_id;
      if (body.status) updateData.status = await normalizeStatus(body.status, supabase);
      if (body.etiquetas) updateData.etiquetas = body.etiquetas;
      if (body.responsavel_id) updateData.responsavel_id = body.responsavel_id;
      
      // Campos legados (compatibilidade)
      if (body.licitacaoCodigo) {
        updateData.licitacao_codigo = body.licitacaoCodigo;
        updateData.numero_edital = body.licitacaoCodigo;
      }
      if (body.municipioUf) updateData.municipio_uf = body.municipioUf;
      if (body.orgaoSolicitante) updateData.orgao = body.orgaoSolicitante;
      if (body.valorEstimado !== undefined) updateData.valor_estimado = body.valorEstimado;
      if (body.dataDisputa) updateData.data_disputa = parseDate(body.dataDisputa);
      if (body.descricao) updateData.objeto = body.descricao;
      if (body.effectId) updateData.effect_id = body.effectId;
      if (body.licitacaoStatus) updateData.status = await normalizeStatus(body.licitacaoStatus, supabase);
      if (body.tags) updateData.etiquetas = body.tags;
      if (body.responsavel) updateData.responsavel_id = body.responsavel;

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('licitacoes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('UPDATE_ERROR', error);
        return errorResponse('UPDATE_ERROR', `Erro ao atualizar licitação: ${error.message}`, { db_error: error }, 500);
      }

      return successResponse({
        card_id: data.id,
        licitacao: data,
        updated_fields: Object.keys(updateData)
      }, 'Licitação atualizada com sucesso');
    }

    // PATCH /api-licitacoes/:id - Atualização parcial
    if (method === 'PATCH' && pathParts.length === 1) {
      const id = pathParts[0];
      
      if (!isUuid(id)) {
        return errorResponse('INVALID_ID', `O ID "${id}" não é um UUID válido`, null, 400);
      }

      let body;
      try {
        body = await req.json();
      } catch (e) {
        return errorResponse('INVALID_JSON', 'O corpo da requisição não é um JSON válido', null, 400);
      }

      // Verificar se licitação existe
      const { data: existingLicitacao, error: fetchError } = await supabase
        .from('licitacoes')
        .select('id')
        .eq('id', id)
        .single();

      if (fetchError || !existingLicitacao) {
        return errorResponse('NOT_FOUND', `Licitação com ID "${id}" não encontrada`, null, 404);
      }

      const updateData: any = {};
      
      // Campos novos (snake_case)
      if (body.titulo !== undefined) updateData.titulo = body.titulo;
      if (body.licitacao_codigo !== undefined) {
        updateData.licitacao_codigo = body.licitacao_codigo;
        updateData.numero_edital = body.licitacao_codigo;
      }
      if (body.numero_edital !== undefined) updateData.numero_edital = body.numero_edital;
      if (body.municipio_uf !== undefined) updateData.municipio_uf = body.municipio_uf;
      if (body.modalidade !== undefined) {
        updateData.subtipo_modalidade = body.modalidade;
        updateData.tipo_modalidade = inferTipoFromModalidade(body.modalidade);
      }
      if (body.subtipo_modalidade !== undefined) updateData.subtipo_modalidade = body.subtipo_modalidade;
      if (body.tipo_modalidade !== undefined) updateData.tipo_modalidade = body.tipo_modalidade;
      if (body.orgao !== undefined) updateData.orgao = body.orgao;
      if (body.valor_estimado !== undefined) updateData.valor_estimado = body.valor_estimado;
      if (body.data_disputa !== undefined) updateData.data_disputa = parseDate(body.data_disputa);
      if (body.objeto !== undefined) updateData.objeto = body.objeto;
      if (body.observacoes !== undefined) updateData.observacoes = body.observacoes;
      if (body.fonte !== undefined) updateData.fonte = body.fonte;
      if (body.effect_id !== undefined) updateData.effect_id = body.effect_id;
      if (body.status !== undefined) updateData.status = await normalizeStatus(body.status, supabase);
      if (body.etiquetas !== undefined) updateData.etiquetas = body.etiquetas;
      if (body.responsavel_id !== undefined) updateData.responsavel_id = body.responsavel_id;
      
      // Campos legados (camelCase - compatibilidade)
      if (body.licitacaoCodigo !== undefined) {
        updateData.licitacao_codigo = body.licitacaoCodigo;
        updateData.numero_edital = body.licitacaoCodigo;
      }
      if (body.municipioUf !== undefined) updateData.municipio_uf = body.municipioUf;
      if (body.orgaoSolicitante !== undefined) updateData.orgao = body.orgaoSolicitante;
      if (body.valorEstimado !== undefined) updateData.valor_estimado = body.valorEstimado;
      if (body.dataDisputa !== undefined) updateData.data_disputa = parseDate(body.dataDisputa);
      if (body.descricao !== undefined) updateData.objeto = body.descricao;
      if (body.effectId !== undefined) updateData.effect_id = body.effectId;
      if (body.licitacaoStatus !== undefined) updateData.status = await normalizeStatus(body.licitacaoStatus, supabase);
      if (body.tags !== undefined) updateData.etiquetas = body.tags;
      if (body.responsavel !== undefined) updateData.responsavel_id = body.responsavel;

      if (Object.keys(updateData).length === 0) {
        return errorResponse('NO_FIELDS', 'Nenhum campo válido para atualização foi informado', { received_fields: Object.keys(body) }, 400);
      }

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('licitacoes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('PATCH_ERROR', error);
        return errorResponse('UPDATE_ERROR', `Erro ao atualizar licitação: ${error.message}`, { db_error: error }, 500);
      }

      return successResponse({
        card_id: data.id,
        licitacao: data,
        updated_fields: Object.keys(updateData).filter(k => k !== 'updated_at')
      }, 'Licitação atualizada com sucesso');
    }

    // DELETE /api-licitacoes/:id
    if (method === 'DELETE' && pathParts.length === 1) {
      const id = pathParts[0];
      
      if (!isUuid(id)) {
        return errorResponse('INVALID_ID', `O ID "${id}" não é um UUID válido`, null, 400);
      }

      // Verificar se existe
      const { data: existingLicitacao, error: fetchError } = await supabase
        .from('licitacoes')
        .select('id, titulo')
        .eq('id', id)
        .single();

      if (fetchError || !existingLicitacao) {
        return errorResponse('NOT_FOUND', `Licitação com ID "${id}" não encontrada`, null, 404);
      }

      // Remove da worklist
      await supabase.from('worklist_tarefas').delete().eq('licitacao_id', id);

      // Remove anexos do storage
      const { data: files } = await supabase.storage.from('editais-pdfs').list(`${id}/`);
      if (files && files.length > 0) {
        const filePaths = files.map(f => `${id}/${f.name}`);
        await supabase.storage.from('editais-pdfs').remove(filePaths);
      }

      const { error } = await supabase.from('licitacoes').delete().eq('id', id);
      if (error) {
        console.error('DELETE_ERROR', error);
        return errorResponse('DELETE_ERROR', `Erro ao excluir licitação: ${error.message}`, { db_error: error }, 500);
      }

      return successResponse({ 
        deleted_id: id, 
        deleted_titulo: existingLicitacao.titulo,
        attachments_removed: files?.length || 0
      }, 'Licitação excluída com sucesso');
    }

    // GET /api-licitacoes/:id/attachments - Listar anexos
    if (method === 'GET' && pathParts.length === 2 && pathParts[1] === 'attachments') {
      const id = pathParts[0];
      
      if (!isUuid(id)) {
        return errorResponse('INVALID_ID', `O ID "${id}" não é um UUID válido`, null, 400);
      }

      // Verificar se licitação existe
      const { data: licitacao, error: fetchError } = await supabase
        .from('licitacoes')
        .select('id, titulo')
        .eq('id', id)
        .single();

      if (fetchError || !licitacao) {
        return errorResponse('NOT_FOUND', `Licitação com ID "${id}" não encontrada`, null, 404);
      }

      const { data: files, error } = await supabase.storage
        .from('editais-pdfs')
        .list(`${id}/`);

      if (error) {
        console.error('LIST_ATTACHMENTS_ERROR', error);
        return errorResponse('STORAGE_ERROR', `Erro ao listar anexos: ${error.message}`, { storage_error: error }, 500);
      }

      const attachments = (files || []).map((f: any) => ({
        id: f.id,
        filename: f.name,
        size: f.metadata?.size,
        mime: f.metadata?.mimetype,
        path: `${id}/${f.name}`,
        created_at: f.created_at
      }));

      return successResponse({
        card_id: id,
        card_titulo: licitacao.titulo,
        attachments,
        total: attachments.length
      }, `${attachments.length} anexo(s) encontrado(s)`);
    }

    // POST /api-licitacoes/:id/attachments - Upload de anexo
    if (method === 'POST' && pathParts.length === 2 && pathParts[1] === 'attachments') {
      const id = pathParts[0];
      
      if (!isUuid(id)) {
        return errorResponse('INVALID_ID', `O ID "${id}" não é um UUID válido`, null, 400);
      }

      // Verificar se licitação existe
      const { data: licitacao, error: fetchError } = await supabase
        .from('licitacoes')
        .select('id, titulo')
        .eq('id', id)
        .single();

      if (fetchError || !licitacao) {
        return errorResponse('NOT_FOUND', `Licitação com ID "${id}" não encontrada`, null, 404);
      }

      const contentType = req.headers.get('content-type') || '';
      
      let file: File | null = null;
      let filename: string = '';
      let fileBuffer: ArrayBuffer;
      let fileMime: string;

      // Suporta multipart/form-data ou qualquer content-type binário
      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        file = formData.get('file') as File;
        filename = (formData.get('filename') as string) || file?.name || `arquivo_${Date.now()}`;
        
        if (!file) {
          return errorResponse('NO_FILE', 'Nenhum arquivo foi enviado. Use o campo "file" no form-data', null, 400);
        }
        
        fileBuffer = await file.arrayBuffer();
        fileMime = file.type || 'application/octet-stream';
      } else {
        // Recebe arquivo direto no body (qualquer tipo)
        filename = url.searchParams.get('filename') || req.headers.get('x-filename') || `arquivo_${Date.now()}`;
        fileBuffer = await req.arrayBuffer();
        fileMime = contentType.split(';')[0] || 'application/octet-stream';
        
        if (fileBuffer.byteLength === 0) {
          return errorResponse('NO_FILE', 'Nenhum arquivo foi enviado no body', null, 400);
        }
      }

      // Limite de tamanho: 50MB
      const maxSize = 50 * 1024 * 1024;
      if (fileBuffer.byteLength > maxSize) {
        return errorResponse(
          'FILE_TOO_LARGE', 
          `Arquivo excede o limite de 50MB. Tamanho: ${(fileBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`,
          { max_size_mb: 50, received_size_mb: fileBuffer.byteLength / 1024 / 1024 },
          400
        );
      }

      // Sanitiza o nome do arquivo
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      
      // Verifica se já existe arquivo com mesmo nome e adiciona sufixo se necessário
      const { data: existingFiles } = await supabase.storage
        .from('editais-pdfs')
        .list(`${id}/`);
      
      let uniqueFilename = safeFilename;
      if (existingFiles && existingFiles.some(f => f.name === safeFilename)) {
        // Adiciona timestamp ao nome para evitar sobrescrita
        const ext = safeFilename.includes('.') ? safeFilename.substring(safeFilename.lastIndexOf('.')) : '';
        const nameWithoutExt = safeFilename.includes('.') ? safeFilename.substring(0, safeFilename.lastIndexOf('.')) : safeFilename;
        uniqueFilename = `${nameWithoutExt}_${Date.now()}${ext}`;
      }
      
      const finalPath = `${id}/${uniqueFilename}`;

      const { data, error } = await supabase.storage
        .from('editais-pdfs')
        .upload(finalPath, fileBuffer, {
          contentType: fileMime,
          upsert: true // Permite sobrescrever se já existir (evita erro em race conditions)
        });

      if (error) {
        console.error('UPLOAD_ERROR', error);
        return errorResponse('UPLOAD_ERROR', `Erro ao fazer upload: ${error.message}`, { storage_error: error }, 500);
      }

      // Gerar URL pública se o bucket for público
      const { data: urlData } = supabase.storage.from('editais-pdfs').getPublicUrl(finalPath);

      return successResponse({
        card_id: id,
        card_titulo: licitacao.titulo,
        attachment: {
          path: data.path,
          filename: uniqueFilename,
          size: fileBuffer.byteLength,
          mime: fileMime,
          public_url: urlData?.publicUrl
        }
      }, 'Arquivo enviado com sucesso', 201);
    }

    // DELETE /api-licitacoes/:id/attachments/:filename - Remover anexo
    if (method === 'DELETE' && pathParts.length === 3 && pathParts[1] === 'attachments') {
      const id = pathParts[0];
      const filename = decodeURIComponent(pathParts[2]);
      
      if (!isUuid(id)) {
        return errorResponse('INVALID_ID', `O ID "${id}" não é um UUID válido`, null, 400);
      }

      // Verificar se licitação existe
      const { data: licitacao, error: fetchError } = await supabase
        .from('licitacoes')
        .select('id')
        .eq('id', id)
        .single();

      if (fetchError || !licitacao) {
        return errorResponse('NOT_FOUND', `Licitação com ID "${id}" não encontrada`, null, 404);
      }

      const filePath = `${id}/${filename}`;
      const { error } = await supabase.storage
        .from('editais-pdfs')
        .remove([filePath]);

      if (error) {
        console.error('DELETE_ATTACHMENT_ERROR', error);
        return errorResponse('DELETE_ERROR', `Erro ao excluir arquivo: ${error.message}`, { storage_error: error }, 500);
      }

      return successResponse({
        card_id: id,
        deleted_file: filename
      }, 'Arquivo excluído com sucesso');
    }

    return errorResponse('NOT_FOUND', 'Endpoint não encontrado', { 
      available_endpoints: [
        'GET /api-licitacoes',
        'GET /api-licitacoes/columns',
        'GET /api-licitacoes/:id',
        'POST /api-licitacoes',
        'PUT /api-licitacoes/:id',
        'PATCH /api-licitacoes/:id',
        'DELETE /api-licitacoes/:id',
        'GET /api-licitacoes/:id/attachments',
        'POST /api-licitacoes/:id/attachments',
        'DELETE /api-licitacoes/:id/attachments/:filename'
      ]
    }, 404);

  } catch (error: any) {
    console.error('API_FATAL_ERROR:', error);
    return errorResponse('INTERNAL_ERROR', 'Erro interno do servidor', { 
      message: error.message,
      stack: Deno.env.get('ENVIRONMENT') === 'development' ? error.stack : undefined 
    }, 500);
  }
});
