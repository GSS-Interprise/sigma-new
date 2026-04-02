export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gestor_contratos: 'Gestor de Contratos',
  gestor_captacao: 'Gestor de Captação',
  coordenador_escalas: 'Coordenador de Escalas',
  gestor_financeiro: 'Gestor Financeiro',
  diretoria: 'Diretoria',
  gestor_radiologia: 'Gestor de Radiologia',
  gestor_marketing: 'Gestor de Marketing',
  gestor_ages: 'Gestor AGES',
  lideres: 'Líder de Setor',
  externos: 'Encerramento de Tickets',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}
