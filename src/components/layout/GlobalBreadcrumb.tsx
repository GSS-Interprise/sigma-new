import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

/**
 * Fase C — Breadcrumb global no header.
 *
 * Lê o pathname e renderiza o caminho hierárquico ("Home > Prospecção > Quentes (IA)").
 * Ajuda o usuário a sempre saber onde está e voltar com 1 clique pra qualquer nível
 * superior. Resolve o problema heurístico de Krug ("trunk test" — drop-in test).
 *
 * Sub-rotas com query params (ex: ?view=acompanhamento) viram um nível extra
 * quando estão mapeadas em SUB_ROUTE_LABELS.
 */

interface Crumb {
  label: string;
  href?: string;
}

// Rótulos amigáveis por segmento de pathname (1º nível)
const ROUTE_LABELS: Record<string, string> = {
  "": "Home",
  licitacoes: "Licitações",
  disparos: "Disparos e Captação",
  prospeccao: "Prospecção",
  marketing: "Marketing",
  contratos: "Clientes e Contratos",
  "relacionamento-medico": "Relacionamento Médico",
  medicos: "Médicos",
  escalas: "Escalas",
  financeiro: "Financeiro",
  patrimonio: "Patrimônio",
  radiologia: "Radiologia",
  bi: "BI",
  ages: "AGES",
  comunicacao: "Comunicação",
  suporte: "Suporte",
  auditoria: "Auditoria",
  configuracoes: "Configurações",
  workspace: "Workspace",
  sigzap: "Conversas",
};

// Sub-views via query param ?view=xxx ou ?tab=xxx
const SUB_VIEW_LABELS: Record<string, Record<string, string>> = {
  prospeccao: {
    campanhas: "Campanhas",
    acompanhamento: "Quentes (IA)",
    dashboard: "Dashboard",
    quentes: "Quentes (IA)",
  },
  configuracoes: {
    chips: "Chips",
    usuarios: "Usuários",
    permissoes: "Permissões",
    integracoes: "Integrações",
    blacklist: "Blacklist",
    anti_ban: "Anti-Ban",
    notificacoes: "Notificações",
  },
};

function buildCrumbs(pathname: string, search: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }];

  let accumulatedPath = "";
  segments.forEach((seg, idx) => {
    accumulatedPath += `/${seg}`;
    const label = ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    const isLast = idx === segments.length - 1;
    crumbs.push({
      label,
      href: isLast ? undefined : accumulatedPath,
    });
  });

  // Sub-view via ?view= ou ?tab=
  const top = segments[0];
  if (top && SUB_VIEW_LABELS[top]) {
    const params = new URLSearchParams(search);
    const sub = params.get("view") || params.get("tab");
    if (sub && SUB_VIEW_LABELS[top][sub]) {
      crumbs.push({ label: SUB_VIEW_LABELS[top][sub] });
    }
  }

  return crumbs;
}

export function GlobalBreadcrumb() {
  const location = useLocation();
  const crumbs = buildCrumbs(location.pathname, location.search);

  if (crumbs.length <= 1) return null; // Home — não mostra

  return (
    <nav
      aria-label="Localização atual"
      className="flex items-center gap-1 text-xs text-muted-foreground min-w-0"
    >
      {crumbs.map((c, i) => {
        const isFirst = i === 0;
        const isLast = i === crumbs.length - 1;
        return (
          <div key={i} className="flex items-center gap-1 min-w-0">
            {!isFirst && <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />}
            {c.href && !isLast ? (
              <Link
                to={c.href}
                className="hover:text-foreground transition-colors flex items-center gap-1 truncate"
              >
                {isFirst && <Home className="h-3 w-3 shrink-0" />}
                <span className="truncate">{c.label}</span>
              </Link>
            ) : (
              <span
                className={`flex items-center gap-1 truncate ${isLast ? "text-foreground font-medium" : ""}`}
              >
                {isFirst && <Home className="h-3 w-3 shrink-0" />}
                <span className="truncate">{c.label}</span>
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
