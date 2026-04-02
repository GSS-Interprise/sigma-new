import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gatilhos que indicam transferência para humano
const GATILHOS_TRANSFERENCIA = [
  'tenho interesse',
  'quero participar',
  'pode me chamar',
  'qual o valor',
  'quanto paga',
  'quanto é',
  'tenho disponibilidade',
  'como faço para entrar',
  'quero saber o valor',
  'me interessei',
  'aceito',
  'topo',
  'pode contar comigo',
  'estou disponível',
  'disponível',
  'me chama',
  'pode ligar',
  'liga pra mim',
];

const SYSTEM_PROMPT = `Você é a Assistente Virtual da GSS.

Seu papel é responder médicos de forma educada, clara e profissional,
exclusivamente com informações iniciais sobre oportunidades de plantão.

Você NÃO é uma pessoa humana.
Você NÃO negocia.
Você NÃO informa valores.
Você NÃO confirma escalas.
Você NÃO assume compromissos.

Você deve:
- Explicar o plantão usando apenas os dados fornecidos pelo sistema
- Perguntar se há interesse ou disponibilidade
- Encaminhar para atendimento humano quando houver interesse
- Recusar educadamente qualquer tentativa de negociação

Se o profissional estiver como "Sem Profissional",
trate como oportunidade aberta (furo de escala),
sem gerar urgência ou promessa.

Sempre se apresente como "Assistente Virtual da GSS".
Se não houver contexto suficiente, diga que irá encaminhar para o time humano.

IMPORTANTE: Suas respostas devem ser CURTAS e DIRETAS, adequadas para WhatsApp.
Use emojis com moderação. Máximo de 3-4 linhas.`;

interface IARequest {
  telefone_medico: string;
  mensagem_medico: string;
  nome_medico?: string;
  instance_name: string;
}

