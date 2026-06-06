// Fonte única das categorias de uso de chip.
// Espelha a constraint chips_categoria_uso_check no banco. NÃO adicionar valor
// aqui sem adicionar também na constraint (e vice-versa).
export const CATEGORIAS_USO = [
  { value: "prospeccao_ia", label: "Prospecção IA", desc: "IA prospecta automaticamente (entra no limite de 35/dia)" },
  { value: "manual", label: "Manual", desc: "Operador envia manualmente, IA não responde" },
  { value: "inbound", label: "Inbound", desc: "Recebe leads de tráfego pago / site" },
  { value: "suporte", label: "Suporte", desc: "Atendimento, dúvidas pós-venda" },
  { value: "pessoal_restrito", label: "Pessoal Restrito", desc: "Fora da máquina de prospecção (chip pessoal/restrito)" },
] as const;

export type CategoriaUso = (typeof CATEGORIAS_USO)[number]["value"];

export const CATEGORIA_USO_VALUES = CATEGORIAS_USO.map((c) => c.value) as CategoriaUso[];

export const CATEGORIA_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIAS_USO.map((c) => [c.value, c.label]),
);
