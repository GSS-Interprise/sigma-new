// Quem recebe o aviso (WhatsApp e/ou e-mail) de estação do SLA parada e de quando ela volta (25/11/2026). Pergunta do card:
// "se um PC da estação cair, quem fica sabendo?". Em 24/11 a lista estava vazia, o aviso foi só para o número de teste
// e a equipe soube da queda do Marieta pelo Raul. Vale para as 4 unidades (Marieta, CEPON, Tijucas, Mobilemed).
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { normalizarTelefone, telefoneBonito, useEstacaoDestinos, useSalvarEstacaoDestinos } from "./useSla";

type Linha = { nome: string; fone: string; email: string };

function erroDe(l: Linha, n: number) {
  if (!l.nome.trim()) return `Pessoa ${n}: informe o nome.`;
  if (!l.fone.trim() && !l.email.trim()) return `Pessoa ${n}: informe WhatsApp ou e-mail.`;
  if (l.fone.trim() && !normalizarTelefone(l.fone)) return `Pessoa ${n}: telefone com DDD, ex.: (47) 99999-0000.`;
  if (l.email.trim() && !/^\S+@\S+\.\S+$/.test(l.email.trim())) return `Pessoa ${n}: e-mail inválido.`;
  return null;
}

export function EstacaoDestinos() {
  const destinos = useEstacaoDestinos();
  const salvar = useSalvarEstacaoDestinos();
  const { toast } = useToast();
  const salvos = useMemo(() => (destinos.data ?? []).map((d) => ({ nome: d.nome, fone: d.fone ? telefoneBonito(d.fone) : "", email: d.email ?? "" })), [destinos.data]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  useEffect(() => { setLinhas(salvos); }, [salvos]);

  const mudou = JSON.stringify(linhas) !== JSON.stringify(salvos);
  const erro = linhas.map((l, i) => erroDe(l, i + 1)).find(Boolean) ?? null;
  const muda = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const enviar = () => salvar.mutate(linhas.map((l) => ({ nome: l.nome.trim(), fone: l.fone.trim() ? normalizarTelefone(l.fone)! : undefined, email: l.email.trim() || undefined })), {
    onSuccess: () => toast({ title: "Pronto", description: linhas.length ? "Na próxima queda, o aviso vai para essas pessoas." : "Lista vazia: o aviso vai só para o número de teste." }),
    onError: (e) => toast({ title: "Não salvou", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <Card className="max-w-4xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Se a estação parar</CardTitle>
        <p className="text-sm text-muted-foreground">
          {salvos.length
            ? `Aviso quando um PC da estação para de ler e quando volta: ${salvos.map((l) => l.nome).join(", ")}.`
            : "Ninguém cadastrado: o aviso de estação parada vai só para o número de teste."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {destinos.isLoading && <Skeleton className="h-16 w-full" />}
        {destinos.error && <p className="text-red-700">Não deu para carregar: {(destinos.error as Error).message}</p>}
        {destinos.data && (
          <>
            {linhas.map((l, i) => (
              <div key={i} className="grid items-end gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_36px]">
                <div className="space-y-1">
                  <Label htmlFor={`e-nome-${i}`}>Nome</Label>
                  <Input id={`e-nome-${i}`} value={l.nome} maxLength={80} placeholder="Wagner" onChange={(e) => muda(i, { nome: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`e-fone-${i}`}>WhatsApp</Label>
                  <Input id={`e-fone-${i}`} value={l.fone} inputMode="tel" placeholder="(47) 99999-0000" onChange={(e) => muda(i, { fone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`e-email-${i}`}>E-mail</Label>
                  <Input id={`e-email-${i}`} value={l.email} inputMode="email" placeholder="nome@gestaoservicosaude.com.br" onChange={(e) => muda(i, { email: e.target.value })} />
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Remover pessoa ${i + 1}`}
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-9" disabled={linhas.length >= 10}
                onClick={() => setLinhas((ls) => [...ls, { nome: "", fone: "", email: "" }])}>
                <Plus className="mr-1 h-4 w-4" />Adicionar pessoa
              </Button>
              <div className="ml-auto flex gap-2">
                {mudou && <Button variant="ghost" className="h-9" onClick={() => setLinhas(salvos)} disabled={salvar.isPending}>Desfazer</Button>}
                <Button className="h-9" disabled={!mudou || !!erro || salvar.isPending} onClick={enviar}>
                  {salvar.isPending ? "Salvando…" : "Salvar"}
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
