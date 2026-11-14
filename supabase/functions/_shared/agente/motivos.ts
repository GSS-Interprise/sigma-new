// Motivo de falha da Meta em português de dono. CÓPIA de motivoLegivel/agruparMotivos de src/lib/textoDono.ts e
// src/components/campanhas/PainelDonoCampanha.tsx: a edge não importa de src/. O teste protocolo_test.ts compara as
// duas para o sócio e o Resumo da campanha lerem o mesmo motivo. Mudou lá? Mude aqui (o teste acusa).

export function motivoLegivel(m: string) {
  if (/account locked|141006|payment/i.test(m)) return "Conta da Meta bloqueada (pagamento)";
  if (/healthy ecosystem|131049/i.test(m)) return "Meta segurou o envio para proteger o número";
  if (/undeliverable|131026|not a valid whatsapp/i.test(m)) return "Número sem WhatsApp ou inválido";
  if (/re-engagement|131047|24 hours/i.test(m)) return "Fora da janela de 24 h";
  if (/experiment|130472/i.test(m)) return "Médico num teste da Meta que bloqueia marketing";
  return "Outros motivos";
}

/** Até 4 motivos + "Outros motivos"; a soma continua igual a 'falharam', como na tela. */
export function agruparMotivos(erros: { motivo: string; n: number }[]) {
  const por = new Map<string, number>();
  for (const e of erros) por.set(motivoLegivel(e.motivo), (por.get(motivoLegivel(e.motivo)) ?? 0) + e.n);
  const outros = por.get("Outros motivos") ?? 0;
  por.delete("Outros motivos");
  const lista = [...por].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n || a.motivo.localeCompare(b.motivo));
  const resto = lista.slice(4).reduce((t, x) => t + x.n, 0) + outros;
  return [...lista.slice(0, 4), ...(resto > 0 ? [{ motivo: "Outros motivos", n: resto }] : [])];
}
