// Aba Coordenação do SLA (21/11). Pergunta da tela: "Se o médico não responder, quem mais a gente avisa, e quando?"
// Quem usa: Wagner e Brenda. Cada contato é uma pessoa fixa (não depende da escala) e recebe uma vez por exame,
// N min depois do vencimento, só se ninguém assumiu o laudo. Sem contato: só o e-mail da coordenação.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { normalizarTelefone, telefoneBonito } from "./useSla";
import { CANAL, type Canal, MAX_DEPOIS, PAPEL_CONTATO, type PapelContato, type Passo, quando, usePassos, useSalvarPassos } from "./usePassos";

type Linha = { id?: string; nome: string; papel: PapelContato; canal: Canal; contato: string; min: string; ativo: boolean };

const paraLinha = (p: Passo): Linha => ({
  id: p.id, nome: p.contato_nome ?? "", papel: p.contato_papel ?? "coordenacao", canal: p.canal,
  contato: p.canal === "email" ? p.contato_email ?? "" : p.contato_telefone ? telefoneBonito(p.contato_telefone) : "",
  min: String(Math.max(0, p.minutos)), ativo: p.ativo,
});

function erroDe(l: Linha, n: number) {
  if (!l.nome.trim()) return `Contato ${n}: informe o nome.`;
  if (l.canal === "email" ? !/^\S+@\S+\.\S+$/.test(l.contato.trim()) : !normalizarTelefone(l.contato))
    return l.canal === "email" ? `Contato ${n}: e-mail inválido.` : `Contato ${n}: telefone com DDD, ex.: (47) 99999-0000.`;
  const m = Number(l.min);
  if (l.min === "" || !Number.isInteger(m) || m < 0 || m > MAX_DEPOIS) return `Contato ${n}: de 0 a ${MAX_DEPOIS} min depois do prazo.`;
  return null;
}

export function AbaCoordenacao() {
  const passos = usePassos();
  const salvar = useSalvarPassos("contato", "Contatos salvos. Valem a partir do próximo exame vencido.");
  const salvos = useMemo(() => (passos.data ?? []).filter((p) => p.destino === "contato").map(paraLinha), [passos.data]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  useEffect(() => { setLinhas(salvos); }, [salvos]);

  const mudou = JSON.stringify(linhas) !== JSON.stringify(salvos);
  const erro = linhas.map((l, i) => erroDe(l, i + 1)).find(Boolean) ?? null;
  const muda = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const ativos = [...linhas].filter((l) => l.ativo && !erroDe(l, 0)).sort((a, b) => Number(a.min) - Number(b.min));

  const enviar = () => salvar.mutate(linhas.map((l) => {
    const email = l.canal === "email";
    return {
      id: l.id, destino: "contato", canal: l.canal, minutos: Number(l.min), ativo: l.ativo, contato_nome: l.nome.trim(),
      contato_papel: l.papel, contato_telefone: email ? null : normalizarTelefone(l.contato), contato_email: email ? l.contato.trim() : null,
    };
  }));

  return (
    <Card className="max-w-4xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Se ninguém assumir o laudo</CardTitle>
        <p className="text-sm text-muted-foreground">
          {ativos.length
            ? `Depois do prazo: ${ativos.map((l) => `${l.nome.trim()} ${quando(Number(l.min)).replace(" depois do prazo", "")}`).join(", ")}.`
            : "Ninguém cadastrado: o exame vencido sem dono vai só para o e-mail da coordenação."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {passos.isLoading && <Skeleton className="h-28 w-full" />}
        {passos.error && <p className="text-red-700">Não deu para carregar os contatos: {(passos.error as Error).message}</p>}

        {passos.data && (
          <>
            {linhas.map((l, i) => (
              <div key={l.id ?? `novo-${i}`} className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1.4fr)_150px_130px_minmax(0,1.2fr)]">
                <div className="space-y-1">
                  <Label htmlFor={`c-nome-${i}`}>Nome</Label>
                  <Input id={`c-nome-${i}`} value={l.nome} maxLength={80} placeholder="Wagner Oliveira" onChange={(e) => muda(i, { nome: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Função</Label>
                  <Select value={l.papel} onValueChange={(v) => muda(i, { papel: v as PapelContato })}>
                    <SelectTrigger aria-label={`Função do contato ${i + 1}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAPEL_CONTATO).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Avisar por</Label>
                  <Select value={l.canal} onValueChange={(v) => muda(i, { canal: v as Canal, contato: "" })}>
                    <SelectTrigger aria-label={`Canal do contato ${i + 1}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CANAL).map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`c-contato-${i}`}>{l.canal === "email" ? "E-mail" : "Telefone"}</Label>
                  <Input id={`c-contato-${i}`} value={l.contato} inputMode={l.canal === "email" ? "email" : "tel"}
                    placeholder={l.canal === "email" ? "nome@gss.com.br" : "(47) 99999-0000"} onChange={(e) => muda(i, { contato: e.target.value })} />
                </div>
                <div className="flex flex-wrap items-center gap-2 md:col-span-4">
                  <span className="text-muted-foreground">Avisar</span>
                  <Input className="h-9 w-20 tabular-nums" inputMode="numeric" value={l.min} aria-label={`Minutos depois do prazo, contato ${i + 1}`}
                    onChange={(e) => muda(i, { min: e.target.value.replace(/\D/g, "") })} />
                  <span className="text-muted-foreground">min depois do prazo, se ninguém assumiu</span>
                  <div className="ml-auto flex items-center gap-2">
                    <Switch checked={l.ativo} onCheckedChange={(v) => muda(i, { ativo: v })} aria-label={`Contato ${i + 1} ligado`} />
                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Remover contato ${i + 1}`}
                      onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-9" disabled={linhas.length >= 12}
                onClick={() => setLinhas((ls) => [...ls, { nome: "", papel: "coordenacao", canal: "whatsapp", contato: "", min: String(ls.length ? 15 : 10), ativo: true }])}>
                <Plus className="mr-1 h-4 w-4" />Adicionar contato
              </Button>
              <div className="ml-auto flex gap-2">
                {mudou && <Button variant="ghost" className="h-9" onClick={() => setLinhas(salvos)} disabled={salvar.isPending}>Desfazer</Button>}
                <Button className="h-9" disabled={!mudou || !!erro || salvar.isPending} onClick={enviar}>
                  {salvar.isPending ? "Salvando…" : "Salvar contatos"}
                </Button>
              </div>
            </div>
            {erro && mudou && <p className="text-xs text-red-700">{erro}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
