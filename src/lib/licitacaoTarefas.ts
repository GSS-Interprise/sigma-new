// Tarefas com data e hora do edital (T5 de docs/arquitetura/licitacoes-contratos-gss.md).
// Lista de tipos da reunião de 07/10; a lista final é da Bianca (seção 10 do plano).
export const TIPOS_TAREFA = [
  { value: "esclarecimento_impugnacao", label: "Esclarecimento/Impugnação" },
  { value: "recurso", label: "Recurso" },
  { value: "contrarrazao", label: "Contrarrazão" },
  { value: "mandado_seguranca", label: "Mandado de segurança" },
  { value: "envio_documentos", label: "Envio de documentos" },
  { value: "deliberacao", label: "Deliberação" },
  { value: "personalizada", label: "Outra (escrever)" },
] as const;

export type LicitacaoTarefa = {
  id: string;
  licitacao_id: string;
  tipo: string;
  titulo: string | null;
  data_hora: string;
  responsavel_id: string | null;
  observacao: string | null;
  avisos_min: number[] | null;
  concluida_em: string | null;
  created_by: string | null;
};

// mesma regra de licitacao_tarefa_rotulo() no banco
export function rotuloTarefa(t: Pick<LicitacaoTarefa, "tipo" | "titulo">) {
  const base = t.tipo === "personalizada"
    ? (t.titulo?.trim() || "Tarefa")
    : (TIPOS_TAREFA.find((x) => x.value === t.tipo)?.label ?? "Tarefa");
  return t.tipo !== "personalizada" && t.titulo?.trim() ? `${base} — ${t.titulo.trim()}` : base;
}

// Antecedências oferecidas nos avisos (minutos). O Trello avisava 1 dia e 1 hora antes.
export const ANTECEDENCIAS = [
  { min: 15, label: "15 min" },
  { min: 60, label: "1 hora" },
  { min: 180, label: "3 horas" },
  { min: 1440, label: "1 dia" },
  { min: 2880, label: "2 dias" },
  { min: 4320, label: "3 dias" },
];
export const AVISOS_PADRAO = [1440, 60];

/**
 * N dias úteis antes da data (pula sábado e domingo; feriado não entra na conta). É a sugestão do
 * prazo de esclarecimento/impugnação: 3 dias úteis antes da abertura (Ramone, reunião de 07/10).
 */
export function diasUteisAntes(data: Date, n: number) {
  const d = new Date(data);
  let faltam = n;
  while (faltam > 0) {
    d.setDate(d.getDate() - 1);
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) faltam--;
  }
  return d;
}

// "2026-10-16" + "14:00" no fuso do navegador (a equipe está em Brasília/SC) → ISO
export function juntarDataHora(data: string, hora: string) {
  return new Date(`${data}T${hora || "09:00"}:00`).toISOString();
}
export function separarDataHora(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

// cor do prazo: vencido, nas próximas 24 h ou tranquilo
export function urgenciaTarefa(iso: string, concluida: boolean) {
  if (concluida) return "concluida" as const;
  const falta = new Date(iso).getTime() - Date.now();
  if (falta < 0) return "vencida" as const;
  if (falta < 864e5) return "hoje" as const;
  return "ok" as const;
}
