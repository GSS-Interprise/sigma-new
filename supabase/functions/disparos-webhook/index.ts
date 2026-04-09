import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ContatoInput {
  lead_id?: string;
  nome: string;
  telefone: string;
}

interface WebhookPayload {
  campanha_id: string;
  contatos?: ContatoInput[];
  acao?: 'iniciar' | 'pausar' | 'retomar' | 'buscar_pendentes' | 'processar_agendados';
  limite?: number;
}

// Configurações de lote
const LIMITE_POR_DIA = 120; // Máximo de contatos por dia
const LIMITE_POR_DISPARO = 600; // Limite total por disparo
const HORA_ENVIO_AGENDADO = 8; // 8:00 da manhã (horário São Paulo)

// Função para calcular próximo horário de envio (8h de São Paulo)
function getProximaData8hSaoPaulo(): Date {
  // Criar data atual em UTC
  const agora = new Date();
  
  // Offset de São Paulo: -3 horas (em minutos: -180)
  const offsetSaoPaulo = -180;
  
  // Calcular horário atual em São Paulo
  const agoraSaoPauloMs = agora.getTime() + (agora.getTimezoneOffset() + offsetSaoPaulo) * 60 * 1000;
  const agoraSaoPaulo = new Date(agoraSaoPauloMs);
  
  // Criar data para amanhã às 8:00 em São Paulo
  const amanha8hSaoPaulo = new Date(agoraSaoPaulo);
  amanha8hSaoPaulo.setDate(amanha8hSaoPaulo.getDate() + 1);
  amanha8hSaoPaulo.setHours(HORA_ENVIO_AGENDADO, 0, 0, 0);
  
  // Converter de volta para UTC
  const amanha8hUTCMs = amanha8hSaoPaulo.getTime() - (agora.getTimezoneOffset() + offsetSaoPaulo) * 60 * 1000;
  
  return new Date(amanha8hUTCMs);
}

