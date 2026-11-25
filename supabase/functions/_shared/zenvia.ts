// Envio de texto pela Zenvia (API v2), para responder em Conversas o médico que respondeu a um disparo da Zenvia
// (25/11/2026; conversas espelhadas em 20261125235000_zenvia_conversas.sql). Só texto e só dentro da janela de 24 h
// da Meta: fora dela a Zenvia exige modelo aprovado, e os modelos da Zenvia não estão no Sigma.
// O token fica no secret ZENVIA_API_TOKEN. O status (entregue, lido) chega depois pelo zenvia-webhook.

export class ZenviaErro extends Error {
  constructor(public status: number, public detalhe: string) {
    super(`zenvia_${status}: ${detalhe}`);
  }
}

export async function zenviaEnviarTexto(de: string, para: string, texto: string): Promise<{ id: string }> {
  const token = Deno.env.get("ZENVIA_API_TOKEN") || "";
  if (!token) throw new ZenviaErro(500, "ZENVIA_API_TOKEN ausente");
  const r = await fetch("https://api.zenvia.com/v2/channels/whatsapp/messages", {
    method: "POST",
    headers: { "X-API-TOKEN": token, "Content-Type": "application/json" },
    body: JSON.stringify({ from: de, to: para, contents: [{ type: "text", text: texto }] }),
  });
  const corpo = await r.text();
  let dados: Record<string, unknown> = {};
  try { dados = JSON.parse(corpo); } catch { /* texto */ }
  if (!r.ok || !dados.id) throw new ZenviaErro(r.status, String(dados.message || corpo).slice(0, 300));
  return { id: String(dados.id) };
}
