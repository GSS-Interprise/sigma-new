// O catálogo `especialidades` guarda os nomes em maiúsculas ("CLÍNICA MÉDICA"), como vêm do CFM.
// Na tela mostramos com a primeira letra maiúscula, para não "gritar" em lista e chip.
const MINUSCULAS = new Set(["e", "de", "da", "do", "das", "dos", "em", "a", "o"]);

export function formatarEspecialidade(nome: string): string {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

export function chaveEspecialidade(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

// Uma especialidade do médico com o RQE dela. sem_rqe = generalista / clínico sem residência.
export interface EspecialidadeRqe {
  especialidade_id: string;
  nome: string;
  rqe: string;
  sem_rqe: boolean;
}

export const rqeSoNumero = (v: string) => v.replace(/\D/g, "");

export const linhaIncompleta = (l: EspecialidadeRqe) => !l.sem_rqe && rqeSoNumero(l.rqe) === "";

// Texto do CFM ("ANESTESIOLOGIA - RQE Nº 8048, MEDICINA INTENSIVA - RQE Nº 8301") vira pares
// especialidade + RQE, só os que existem no catálogo.
export function lerRqeDoTexto(
  texto: string,
  catalogo: Array<{ id: string; nome: string }>,
): EspecialidadeRqe[] {
  const porChave = new Map(catalogo.map((e) => [chaveEspecialidade(e.nome), e]));
  const achados = new Map<string, EspecialidadeRqe>();
  const re = /([A-Za-zÀ-ú ]+)\s*-\s*RQE\s*N?[º°o]?\.?\s*:?\s*(\d+)/g;
  for (const m of texto.matchAll(re)) {
    const e = porChave.get(chaveEspecialidade(m[1]));
    if (e && !achados.has(e.id)) {
      achados.set(e.id, { especialidade_id: e.id, nome: e.nome, rqe: m[2], sem_rqe: false });
    }
  }
  return Array.from(achados.values());
}