function formatPhoneE164(telefone: string): string {
  let telLimpo = String(telefone).replace(/\D/g, '');
  
  if (!telLimpo.startsWith('55')) {
    telLimpo = '55' + telLimpo;
  }
  
  const telNacional = telLimpo.substring(2);
  
  if (telNacional.length === 10) {
    const ddd = telNacional.substring(0, 2);
    const numero = telNacional.substring(2);
    return '55' + ddd + '9' + numero;
  } else if (telNacional.length === 11) {
    return '55' + telNacional;
  }
  
  return telLimpo;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: WebhookPayload = await req.json();
    const { campanha_id, contatos, acao, limite = 50 } = payload;

    console.log('[disparos-webhook] Recebido:', { campanha_id, acao, contatosCount: contatos?.length });

    if (!campanha_id) {
      return new Response(
        JSON.stringify({ error: 'campanha_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se campanha existe
    const { data: campanha, error: campanhaError } = await supabase
      .from('disparos_campanhas')
      .select('*')
      .eq('id', campanha_id)
      .single();

    if (campanhaError || !campanha) {
      return new Response(
        JSON.stringify({ error: 'Campanha não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ação: Adicionar contatos à campanha (chamado pelo Sigma)
    if (contatos && contatos.length > 0) {
      // Verificar limite de 600 contatos por campanha
      const totalAtual = campanha.total_contatos || 0;
      const novoTotal = totalAtual + contatos.length;
      
      if (novoTotal > LIMITE_POR_DISPARO) {
        const espacoDisponivel = Math.max(0, LIMITE_POR_DISPARO - totalAtual);
        console.log(`[disparos-webhook] Limite excedido: tentando adicionar ${contatos.length}, total ficaria ${novoTotal} (limite: ${LIMITE_POR_DISPARO})`);
        return new Response(
          JSON.stringify({ 
            error: `Limite de ${LIMITE_POR_DISPARO} leads por campanha excedido`, 
            details: `A campanha já tem ${totalAtual} leads. Espaço disponível: ${espacoDisponivel} leads.`,
            total_atual: totalAtual,
            espaco_disponivel: espacoDisponivel,
            limite: LIMITE_POR_DISPARO
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1. Verificar blacklist
      const phonesE164 = contatos.map(c => formatPhoneE164(c.telefone));
      const { data: blacklistMatches } = await supabase
        .from('blacklist')
        .select('phone_e164')
        .in('phone_e164', phonesE164);
      
      const blacklistedSet = new Set((blacklistMatches || []).map(b => b.phone_e164));
      const contatosBloqueados: string[] = [];
      const contatosValidos: typeof contatos = [];

      for (const c of contatos) {
        const phoneE164 = formatPhoneE164(c.telefone);
        if (blacklistedSet.has(phoneE164)) {
          contatosBloqueados.push(c.nome);
          console.log(`[disparos-webhook] BLACKLIST: ${c.nome} (${phoneE164}) bloqueado`);
        } else {
          contatosValidos.push(c);
        }
      }

      if (contatosBloqueados.length > 0) {
        console.log(`[disparos-webhook] ${contatosBloqueados.length} contatos bloqueados por blacklist`);
      }

      if (contatosValidos.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            contatos_adicionados: 0,
            contatos_bloqueados: contatosBloqueados.length,
            nomes_bloqueados: contatosBloqueados,
            message: 'Todos os contatos estão na blacklist'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. Vincular lead_id e processar status do lead
      const contatosFormatados = [];
      for (const c of contatosValidos) {
        const phoneE164 = formatPhoneE164(c.telefone);
        let leadId = c.lead_id || null;

        // Se não veio lead_id, tentar encontrar por telefone
        if (!leadId) {
          const { data: foundLeadId } = await supabase.rpc('find_lead_by_phone', { p_phone: phoneE164 });
          if (foundLeadId) {
            leadId = foundLeadId;
            console.log(`[disparos-webhook] Lead encontrado por telefone: ${leadId} (${phoneE164})`);
          }
        }

        // Se encontrou lead, atualizar ultimo_disparo_em e verificar status
        if (leadId) {
          try {
            const { data: leadData } = await supabase
              .from('leads')
              .select('status')
              .eq('id', leadId)
              .single();

            // Atualizar ultimo_disparo_em sempre
            await supabase
              .from('leads')
              .update({ ultimo_disparo_em: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('id', leadId);

            // Só mover para Acompanhamento se status atual é "Novo"
            if (leadData?.status === 'Novo') {
              await supabase
                .from('leads')
                .update({ status: 'Acompanhamento', updated_at: new Date().toISOString() })
                .eq('id', leadId);
              console.log(`[disparos-webhook] Lead ${leadId} movido para Acompanhamento`);
            }

            // Registrar no histórico do lead
            await supabase
              .from('lead_historico')
              .insert({
                lead_id: leadId,
                tipo_evento: 'disparo',
                descricao: `Adicionado à campanha de disparo "${campanha.nome || 'Sem nome'}"`,
                dados_novos: { campanha_id, campanha_nome: campanha.nome, telefone: phoneE164 }
              });
          } catch (leadErr) {
            console.warn('[disparos-webhook] Erro ao processar lead (não-crítico):', leadErr);
          }
        }

        contatosFormatados.push({
          campanha_id,
          lead_id: leadId,
          nome: c.nome,
          telefone_original: c.telefone,
          telefone_e164: phoneE164,
          status: '1-ENVIAR'
        });
      }

      const { error: insertError } = await supabase
        .from('disparos_contatos')
        .insert(contatosFormatados);

      if (insertError) {
        console.error('[disparos-webhook] Erro ao inserir contatos:', insertError);
        return new Response(
          JSON.stringify({ error: 'Erro ao inserir contatos', details: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Atualizar total de contatos na campanha
      await supabase
        .from('disparos_campanhas')
        .update({ 
          total_contatos: novoTotal,
          updated_at: new Date().toISOString()
        })
        .eq('id', campanha_id);

      console.log('[disparos-webhook] Contatos adicionados:', contatos.length, '| Total na campanha:', novoTotal);

      return new Response(
        JSON.stringify({ 
          success: true, 
          contatos_adicionados: contatos.length,
          total_campanha: novoTotal,
          espaco_restante: LIMITE_POR_DISPARO - novoTotal
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ação: Iniciar disparo - marca contatos e envia para n8n (com lotes de 120)
    if (acao === 'iniciar' || acao === 'retomar') {
      // VERIFICAÇÃO CRÍTICA: Bloquear envio se já há contatos sendo processados (3-TRATANDO)
      const { count: contatosTratando } = await supabase
        .from('disparos_contatos')
        .select('*', { count: 'exact', head: true })
        .eq('campanha_id', campanha_id)
        .eq('status', '3-TRATANDO');

      if ((contatosTratando || 0) > 0) {
        console.log(`[disparos-webhook] BLOQUEADO: ${contatosTratando} contatos ainda em 3-TRATANDO para campanha ${campanha_id}`);
        return new Response(
          JSON.stringify({ 
            error: `Ainda existem ${contatosTratando} contatos sendo processados (3-TRATANDO). Aguarde o processamento terminar antes de enviar novamente.`,
            contatos_tratando: contatosTratando
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar URL do webhook n8n configurado
      const { data: webhookConfig } = await supabase
        .from('config_lista_items')
        .select('valor')
        .eq('campo_nome', 'n8n_disparos_webhook_url')
        .single();

      const n8nWebhookUrl = webhookConfig?.valor;

      if (!n8nWebhookUrl) {
        return new Response(
          JSON.stringify({ error: 'Webhook n8n não configurado. Configure em Disparos > Config > Webhook Disparos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Atualizar status da campanha
      await supabase
        .from('disparos_campanhas')
        .update({ status: 'em_andamento', updated_at: new Date().toISOString() })
        .eq('id', campanha_id);

      // Contar quantos já foram enviados HOJE para respeitar limite de 600
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const hojeISO = hoje.toISOString();

      const { count: enviadosHoje } = await supabase
        .from('disparos_contatos')
        .select('*', { count: 'exact', head: true })
        .eq('campanha_id', campanha_id)
        .gte('updated_at', hojeISO)
        .in('status', ['3-TRATANDO', '4-ENVIADO']);

      const jaEnviadosHoje = enviadosHoje || 0;
      const podeEnviarHoje = Math.max(0, LIMITE_POR_DIA - jaEnviadosHoje);

      console.log(`[disparos-webhook] Já enviados hoje: ${jaEnviadosHoje}, pode enviar hoje: ${podeEnviarHoje}`);

      if (podeEnviarHoje <= 0) {
        // Atingiu limite diário, agendar para amanhã às 8h
        const amanha8h = getProximaData8hSaoPaulo();
        
        await supabase
          .from('disparos_campanhas')
          .update({ 
            status: 'agendado',
            proximo_envio: amanha8h.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', campanha_id);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Limite diário de ${LIMITE_POR_DIA} atingido. Próximo envio agendado para ${amanha8h.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            proximo_envio: amanha8h.toISOString(),
            contatos_enviados: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar contatos pendentes ou para reenviar (limitado ao que pode enviar hoje)
      const { data: contatosPendentes, error: fetchError } = await supabase
        .from('disparos_contatos')
        .select('*')
        .eq('campanha_id', campanha_id)
        .in('status', ['1-ENVIAR', '2-REENVIAR'])
        .order('created_at', { ascending: true })
        .limit(podeEnviarHoje);

      if (fetchError) {
        console.error('[disparos-webhook] Erro ao buscar contatos:', fetchError);
        return new Response(
          JSON.stringify({ error: 'Erro ao buscar contatos' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!contatosPendentes || contatosPendentes.length === 0) {
        // Verificar se há contatos em qualquer status não-final
        const { count: contatosBloqueantes } = await supabase
          .from('disparos_contatos')
          .select('*', { count: 'exact', head: true })
          .eq('campanha_id', campanha_id)
          .in('status', ['1-ENVIAR', '2-REENVIAR', '3-TRATANDO']);

        const totalBloqueantes = contatosBloqueantes || 0;

        if (totalBloqueantes === 0) {
          // Todos os contatos em status final — campanha concluída
          await supabase
            .from('disparos_campanhas')
            .update({ status: 'concluido', proximo_envio: null, updated_at: new Date().toISOString() })
            .eq('id', campanha_id);

          return new Response(
            JSON.stringify({ success: true, message: 'Campanha concluída - sem contatos pendentes', contatos: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Ainda há contatos pendentes mas limite diário atingido — agendar
        if (podeEnviarHoje <= 0) {
          const amanha8h = getProximaData8hSaoPaulo();
          await supabase
            .from('disparos_campanhas')
            .update({
              status: 'agendado',
              proximo_envio: amanha8h.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', campanha_id);

          return new Response(
            JSON.stringify({
              success: true,
              message: `Limite diário atingido. ${totalBloqueantes} contatos restantes agendados para amanhã.`,
              proximo_envio: amanha8h.toISOString(),
              contatos: []
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: `Aguardando ${totalBloqueantes} contatos pendentes`, contatos: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verificar se há mais contatos para agendar
      const { count: restantes } = await supabase
        .from('disparos_contatos')
        .select('*', { count: 'exact', head: true })
        .eq('campanha_id', campanha_id)
        .in('status', ['1-ENVIAR', '2-REENVIAR']);

      const totalRestantes = (restantes || 0) - contatosPendentes.length;
      
      // Se ainda há contatos restantes após este lote, agendar próximo envio
      if (totalRestantes > 0) {
        const amanha8h = getProximaData8hSaoPaulo();
        await supabase
          .from('disparos_campanhas')
          .update({ 
            proximo_envio: amanha8h.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', campanha_id);
        
        console.log(`[disparos-webhook] ${totalRestantes} contatos restantes agendados para ${amanha8h.toISOString()}`);
      }

      // Marcar contatos como "3-TRATANDO" (em processamento pelo n8n)
      const ids = contatosPendentes.map(c => c.id);
      await supabase
        .from('disparos_contatos')
        .update({ status: '3-TRATANDO', updated_at: new Date().toISOString() })
        .in('id', ids);

      // Preparar payload para n8n
      const contatosParaN8N = contatosPendentes.map((c, index) => ({
        numero: index + 1,
        id: c.id,
        campanha_id: c.campanha_id,
        NOME: c.nome,
        TELEFONE: c.telefone_e164,
        TELEFONE_ORIGINAL: c.telefone_original,
        ID_PROPOSTA: campanha.proposta_id,
        TEXTO_IA: campanha.texto_ia,
        RESPONSAVEL: campanha.responsavel_nome,
        tentativas: c.tentativas
      }));

      const payloadN8N = {
        campanha_id,
        instancia: campanha.instancia,
        contatos: contatosParaN8N,
        total_pendentes: contatosPendentes.length,
        lote_info: {
          enviados_agora: contatosPendentes.length,
          enviados_hoje: jaEnviadosHoje + contatosPendentes.length,
          limite_diario: LIMITE_POR_DIA,
          limite_disparo: LIMITE_POR_DISPARO,
          restantes: totalRestantes
        }
      };

      console.log('[disparos-webhook] Enviando para n8n:', n8nWebhookUrl, 'com', contatosParaN8N.length, 'contatos');

      // Enviar para o webhook n8n
      let n8nResponseData: { success?: string | boolean } | null = null;
      
      try {
        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadN8N)
        });

        console.log('[disparos-webhook] Resposta n8n status:', n8nResponse.status);

        if (!n8nResponse.ok) {
          const errorText = await n8nResponse.text();
          console.error('[disparos-webhook] Erro n8n:', errorText);
          
          // Reverter status dos contatos
          await supabase
            .from('disparos_contatos')
            .update({ status: '1-ENVIAR', updated_at: new Date().toISOString() })
            .in('id', ids);

          return new Response(
            JSON.stringify({ error: 'Erro ao enviar para n8n', details: errorText }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Tentar parsear resposta do n8n (ele retorna {success: "true"} quando fluxo termina)
        try {
          n8nResponseData = await n8nResponse.json();
          console.log('[disparos-webhook] Resposta n8n body:', n8nResponseData);
        } catch {
          // Se não for JSON, apenas ignora
          console.log('[disparos-webhook] Resposta n8n não é JSON');
        }
      } catch (n8nError) {
        console.error('[disparos-webhook] Erro ao chamar n8n:', n8nError);
        
        // Reverter status dos contatos
        await supabase
          .from('disparos_contatos')
          .update({ status: '1-ENVIAR', updated_at: new Date().toISOString() })
          .in('id', ids);

        return new Response(
          JSON.stringify({ error: 'Erro de conexão com n8n', details: String(n8nError) }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Se n8n retornou success true, significa que o lote foi processado
      const fluxoFinalizado = n8nResponseData?.success === true || n8nResponseData?.success === 'true';
      
      if (fluxoFinalizado) {
        console.log('[disparos-webhook] Fluxo n8n finalizou com sucesso para lote');
        
        // Buscar dados da campanha para notificação
        const { data: campanhaData } = await supabase
          .from('disparos_campanhas')
          .select('nome, responsavel_id, responsavel_nome, instancia, proposta_id, texto_ia')
          .eq('id', campanha_id)
          .single();

        // Contar status dos contatos
        const { data: statusCounts } = await supabase
          .from('disparos_contatos')
          .select('status')
          .eq('campanha_id', campanha_id);

        const contagens = {
          enviados: 0,
          nozap: 0,
          reenviar: 0,
          bloqueadora: 0,
          pendentes: 0,
          tratando: 0
        };

        statusCounts?.forEach((c: { status: string }) => {
          if (c.status === '4-ENVIADO') contagens.enviados++;
          else if (c.status === '5-NOZAP') contagens.nozap++;
          else if (c.status === '2-REENVIAR') contagens.reenviar++;
          else if (c.status === '6-BLOQUEADORA') contagens.bloqueadora++;
          else if (c.status === '1-ENVIAR') contagens.pendentes++;
          else if (c.status === '3-TRATANDO') contagens.tratando++;
        });

        const temReenviar = contagens.reenviar > 0;
        const temPendentes = contagens.pendentes > 0;
        const temTratando = contagens.tratando > 0;

        // LÓGICA DE REENVIO AUTOMÁTICO: Se há contatos para reenviar e nenhum em tratamento,
        // automaticamente dispara esses contatos novamente (respeitando limite diário)
        if (temReenviar && !temTratando) {
          // Verificar limite diário antes do reenvio
          const hojeReenvio = new Date();
          hojeReenvio.setHours(0, 0, 0, 0);
          const { count: enviadosHojeReenvio } = await supabase
            .from('disparos_contatos')
            .select('*', { count: 'exact', head: true })
            .eq('campanha_id', campanha_id)
            .gte('updated_at', hojeReenvio.toISOString())
            .in('status', ['3-TRATANDO', '4-ENVIADO']);

          const podeReenviarHoje = Math.max(0, LIMITE_POR_DIA - (enviadosHojeReenvio || 0));

          if (podeReenviarHoje <= 0) {
            console.log('[disparos-webhook] Reenvio automático bloqueado: limite diário atingido');
            const amanha8hReenvio = getProximaData8hSaoPaulo();
            await supabase
              .from('disparos_campanhas')
              .update({
                status: 'agendado',
                proximo_envio: amanha8hReenvio.toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', campanha_id);
          } else {
          console.log('[disparos-webhook] Reenvio automático: encontrados', contagens.reenviar, 'contatos para reenviar, pode enviar:', podeReenviarHoje);

          // Buscar contatos com status 2-REENVIAR (limitado ao que pode enviar hoje)
          const { data: contatosReenviar } = await supabase
            .from('disparos_contatos')
            .select('*')
            .eq('campanha_id', campanha_id)
            .eq('status', '2-REENVIAR')
            .order('created_at', { ascending: true })
            .limit(podeReenviarHoje);

          if (contatosReenviar && contatosReenviar.length > 0) {
            // Marcar como 3-TRATANDO
            const idsReenviar = contatosReenviar.map(c => c.id);
            await supabase
              .from('disparos_contatos')
              .update({ status: '3-TRATANDO', updated_at: new Date().toISOString() })
              .in('id', idsReenviar);

            // Preparar payload para n8n
            const contatosReenviarN8N = contatosReenviar.map((c, index) => ({
              numero: index + 1,
              id: c.id,
              campanha_id: c.campanha_id,
              NOME: c.nome,
              TELEFONE: c.telefone_e164,
              TELEFONE_ORIGINAL: c.telefone_original,
              ID_PROPOSTA: campanhaData?.proposta_id,
              TEXTO_IA: campanhaData?.texto_ia,
              RESPONSAVEL: campanhaData?.responsavel_nome,
              tentativas: c.tentativas
            }));

            const payloadReenvioN8N = {
              campanha_id,
              instancia: campanhaData?.instancia,
              contatos: contatosReenviarN8N,
              total_pendentes: contatosReenviarN8N.length,
              is_reenvio: true
            };

            console.log('[disparos-webhook] Enviando reenvio automático para n8n:', contatosReenviarN8N.length, 'contatos');

            // Enviar para o webhook n8n (mesmo webhook)
            try {
              const reenvioResponse = await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadReenvioN8N)
              });

              if (!reenvioResponse.ok) {
                console.error('[disparos-webhook] Erro no reenvio automático:', await reenvioResponse.text());
                // Reverter para 2-REENVIAR em caso de erro
                await supabase
                  .from('disparos_contatos')
                  .update({ status: '2-REENVIAR', updated_at: new Date().toISOString() })
                  .in('id', idsReenviar);
              } else {
                console.log('[disparos-webhook] Reenvio automático disparado com sucesso');
                
                // Notificar sobre o reenvio
                if (campanhaData?.responsavel_id) {
                  await supabase
                    .from('system_notifications')
                    .insert({
                      user_id: campanhaData.responsavel_id,
                      tipo: 'disparo',
                      titulo: `🔄 Reenvio automático iniciado`,
                      mensagem: `${contatosReenviarN8N.length} contatos sendo reenviados automaticamente para "${campanhaData.nome || 'Disparo'}"`,
                      link: '/disparos/zap',
                      referencia_id: campanha_id
                    });
                }
              }
            } catch (reenvioError) {
              console.error('[disparos-webhook] Erro de conexão no reenvio:', reenvioError);
              // Reverter para 2-REENVIAR em caso de erro
              await supabase
                .from('disparos_contatos')
                .update({ status: '2-REENVIAR', updated_at: new Date().toISOString() })
                .in('id', idsReenviar);
            }
          }
          } // fecha else do podeReenviarHoje
        } else if (!temReenviar && !temPendentes && !temTratando) {
          // Campanha realmente concluída - todos os contatos têm status final
          await supabase
            .from('disparos_campanhas')
            .update({ 
              status: 'concluido', 
              proximo_envio: null,
              updated_at: new Date().toISOString() 
            })
            .eq('id', campanha_id);

          console.log('[disparos-webhook] Campanha marcada como concluída');

          // Notificar conclusão
          if (campanhaData?.responsavel_id) {
            await supabase
              .from('system_notifications')
              .insert({
                user_id: campanhaData.responsavel_id,
                tipo: 'disparo',
                titulo: `✅ Disparo "${campanhaData.nome || 'Disparo'}" finalizado`,
                mensagem: `Enviados: ${contagens.enviados} | Sem WhatsApp: ${contagens.nozap} | Bloqueadora: ${contagens.bloqueadora}`,
                link: '/disparos/zap',
                referencia_id: campanha_id
              });
          }
        } else if (temPendentes && !temTratando) {
          // Ainda há contatos pendentes (1-ENVIAR), notificar
          if (campanhaData?.responsavel_id) {
            await supabase
              .from('system_notifications')
              .insert({
                user_id: campanhaData.responsavel_id,
                tipo: 'disparo',
                titulo: `📤 Lote do disparo "${campanhaData.nome || 'Disparo'}" processado`,
                mensagem: `Enviados: ${contagens.enviados} | Pendentes: ${contagens.pendentes} | Reenviar: ${contagens.reenviar}`,
                link: '/disparos/zap',
                referencia_id: campanha_id
              });
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `${contatosParaN8N.length} contatos enviados para n8n (limite diário: ${LIMITE_POR_DIA})`,
          contatos_enviados: contatosParaN8N.length,
          restantes: totalRestantes,
          proximo_envio: totalRestantes > 0 ? getProximaData8hSaoPaulo().toISOString() : null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ação: Pausar campanha
    if (acao === 'pausar') {
      // Verificar quantos contatos estão em tratamento no n8n
      const { count: tratandoCount } = await supabase
        .from('disparos_contatos')
        .select('*', { count: 'exact', head: true })
        .eq('campanha_id', campanha_id)
        .eq('status', '3-TRATANDO');

      await supabase
        .from('disparos_campanhas')
        .update({ status: 'pausado', proximo_envio: null, updated_at: new Date().toISOString() })
        .eq('id', campanha_id);

      // NÃO reverter contatos em 3-TRATANDO para 1-ENVIAR!
      // Eles estão sendo processados pelo n8n e serão atualizados via callback.
      // Reverter causaria duplicidade quando o disparo fosse retomado.

      const mensagem = (tratandoCount || 0) > 0
        ? `Campanha pausada. ${tratandoCount} contatos ainda em processamento no n8n (serão atualizados automaticamente via callback).`
        : 'Campanha pausada.';

      console.log(`[disparos-webhook] Campanha ${campanha_id} pausada. Contatos em TRATANDO: ${tratandoCount || 0} (mantidos)`);

      return new Response(
        JSON.stringify({ success: true, message: mensagem, contatos_tratando: tratandoCount || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ação: Buscar pendentes (para n8n chamar periodicamente)
    if (acao === 'buscar_pendentes') {
      const { data: contatosPendentes } = await supabase
        .from('disparos_contatos')
        .select('*')
        .eq('campanha_id', campanha_id)
        .in('status', ['1-ENVIAR', '2-REENVIAR'])
        .order('created_at', { ascending: true })
        .limit(limite);

      return new Response(
        JSON.stringify({ 
          success: true, 
          contatos: contatosPendentes || [],
          campanha_status: campanha.status
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação inválida. Use: iniciar, pausar, retomar, buscar_pendentes' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[disparos-webhook] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
