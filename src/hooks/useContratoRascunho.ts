import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { registrarAuditoria } from "@/lib/auditLogger";

// Helper: copia anexos da licitação (tabela licitacoes_anexos + buckets licitacoes-anexos e editais-pdfs)
// para contrato_rascunho_anexos, sem duplicar.
export async function copiarAnexosLicitacaoParaRascunho(
  licitacaoId: string,
  rascunhoId: string,
  userId?: string | null
) {
  const novos: Array<{
    contrato_rascunho_id: string;
    arquivo_url: string;
    arquivo_nome: string;
    arquivo_path: string;
    mime_type: string | null;
    origem: string;
    uploaded_by: string | null;
  }> = [];
  const seenPaths = new Set<string>();
  const seenNomes = new Set<string>();

  // Anexos já existentes no rascunho (para deduplicar)
  const { data: existentes } = await supabase
    .from('contrato_rascunho_anexos')
    .select('arquivo_path, arquivo_url, arquivo_nome')
    .eq('contrato_rascunho_id', rascunhoId);
  (existentes || []).forEach((a: any) => {
    if (a.arquivo_path) seenPaths.add(a.arquivo_path);
    if (a.arquivo_url) seenPaths.add(a.arquivo_url);
    if (a.arquivo_nome) seenNomes.add(a.arquivo_nome);
  });

  const push = (item: typeof novos[number]) => {
    if (seenPaths.has(item.arquivo_path) || seenPaths.has(item.arquivo_url) || seenNomes.has(item.arquivo_nome)) return;
    seenPaths.add(item.arquivo_path);
    seenPaths.add(item.arquivo_url);
    seenNomes.add(item.arquivo_nome);
    novos.push(item);
  };

  // 1) Tabela licitacoes_anexos (uploads manuais antigos)
  const { data: anexosTabela } = await supabase
    .from('licitacoes_anexos')
    .select('arquivo_nome, arquivo_url')
    .eq('licitacao_id', licitacaoId);
  (anexosTabela || []).forEach((a: any) => {
    push({
      contrato_rascunho_id: rascunhoId,
      arquivo_url: a.arquivo_url,
      arquivo_nome: a.arquivo_nome,
      arquivo_path: `licitacoes-anexos/${a.arquivo_url}`,
      mime_type: null,
      origem: 'licitacao_card',
      uploaded_by: userId ?? null,
    });
  });

  // 2) Bucket licitacoes-anexos
  const { data: filesLic } = await supabase.storage
    .from('licitacoes-anexos')
    .list(licitacaoId);
  (filesLic || []).forEach((arquivo: any) => {
    push({
      contrato_rascunho_id: rascunhoId,
      arquivo_url: `${licitacaoId}/${arquivo.name}`,
      arquivo_nome: arquivo.name,
      arquivo_path: `licitacoes-anexos/${licitacaoId}/${arquivo.name}`,
      mime_type: arquivo.metadata?.mimetype || null,
      origem: 'licitacao_card',
      uploaded_by: userId ?? null,
    });
  });

  // 3) Bucket editais-pdfs (anexos automáticos do edital)
  const { data: filesEdital } = await supabase.storage
    .from('editais-pdfs')
    .list(licitacaoId);
  (filesEdital || []).forEach((arquivo: any) => {
    push({
      contrato_rascunho_id: rascunhoId,
      arquivo_url: `editais-pdfs/${licitacaoId}/${arquivo.name}`,
      arquivo_nome: arquivo.name,
      arquivo_path: `editais-pdfs/${licitacaoId}/${arquivo.name}`,
      mime_type: arquivo.metadata?.mimetype || null,
      origem: 'licitacao_edital',
      uploaded_by: userId ?? null,
    });
  });

  if (novos.length > 0) {
    await supabase.from('contrato_rascunho_anexos').insert(novos);
  }
}

