import { supabase } from "@/integrations/supabase/client";

interface AuditLogParams {
  modulo: string;
  tabela: string;
  acao: 'criar' | 'editar' | 'excluir' | 'anexar' | 'remover_anexo';
  registroId: string;
  registroDescricao?: string;
  dadosAntigos?: Record<string, any> | null;
  dadosNovos?: Record<string, any> | null;
  camposAlterados?: string[];
  detalhes?: string;
}

export async function registrarAuditoria(params: AuditLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('Auditoria: usuário não autenticado');
      return;
    }

    // Buscar nome do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('nome_completo')
      .eq('id', user.id)
      .single();

    // Buscar perfil do usuário
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const usuarioNome = profile?.nome_completo || user.email || 'Usuário desconhecido';
    const usuarioPerfil = userRoles?.[0]?.role || null;

    const { error } = await supabase.from('auditoria_logs').insert({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      usuario_perfil: usuarioPerfil,
      modulo: params.modulo,
      tabela: params.tabela,
      acao: params.acao,
      registro_id: params.registroId,
      registro_descricao: params.registroDescricao || null,
      dados_antigos: params.dadosAntigos || null,
      dados_novos: params.dadosNovos || null,
      campos_alterados: params.camposAlterados || null,
      detalhes: params.detalhes || null,
      autorizado: true,
    });

    if (error) {
      console.error('Erro ao registrar auditoria:', error);
    }
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error);
  }
}

export function detectarCamposAlterados(
  dadosAntigos: Record<string, any>,
  dadosNovos: Record<string, any>
): { camposAlterados: string[]; valoresAntigos: Record<string, any>; valoresNovos: Record<string, any> } {
  const camposAlterados: string[] = [];
  const valoresAntigos: Record<string, any> = {};
  const valoresNovos: Record<string, any> = {};

  // Campos a ignorar na comparação
  const camposIgnorados = ['updated_at', 'created_at', 'id'];

  const todasAsChaves = new Set([
    ...Object.keys(dadosAntigos),
    ...Object.keys(dadosNovos),
  ]);

  todasAsChaves.forEach((chave) => {
    if (camposIgnorados.includes(chave)) return;

    const valorAntigo = dadosAntigos[chave];
    const valorNovo = dadosNovos[chave];

    // Comparação profunda para arrays e objetos
    const antigoStr = JSON.stringify(valorAntigo);
    const novoStr = JSON.stringify(valorNovo);

    if (antigoStr !== novoStr) {
      camposAlterados.push(chave);
      valoresAntigos[chave] = valorAntigo;
      valoresNovos[chave] = valorNovo;
    }
  });

  return { camposAlterados, valoresAntigos, valoresNovos };
}
