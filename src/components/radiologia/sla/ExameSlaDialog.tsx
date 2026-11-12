// Detalhe de um exame da fila de SLA: ações rápidas de quem acompanha o plantão, anotação livre e histórico
// (avisos do robô + anotações). "Avisei o médico" para os avisos automáticos; "Não precisa de laudo" tira da atenção.
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ORIGEM, type Alerta, type Exame, type Nota, diaHora, ehHoje, horaCurta, situacaoPrazo, useAnotar, useNotas } from "./useSla";
import { OrigemSelo, textoPrazo } from "./pecas";

const ACOES: { tipo: Nota["tipo"]; rotulo: string; ok: string }[] = [
  { tipo: "avisei_medico", rotulo: "Avisei o médico", ok: "Registrado. Os avisos automáticos deste exame pararam." },
  { tipo: "nao_precisa_laudo", rotulo: "Não precisa de laudo", ok: "Exame tirado da atenção. Os avisos pararam." },
  { tipo: "problema_pacs", rotulo: "Problema no PACS", ok: "Problema registrado no histórico do exame." },
];
const NOTA_TXT: Record<Nota["tipo"], string> = {
  nota: "Anotação", avisei_medico: "Avisou o médico", nao_precisa_laudo: "Marcou que não precisa de laudo", problema_pacs: "Registrou problema no PACS",
};

export function ExameSlaDialog({ exame, alertas, onClose, agora }: { exame: Exame | null; alertas: Alerta[]; onClose: () => void; agora: number }) {
  const notas = useNotas(exame?.id ?? null);
  const anotar = useAnotar();
  const [texto, setTexto] = useState("");
  if (!exame) return null;
  const s = situacaoPrazo(exame, agora);
  const quando = ehHoje(exame.inicio_em) ? `das ${horaCurta(exame.inicio_em)}` : `de ${diaHora(exame.inicio_em)}`;
  const parado = !!exame.assumido_em || !!exame.silenciado_em;

  const executar = (tipo: Nota["tipo"], ok: string, t?: string) =>
    anotar.mutate({ exameId: exame.id, tipo, texto: t }, {
      onSuccess: () => { toast.success(ok); if (tipo === "nota") setTexto(""); },
      onError: (e) => toast.error(`Não salvou: ${(e as Error).message}`),
    });

  const historico = [
    ...alertas.map((a) => ({
      id: a.id, em: a.criado_em,
      texto: a.status === "falhou"
        ? `Aviso (${a.tipo === "vencido" ? "prazo vencido" : "80% do prazo"}) para ${a.destino_nome ?? "—"} falhou${a.erro ? `: ${a.erro}` : ""}`
        : a.papel === "sem_escala" ? "Ninguém na escala: aviso só por e-mail"
          : `Robô avisou ${a.destino_nome ?? "—"} por ${a.canal === "whatsapp" ? "WhatsApp" : a.canal} (${a.tipo === "vencido" ? "prazo vencido" : "80% do prazo"})${a.respondido_em ? ` · assumiu às ${horaCurta(a.respondido_em)}` : ""}`,
    })),
    ...(notas.data ?? []).map((n) => ({ id: n.id, em: n.criado_em, texto: `${n.autor_nome ?? "Alguém"}: ${NOTA_TXT[n.tipo]}${n.texto ? ` — ${n.texto}` : ""}` })),
  ].sort((a, b) => b.em.localeCompare(a.em));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setTexto(""); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><OrigemSelo origem={exame.origem} /> <span className="min-w-0 truncate">{exame.paciente || `Exame ${quando}`}</span></DialogTitle>
          <DialogDescription>
            {exame.estudo ? `${exame.estudo} · ` : ""}{exame.paciente ? `exame ${quando} · ` : ""}{ORIGEM[exame.origem].nome} · prazo até {diaHora(exame.vence_em)} · <span className={s.estado === "vencido" ? "font-semibold text-red-700" : ""}>{textoPrazo(s.faltaMin)}</span>
            {exame.precisao === "minuto" && " · hora lida sem os segundos"}
          </DialogDescription>
        </DialogHeader>

        {exame.assumido_em && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Assumido{exame.assumido_por ? ` por ${exame.assumido_por}` : ""} às {horaCurta(exame.assumido_em)} ({exame.assumido_via === "whatsapp" ? "WhatsApp" : "Sigma"}).</p>}
        {exame.silenciado_em && <p className="rounded-md bg-muted px-3 py-2 text-sm">Marcado como "não precisa de laudo" às {horaCurta(exame.silenciado_em)}.</p>}

        <div className="flex flex-wrap gap-2">
          {ACOES.map((a) => (
            <Button key={a.tipo} variant="outline" size="sm" className="h-9" disabled={anotar.isPending || (parado && a.tipo !== "problema_pacs")}
              onClick={() => executar(a.tipo, a.ok)}>
              {a.rotulo}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <Textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={2} maxLength={500}
            placeholder="Anotação para quem acompanha o plantão (ex.: liguei para o Dr. Paulo, laudo em 20 min)" />
          <div className="flex justify-end">
            <Button size="sm" className="h-9" disabled={!texto.trim() || anotar.isPending} onClick={() => executar("nota", "Anotação salva.", texto)}>
              {anotar.isPending ? "Salvando…" : "Salvar anotação"}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Histórico</p>
          <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {notas.isLoading && <p className="text-muted-foreground">Carregando…</p>}
            {!notas.isLoading && historico.length === 0 && <p className="text-muted-foreground">Nada registrado ainda. Entrou na fila às {horaCurta(exame.visto_primeiro_em)}.</p>}
            {historico.map((h) => (
              <div key={h.id} className="flex gap-3">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{diaHora(h.em)}</span>
                <span className="min-w-0 break-words">{h.texto}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
