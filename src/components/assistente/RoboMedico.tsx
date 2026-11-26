// Mascote do assistente do Sigma (26/11/2026, Raul: "um robozinho meio médico, um bonequinho, em vez de só a carinha"):
// robô de corpo inteiro com visor, antena, estetoscópio e cruz no peito. SVG próprio: cor principal = currentColor
// (segue o botão), detalhes em branco e o verde da GSS na cruz e no visor.
export function RoboMedico({ className = "h-6 w-6", titulo }: { className?: string; titulo?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role={titulo ? "img" : undefined} aria-hidden={titulo ? undefined : true} fill="none">
      {titulo && <title>{titulo}</title>}
      {/* antena */}
      <line x1="24" y1="4.5" x2="24" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="4" r="2.2" fill="#34d399" />
      {/* cabeça */}
      <rect x="12" y="9" width="24" height="16" rx="6" fill="currentColor" />
      <rect x="15.5" y="12.5" width="17" height="9" rx="4" fill="#0f2b1d" />
      <circle cx="20.5" cy="17" r="1.9" fill="#6ee7b7" />
      <circle cx="27.5" cy="17" r="1.9" fill="#6ee7b7" />
      <rect x="9.5" y="14.5" width="3" height="5" rx="1.5" fill="currentColor" />
      <rect x="35.5" y="14.5" width="3" height="5" rx="1.5" fill="currentColor" />
      {/* corpo (jaleco) */}
      <rect x="14" y="27" width="20" height="13" rx="4.5" fill="#ffffff" stroke="currentColor" strokeWidth="1.8" />
      <path d="M24 27v13" stroke="currentColor" strokeWidth="1.2" opacity=".35" />
      {/* cruz no peito */}
      <rect x="26.6" y="30" width="5" height="1.8" rx=".6" fill="#16a34a" />
      <rect x="28.2" y="28.4" width="1.8" height="5" rx=".6" fill="#16a34a" />
      {/* estetoscópio */}
      <path d="M17.5 27.5c0 4.5 1.5 6.5 3.5 6.5s2.6-1.6 2.6-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="23.6" cy="30.2" r="1.5" fill="currentColor" />
      {/* braços */}
      <rect x="9" y="28.5" width="4" height="9" rx="2" fill="currentColor" />
      <rect x="35" y="28.5" width="4" height="9" rx="2" fill="currentColor" />
      {/* pernas */}
      <rect x="17" y="40" width="5" height="5.5" rx="2" fill="currentColor" />
      <rect x="26" y="40" width="5" height="5.5" rx="2" fill="currentColor" />
    </svg>
  );
}