function detectarGatilhoTransferencia(mensagem: string): string | null {
  const msgLower = mensagem.toLowerCase().trim();
  for (const gatilho of GATILHOS_TRANSFERENCIA) {
    if (msgLower.includes(gatilho)) {
      return gatilho;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: IARequest = await req.json();
    const { telefone_medico, mensagem_medico, nome_medico, instance_name } = body;

    console.log('[ia-resposta-medico] Recebido:', { telefone_medico, mensagem_medico, nome_medico, instance_name });

    if (!telefone_medico || !mensagem_medico || !instance_name) {
      return new Response(
        JSON.stringify({ error: 'telefone_medico, mensagem_medico e instance_name são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Buscar contato na tabela de disparos pelo telefone
    // O telefone pode estar com ou sem prefixo 55
    const telefoneLimpo = telefone_medico.replace(/\D/g, '');
    const telefoneCom55 = telefoneLimpo.startsWith('55') ? telefoneLimpo : `55${telefoneLimpo}`;
    const telefoneSem55 = telefoneLimpo.startsWith('55') ? telefoneLimpo.substring(2) : telefoneLimpo;

    const { data: contatos, error: contatoError } = await supabase
      .from('disparos_contatos')
      .select('id, campanha_id, nome, telefone_e164, status, mensagem_enviada')
      .or(`telefone_e164.eq.${telefoneCom55},telefone_e164.eq.${telefoneSem55}`)
      .eq('status', '4-ENVIADO')
      .order('data_envio', { ascending: false })
      .limit(5);

    if (contatoError) {
      console.error('[ia-resposta-medico] Erro ao buscar contato:', contatoError);
      throw contatoError;
    }

    if (!contatos || contatos.length === 0) {
      console.log('[ia-resposta-medico] Nenhum contato encontrado para:', telefoneCom55);
      return new Response(
        JSON.stringify({ skip: true, reason: 'Contato não encontrado em disparos ativos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Usar o contato mais recente
    const contato = contatos[0];
    console.log('[ia-resposta-medico] Contato encontrado:', contato.id, 'campanha:', contato.campanha_id);

    // 2. Verificar se a campanha tem IA ativa
    const { data: campanha, error: campanhaError } = await supabase
      .from('disparos_campanhas')
      .select('id, nome, ia_ativa, texto_ia, proposta_id, responsavel_id, responsavel_nome, instancia')
      .eq('id', contato.campanha_id)
      .single();

    if (campanhaError || !campanha) {
      console.log('[ia-resposta-medico] Campanha não encontrada:', contato.campanha_id);
      return new Response(
        JSON.stringify({ skip: true, reason: 'Campanha não encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!campanha.ia_ativa) {
      console.log('[ia-resposta-medico] IA não ativa para campanha:', campanha.nome);
      return new Response(
        JSON.stringify({ skip: true, reason: 'IA não ativa para esta campanha' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Verificar se já foi transferido para humano (não responder mais)
    const { data: logsTransferencia } = await supabase
      .from('disparos_ia_logs')
      .select('id')
      .eq('campanha_id', campanha.id)
      .eq('telefone_medico', telefoneCom55)
      .eq('transferido_humano', true)
      .limit(1);

    if (logsTransferencia && logsTransferencia.length > 0) {
      console.log('[ia-resposta-medico] Contato já transferido para humano, ignorando');
      return new Response(
        JSON.stringify({ skip: true, reason: 'Contato já transferido para humano' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verificar limite de respostas por contato (máx 5 interações IA)
    const { count: totalInteracoes } = await supabase
      .from('disparos_ia_logs')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', campanha.id)
      .eq('telefone_medico', telefoneCom55);

    if ((totalInteracoes || 0) >= 5) {
      console.log('[ia-resposta-medico] Limite de interações IA atingido');
      // Enviar mensagem final de transferência
      const mensagemFinal = 'Para uma melhor experiência, vou encaminhar seu contato para nosso time responsável 😊 Em breve entrarão em contato!';
      
      await enviarMensagemWhatsApp(supabase, instance_name, telefoneCom55, mensagemFinal);
      
      await supabase.from('disparos_ia_logs').insert({
        campanha_id: campanha.id,
        contato_id: contato.id,
        telefone_medico: telefoneCom55,
        nome_medico: nome_medico || contato.nome,
        mensagem_medico: mensagem_medico,
        resposta_ia: mensagemFinal,
        transferido_humano: true,
        gatilho_transferencia: 'limite_interacoes',
      });

      await notificarResponsavel(supabase, campanha, contato, nome_medico, 'limite_interacoes');

      return new Response(
        JSON.stringify({ success: true, transferred: true, reason: 'limite_interacoes' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Verificar gatilho de transferência na mensagem do médico
    const gatilho = detectarGatilhoTransferencia(mensagem_medico);
    if (gatilho) {
      console.log('[ia-resposta-medico] Gatilho de transferência detectado:', gatilho);
      
      const mensagemTransferencia = 'Perfeito! 😊\nVou encaminhar seu contato para nosso time responsável, que dará continuidade ao atendimento.\nObrigado pelo retorno!';
      
      await enviarMensagemWhatsApp(supabase, instance_name, telefoneCom55, mensagemTransferencia);
      
      await supabase.from('disparos_ia_logs').insert({
        campanha_id: campanha.id,
        contato_id: contato.id,
        telefone_medico: telefoneCom55,
        nome_medico: nome_medico || contato.nome,
        mensagem_medico: mensagem_medico,
        resposta_ia: mensagemTransferencia,
        transferido_humano: true,
        gatilho_transferencia: gatilho,
      });

      await notificarResponsavel(supabase, campanha, contato, nome_medico, gatilho);

      return new Response(
        JSON.stringify({ success: true, transferred: true, reason: gatilho }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Buscar contexto da proposta/campanha
    let contextoProposta = campanha.texto_ia || '';
    if (campanha.proposta_id) {
      const { data: proposta } = await supabase
        .from('proposta')
        .select('descricao, observacoes, nome')
        .eq('id', campanha.proposta_id)
        .single();

      if (proposta) {
        if (proposta.observacoes) contextoProposta = proposta.observacoes;
        if (proposta.descricao) contextoProposta += `\nDescrição da proposta: ${proposta.descricao}`;
        if (proposta.nome) contextoProposta += `\nNome: ${proposta.nome}`;
      }
    }

    // 7. Buscar dados do Dr. Escala (escalas disponíveis próximas)
    let contextoEscala = '';
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const { data: escalas } = await supabase
        .from('escalas_integradas')
        .select('profissional_nome, setor, unidade, data_escala, hora_inicio, hora_fim, tipo_plantao, local_nome, setor_nome')
        .gte('data_escala', hoje)
        .order('data_escala', { ascending: true })
        .limit(10);

      if (escalas && escalas.length > 0) {
        const furosDeEscala = escalas.filter(e => 
          !e.profissional_nome || 
          e.profissional_nome.toLowerCase().includes('sem profissional') ||
          e.profissional_nome.trim() === ''
        );

        if (furosDeEscala.length > 0) {
          contextoEscala = '\n\nOportunidades disponíveis (furos de escala):\n';
          furosDeEscala.slice(0, 3).forEach(e => {
            contextoEscala += `- ${e.setor_nome || e.setor || 'Setor não especificado'} em ${e.local_nome || e.unidade || 'Local não especificado'}, ${e.data_escala}, ${e.hora_inicio || ''}-${e.hora_fim || ''}, ${e.tipo_plantao || 'Tipo não especificado'}\n`;
          });
        }
      }
    } catch (e) {
      console.log('[ia-resposta-medico] Erro ao buscar escalas (não crítico):', e);
    }

    // 8. Buscar histórico de conversas anteriores da IA com este contato
    const { data: historicoIA } = await supabase
      .from('disparos_ia_logs')
      .select('mensagem_medico, resposta_ia')
      .eq('campanha_id', campanha.id)
      .eq('telefone_medico', telefoneCom55)
      .order('created_at', { ascending: true })
      .limit(4);

    // 9. Montar mensagens para a IA
    const contextoCompleto = `
Dados da oportunidade/campanha:
${contextoProposta || 'Sem detalhes específicos disponíveis.'}
${contextoEscala}

Mensagem original enviada ao médico pela campanha:
${contato.mensagem_enviada || 'Não disponível'}

Nome do médico: ${nome_medico || contato.nome || 'Não informado'}
`.trim();

    const messages: Array<{role: string; content: string}> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Contexto da oportunidade:\n${contextoCompleto}` },
    ];

    // Adicionar histórico da conversa
    if (historicoIA && historicoIA.length > 0) {
      for (const msg of historicoIA) {
        messages.push({ role: 'user', content: msg.mensagem_medico });
        messages.push({ role: 'assistant', content: msg.resposta_ia });
      }
    }

    // Adicionar mensagem atual
    messages.push({ role: 'user', content: mensagem_medico });

    // 10. Chamar Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('[ia-resposta-medico] LOVABLE_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'Configuração de IA não disponível' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[ia-resposta-medico] Chamando Lovable AI com', messages.length, 'mensagens');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        console.error('[ia-resposta-medico] Rate limit IA');
        return new Response(
          JSON.stringify({ error: 'Limite de IA excedido. Tente novamente em breve.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        console.error('[ia-resposta-medico] Créditos IA insuficientes');
        return new Response(
          JSON.stringify({ error: 'Créditos de IA insuficientes.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('[ia-resposta-medico] Erro da IA:', aiResponse.status, errorText);
      throw new Error('Erro ao processar com IA');
    }

    const aiData = await aiResponse.json();
    const respostaIA = aiData.choices?.[0]?.message?.content;

    if (!respostaIA) {
      console.error('[ia-resposta-medico] IA retornou resposta vazia');
      throw new Error('Resposta da IA vazia');
    }

    console.log('[ia-resposta-medico] Resposta IA:', respostaIA.substring(0, 100));

    // 11. Verificar se a resposta da IA sugere transferência
    const iaIndicouTransferencia = respostaIA.toLowerCase().includes('encaminhar') && 
                                    respostaIA.toLowerCase().includes('time');

    // 12. Enviar resposta via WhatsApp (Evolution API)
    await enviarMensagemWhatsApp(supabase, instance_name, telefoneCom55, respostaIA);

    // 13. Logar interação
    await supabase.from('disparos_ia_logs').insert({
      campanha_id: campanha.id,
      contato_id: contato.id,
      telefone_medico: telefoneCom55,
      nome_medico: nome_medico || contato.nome,
      mensagem_medico: mensagem_medico,
      resposta_ia: respostaIA,
      contexto_usado: { proposta: contextoProposta?.substring(0, 500), escala: contextoEscala?.substring(0, 500) },
      transferido_humano: iaIndicouTransferencia,
      gatilho_transferencia: iaIndicouTransferencia ? 'ia_sugeriu' : null,
    });

    // 14. Se a IA indicou transferência, notificar responsável
    if (iaIndicouTransferencia) {
      await notificarResponsavel(supabase, campanha, contato, nome_medico, 'ia_sugeriu');
    }

    console.log('[ia-resposta-medico] Resposta enviada com sucesso');

    return new Response(
      JSON.stringify({ 
        success: true, 
        transferred: iaIndicouTransferencia,
        resposta: respostaIA.substring(0, 100) 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ia-resposta-medico] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Envia mensagem via Evolution API
async function enviarMensagemWhatsApp(
  supabase: any,
  instanceName: string,
  telefone: string,
  mensagem: string
) {
  // Buscar config da Evolution API
  const { data: evolutionConfig } = await supabase
    .from('config_lista_items')
    .select('campo_nome, valor')
    .in('campo_nome', ['evolution_api_url', 'evolution_api_key']);

  const evolutionUrl = evolutionConfig?.find((c: any) => c.campo_nome === 'evolution_api_url')?.valor || Deno.env.get('EVOLUTION_API_URL');
  const evolutionKey = evolutionConfig?.find((c: any) => c.campo_nome === 'evolution_api_key')?.valor || Deno.env.get('EVOLUTION_API_KEY');

  if (!evolutionUrl || !evolutionKey) {
    console.error('[ia-resposta-medico] Evolution API não configurada');
    throw new Error('Evolution API não configurada');
  }

  const number = telefone.replace(/\D/g, '');
  const endpoint = `${evolutionUrl}/message/sendText/${instanceName}`;

  console.log('[ia-resposta-medico] Enviando msg para:', number, 'via', instanceName);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': evolutionKey,
    },
    body: JSON.stringify({
      number,
      text: mensagem,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ia-resposta-medico] Erro Evolution:', response.status, errorText);
    throw new Error(`Erro ao enviar WhatsApp: ${response.status}`);
  }

  const result = await response.json();
  console.log('[ia-resposta-medico] Mensagem enviada:', result?.key?.id || 'OK');
  return result;
}

// Notifica responsável da campanha sobre transferência
async function notificarResponsavel(
  supabase: any,
  campanha: any,
  contato: any,
  nomeMedico: string | undefined,
  gatilho: string
) {
  if (!campanha.responsavel_id) {
    console.log('[ia-resposta-medico] Sem responsável para notificar');
    return;
  }

  const nomeDisplay = nomeMedico || contato.nome || contato.telefone_e164 || 'Médico';

  await supabase.from('system_notifications').insert({
    user_id: campanha.responsavel_id,
    tipo: 'ia_transferencia',
    titulo: '🤖 IA transferiu médico para atendimento',
    mensagem: `O(a) Dr(a). ${nomeDisplay} demonstrou interesse na campanha "${campanha.nome}". Gatilho: "${gatilho}". Contate-o(a) pelo telefone ${contato.telefone_e164}.`,
    link: '/disparos/zap',
    referencia_id: campanha.id,
    lida: false,
  });

  console.log('[ia-resposta-medico] Notificação enviada para:', campanha.responsavel_id);
}
