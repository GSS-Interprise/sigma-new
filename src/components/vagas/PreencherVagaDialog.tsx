import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { rotuloTipo, useMedicosBusca, useMudarVaga, type Vaga } from "./useVagas";

/** Fecha a vaga com o médico que assumiu: cadastrado no Sigma (busca) ou só o nome. */
export function PreencherVagaDialog({ vaga, onOpenChange }: { vaga: Vaga | null; onOpenChange: (v: boolean) => void }) {
  const [termo, setTermo] = useState("");
  const [medico, setMedico] = useState<{ id: string; nome: string } | null>(null);
  const { data: achados = [], isFetching } = useMedicosBusca(medico ? "" : termo);
  const mudar = useMudarVaga();

  useEffect(() => { if (vaga) { setTermo(""); setMedico(null); } }, [vaga]);

  const nome = medico?.nome || termo.trim();
  const confirmar = () => {
    if (!vaga) return;
    if (nome.length < 3) { toast.error("Diga quem assumiu a vaga."); return; }
    mudar.mutate(
      { id: vaga.id, campos: { status: "preenchida", medico_id: medico?.id ?? null, medico_nome: nome } },
      {
        onSuccess: () => { toast.success(`Vaga preenchida em ${vaga.dias_aberta} dias. Ela sai da lista.`); onOpenChange(false); },
        onError: (e: any) => toast.error(`Não consegui fechar a vaga: ${e?.message || e}`),
      },
    );
  };

  return (
    <Dialog open={!!vaga} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Marcar vaga como preenchida</DialogTitle>
          {vaga && (
            <DialogDescription>
              {vaga.especialidade_nome} · {rotuloTipo(vaga.tipo)} · {vaga.hospital_nome}, {vaga.cidade}
            </DialogDescription>
          )}
        </DialogHeader>
        <div>
          <Label htmlFor="vaga-medico" className="mb-1.5 block text-xs font-medium text-muted-foreground">Médico que assumiu</Label>
          <Input id="vaga-medico" autoFocus value={medico ? medico.nome : termo}
            onChange={(e) => { setMedico(null); setTermo(e.target.value); }} placeholder="Nome ou CRM" />
          {!medico && termo.trim().length >= 3 && (
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border">
              {isFetching && <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando</li>}
              {achados.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setMedico({ id: m.id, nome: m.nome_completo })}
                    className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted")}>
                    <span className="truncate">{m.nome_completo}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{m.crm ? `CRM ${m.crm}${m.estado ? `/${m.estado}` : ""}` : ""}</span>
                  </button>
                </li>
              ))}
              {!isFetching && achados.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">Não está no Sigma. Fica registrado só o nome.</li>
              )}
            </ul>
          )}
          {medico && <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><Check className="h-4 w-4" />Médico do cadastro</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={mudar.isPending}>
            {mudar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Fechar vaga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
