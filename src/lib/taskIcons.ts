import {
  MessageCircle,
  Phone,
  Instagram,
  Mail,
  MessageSquare,
  Video,
  Calendar,
  Send,
  Users,
  Linkedin,
  Globe,
  CircleDot,
  type LucideIcon,
} from "lucide-react";

/**
 * Registry de ícones permitidos para tipos de tarefa (task_tipos.icone).
 * Não dá pra instanciar um componente lucide a partir de string arbitrária —
 * então `task_tipos.icone` guarda o NOME e resolvemos aqui. Adicionar um ícone
 * novo na lista gerenciável = incluir o nome neste mapa (1 linha).
 */
const ICON_REGISTRY: Record<string, LucideIcon> = {
  MessageCircle,
  Phone,
  Instagram,
  Mail,
  MessageSquare,
  Video,
  Calendar,
  Send,
  Users,
  Linkedin,
  Globe,
  CircleDot,
};

/** Ícones oferecidos no seletor ao criar/editar um tipo de tarefa. */
export const ICON_NAMES = Object.keys(ICON_REGISTRY);

/** Resolve um nome de ícone para o componente lucide; fallback CircleDot. */
export function resolveTaskIcon(nome: string | null | undefined): LucideIcon {
  if (nome && ICON_REGISTRY[nome]) return ICON_REGISTRY[nome];
  return CircleDot;
}