// Helper: copia anexos da licitação para contrato_anexos do pré-contrato, sem duplicar.
export async function copiarAnexosLicitacaoParaContrato(
  licitacaoId: string,
  contratoId: string,
  userId?: string | null,
  usuarioNome = 'Sistema (arrematação automática)'
) {
  const novos: Array<{
    contrato_id: string;
    arquivo_url: string;
    arquivo_nome: string;
    usuario_id: string | null;
    usuario_nome: string;
  }> = [];
  const seenUrl = new Set<string>();
  const seenNome = new Set<string>();

  const { data: existentes } = await supabase
    .from('contrato_anexos')
    .select('arquivo_url, arquivo_nome')
    .eq('contrato_id', contratoId);
  (existentes || []).forEach((a: any) => {
    if (a.arquivo_url) seenUrl.add(a.arquivo_url);
    if (a.arquivo_nome) seenNome.add(a.arquivo_nome);
  });

  const push = (arquivo_url: string, arquivo_nome: string) => {
    if (seenUrl.has(arquivo_url) || seenNome.has(arquivo_nome)) return;
    seenUrl.add(arquivo_url);
    seenNome.add(arquivo_nome);
    novos.push({
      contrato_id: contratoId,
      arquivo_url,
      arquivo_nome,
      usuario_id: userId ?? null,
      usuario_nome: usuarioNome,
    });
  };

  const { data: anexosTabela } = await supabase
    .from('licitacoes_anexos')
    .select('arquivo_nome, arquivo_url')
    .eq('licitacao_id', licitacaoId);
  (anexosTabela || []).forEach((a: any) => push(`licitacoes-anexos/${a.arquivo_url}`, a.arquivo_nome));

  const { data: filesLic } = await supabase.storage.from('licitacoes-anexos').list(licitacaoId);
  (filesLic || []).forEach((arquivo: any) => push(`licitacoes-anexos/${licitacaoId}/${arquivo.name}`, arquivo.name));

  const { data: filesEdital } = await supabase.storage.from('editais-pdfs').list(licitacaoId);
  (filesEdital || []).forEach((arquivo: any) => push(`editais-pdfs/${licitacaoId}/${arquivo.name}`, arquivo.name));

  if (novos.length > 0) {
    await supabase.from('contrato_anexos').insert(novos);
  }
}

export interface ContratoRascunho {
  id: string;
  licitacao_id: string;
  contrato_id: string | null;
  status: 'rascunho' | 'consolidado' | 'cancelado';
  overlay_json: {
    titulo?: string;
    numero_edital?: string;
    orgao?: string;
    objeto?: string;
    valor_estimado?: number;
    municipio_uf?: string;
    modalidade?: string;
    data_disputa?: string;
    etiquetas?: string[];
    observacoes?: string;
  };
  created_at: string;
  updated_at: string;
  created_by: string | null;
  consolidado_em: string | null;
  consolidado_por: string | null;
}

export interface ContratoRascunhoAnexo {
  id: string;
  contrato_rascunho_id: string;
  arquivo_url: string;
  arquivo_nome: string;
  arquivo_path: string | null;
  mime_type: string | null;
  origem: string;
  created_at: string;
  uploaded_by: string | null;
}

export function useContratoRascunho(rascunhoId?: string) {
  const queryClient = useQueryClient();

  // Buscar rascunho específico
  const { data: rascunho, isLoading } = useQuery({
    queryKey: ['contrato-rascunho', rascunhoId],
    queryFn: async () => {
      if (!rascunhoId) return null;
      const { data, error } = await supabase
        .from('contrato_rascunho')
        .select('*')
        .eq('id', rascunhoId)
        .single();
      if (error) throw error;
      return data as ContratoRascunho;
    },
    enabled: !!rascunhoId,
  });

  // Buscar anexos do rascunho
  const { data: anexos } = useQuery({
    queryKey: ['contrato-rascunho-anexos', rascunhoId],
    queryFn: async () => {
      if (!rascunhoId) return [];
      const { data, error } = await supabase
        .from('contrato_rascunho_anexos')
        .select('*')
        .eq('contrato_rascunho_id', rascunhoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ContratoRascunhoAnexo[];
    },
    enabled: !!rascunhoId,
  });

  // Buscar licitação vinculada
  const { data: licitacao } = useQuery({
    queryKey: ['licitacao-rascunho', rascunho?.licitacao_id],
    queryFn: async () => {
      if (!rascunho?.licitacao_id) return null;
      const { data, error } = await supabase
        .from('licitacoes')
        .select('*')
        .eq('id', rascunho.licitacao_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!rascunho?.licitacao_id,
  });

  return { rascunho, anexos, licitacao, isLoading };
}

export function useContratoRascunhoByLicitacao(licitacaoId?: string) {
  const { data: rascunho, isLoading } = useQuery({
    queryKey: ['contrato-rascunho-by-licitacao', licitacaoId],
    queryFn: async () => {
      if (!licitacaoId) return null;
      const { data, error } = await supabase
        .from('contrato_rascunho')
        .select('*')
        .eq('licitacao_id', licitacaoId)
        .eq('status', 'rascunho')
        .maybeSingle();
      if (error) throw error;
      return data as ContratoRascunho | null;
    },
    enabled: !!licitacaoId,
  });

  return { rascunho, isLoading };
}

export function useContratosRascunho() {
  const queryClient = useQueryClient();

  // Listar todos os rascunhos ativos
  const { data: rascunhos, isLoading } = useQuery({
    queryKey: ['contratos-rascunho'],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contrato_rascunho')
        .select(`
          *,
          licitacoes (
            id,
            titulo,
            numero_edital,
            orgao,
            valor_estimado,
            municipio_uf
          )
        `)
        .eq('status', 'rascunho')
        .not('licitacao_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Buscar codigo_interno dos pré-contratos vinculados (sem FK no banco)
      const contratoIds = (data || []).map((r: any) => r.contrato_id).filter(Boolean);
      let codigoInternoMap: Record<string, number> = {};
      if (contratoIds.length > 0) {
        const { data: contratos } = await supabase
          .from('contratos')
          .select('id, codigo_interno')
          .in('id', contratoIds);
        (contratos || []).forEach((c: any) => {
          codigoInternoMap[c.id] = c.codigo_interno;
        });
      }

      return (data || []).map((r: any) => ({
        ...r,
        precontrato_codigo_interno: r.contrato_id ? codigoInternoMap[r.contrato_id] ?? null : null,
      }));
    },
  });

  // Criar rascunho a partir de licitação arrematada
  const criarRascunhoMutation = useMutation({
    mutationFn: async (licitacao: any) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      // Verificar se já existe rascunho para esta licitação
      const { data: existente } = await supabase
        .from('contrato_rascunho')
        .select('id')
        .eq('licitacao_id', licitacao.id)
        .eq('status', 'rascunho')
        .maybeSingle();

      if (existente) {
        return existente;
      }

      // Criar overlay_json com dados da licitação
      const overlayJson = {
        titulo: licitacao.titulo || null,
        numero_edital: licitacao.numero_edital || null,
        orgao: licitacao.orgao || null,
        objeto: licitacao.objeto || null,
        valor_estimado: licitacao.valor_estimado || null,
        municipio_uf: licitacao.municipio_uf || null,
        modalidade: licitacao.modalidade || null,
        data_disputa: licitacao.data_disputa || null,
        etiquetas: licitacao.etiquetas || [],
        observacoes: licitacao.observacoes || null,
      };

      // Capturar serviços da licitação
      const servicosJson = licitacao.servicos_contrato || [];

      // Criar o rascunho
      const { data: novoRascunho, error } = await supabase
        .from('contrato_rascunho')
        .insert({
          licitacao_id: licitacao.id,
          overlay_json: overlayJson,
          servicos_json: servicosJson,
          status: 'rascunho',
          status_kanban: 'prospectar',
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      // Copiar anexos da licitação (3 origens: tabela + 2 buckets) para o rascunho, sem duplicar
      await copiarAnexosLicitacaoParaRascunho(licitacao.id, novoRascunho.id, userId);

      // Log de auditoria
      await registrarAuditoria({
        modulo: 'Contratos',
        tabela: 'contrato_rascunho',
        acao: 'criar',
        registroId: novoRascunho.id,
        registroDescricao: `Rascunho criado a partir da licitação: ${licitacao.titulo || licitacao.numero_edital}`,
        dadosNovos: novoRascunho,
        detalhes: 'Licitação arrematada -> rascunho criado',
      });

      return novoRascunho;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contratos-rascunho'] });
      toast.success('Contrato rascunho criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar rascunho');
    },
  });

  // Consolidar rascunho em contrato real
  const consolidarMutation = useMutation({
    mutationFn: async ({ 
      rascunhoId, 
      contratoData 
    }: { 
      rascunhoId: string; 
      contratoData: any;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      // Buscar rascunho
      const { data: rascunho, error: rascunhoError } = await supabase
        .from('contrato_rascunho')
        .select('*')
        .eq('id', rascunhoId)
        .single();

      if (rascunhoError) throw rascunhoError;

      // Criar contrato real
      const { data: novoContrato, error: contratoError } = await supabase
        .from('contratos')
        .insert({
          ...contratoData,
          licitacao_origem_id: rascunho.licitacao_id,
        })
        .select()
        .single();

      if (contratoError) throw contratoError;

      // Copiar anexos do rascunho para contrato real
      const { data: anexosRascunho } = await supabase
        .from('contrato_rascunho_anexos')
        .select('*')
        .eq('contrato_rascunho_id', rascunhoId);

      if (anexosRascunho && anexosRascunho.length > 0) {
        const anexosParaContrato = anexosRascunho.map(anexo => ({
          contrato_id: novoContrato.id,
          arquivo_url: anexo.arquivo_url,
          arquivo_nome: anexo.arquivo_nome,
          usuario_id: userId,
          usuario_nome: 'Sistema (consolidação)',
        }));

        await supabase
          .from('contrato_anexos')
          .insert(anexosParaContrato);
      }

      // Atualizar rascunho como consolidado
      await supabase
        .from('contrato_rascunho')
        .update({
          status: 'consolidado',
          contrato_id: novoContrato.id,
          consolidado_em: new Date().toISOString(),
          consolidado_por: userId,
        })
        .eq('id', rascunhoId);

      // Remover pré-contrato órfão (se existir) e transferir codigo_interno
      if (rascunho.licitacao_id) {
        const { data: preContrato } = await supabase
          .from('contratos')
          .select('id, codigo_interno')
          .eq('licitacao_origem_id', rascunho.licitacao_id)
          .eq('status_contrato', 'Pre-Contrato')
          .is('cliente_id', null)
          .maybeSingle();
        if (preContrato && preContrato.id !== novoContrato.id) {
          if (preContrato.codigo_interno) {
            await supabase
              .from('contratos')
              .update({ codigo_interno: preContrato.codigo_interno })
              .eq('id', novoContrato.id);
          }
          await supabase.from('contratos').delete().eq('id', preContrato.id);
        }
      }

      // Log de auditoria
      await registrarAuditoria({
        modulo: 'Contratos',
        tabela: 'contratos',
        acao: 'criar',
        registroId: novoContrato.id,
        registroDescricao: `Contrato consolidado a partir do rascunho: ${rascunhoId}`,
        dadosNovos: novoContrato,
        detalhes: `Contrato rascunho consolidado -> contrato real ID ${novoContrato.codigo_interno || novoContrato.id} criado`,
      });

      return novoContrato;
    },
    onSuccess: (contrato) => {
      queryClient.invalidateQueries({ queryKey: ['contratos-rascunho'] });
      queryClient.invalidateQueries({ queryKey: ['contratos'] });
      queryClient.invalidateQueries({ queryKey: ['contratos-temporarios'] });
      toast.success(`Contrato consolidado com sucesso! ID: ${contrato.codigo_interno || contrato.id}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao consolidar contrato');
    },
  });

  // Cancelar rascunho
  const cancelarMutation = useMutation({
    mutationFn: async (rascunhoId: string) => {
      // Buscar rascunho para identificar pré-contrato órfão
      const { data: rascunho } = await supabase
        .from('contrato_rascunho')
        .select('contrato_id, licitacao_id')
        .eq('id', rascunhoId)
        .maybeSingle();

      const { error } = await supabase
        .from('contrato_rascunho')
        .update({ status: 'cancelado', contrato_id: null })
        .eq('id', rascunhoId);
      if (error) throw error;

      // Deletar pré-contrato automático (sem cliente) vinculado a essa licitação
      if (rascunho?.licitacao_id) {
        const { data: preContratos } = await supabase
          .from('contratos')
          .select('id, codigo_interno')
          .eq('licitacao_origem_id', rascunho.licitacao_id)
          .eq('status_contrato', 'Pre-Contrato')
          .is('cliente_id', null);

        if (preContratos && preContratos.length > 0) {
          const ids = preContratos.map(p => p.id);
          await supabase.from('contratos').delete().in('id', ids);

          await registrarAuditoria({
            modulo: 'Contratos',
            tabela: 'contratos',
            acao: 'excluir',
            registroId: ids[0],
            registroDescricao: `Pré-contrato(s) órfão(s) removido(s) ao cancelar rascunho ${rascunhoId}`,
            detalhes: `IDs removidos: ${ids.join(', ')}`,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contratos-rascunho'] });
      queryClient.invalidateQueries({ queryKey: ['contratos'] });
      queryClient.invalidateQueries({ queryKey: ['contratos-temporarios'] });
      toast.success('Rascunho cancelado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao cancelar rascunho');
    },
  });

  return {
    rascunhos,
    isLoading,
    criarRascunho: criarRascunhoMutation.mutate,
    criarRascunhoAsync: criarRascunhoMutation.mutateAsync,
    consolidar: consolidarMutation.mutate,
    consolidarAsync: consolidarMutation.mutateAsync,
    cancelar: cancelarMutation.mutate,
    isCreating: criarRascunhoMutation.isPending,
    isConsolidating: consolidarMutation.isPending,
  };
}
