import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

/**
 * Quem recebe o aviso de vencimento e com quantos dias de antecedência (T10/T13). Fica na tela
 * porque a reunião de 07/10 não fechou a lista; a equipe ajusta sem pedir ao desenvolvedor.
 */
const DIAS = [60, 30, 15, 7, 3, 1];

export function VencimentosConfigDialog({ chave, titulo, onFechar, semDias = false, descricao }: {
  chave: "empresa_documentos" | "medico_documentos" | "contrato_assinado" | "contrato_inicio_servico" | "medico_vinculado" | "licitacao_arrematada"; titulo: string; onFechar: () => void;
  semDias?: boolean; descricao?: string;
}) {
  const qc = useQueryClient();
  const [dias, setDias] = useState<number[]>([]);
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [email, setEmail] = useState(true);
  const [busca, setBusca] = useState("");

  const { data: cfg } = useQuery({
    queryKey: ["vencimentos-config", chave],
    queryFn: async () => {
      const { data } = await (supabase as any).from("vencimentos_config").select("*").eq("chave", chave).maybeSingle();
      return data as any;
    },
  });
  // equipe interna com papel (quem pode receber)
  const { data: equipe = [] } = useQuery({
    queryKey: ["vencimentos-equipe"],
    queryFn: async () => {
      const { data: papeis } = await supabase.from("user_roles").select("user_id");
      const ids = [...new Set((papeis ?? []).map((p: any) => p.user_id))];
      const { data } = await supabase.from("profiles").select("id, nome_completo").in("id", ids).order("nome_completo");
      return (data ?? []) as { id: string; nome_completo: string }[];
    },
  });
  useEffect(() => {
    if (!cfg) return;
    setDias(cfg.dias ?? []); setPessoas(cfg.destinatarios ?? []); setEmail(cfg.aviso_email ?? true);
  }, [cfg]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("vencimentos_config")
        .update({ dias: [...dias].sort((a, b) => b - a), destinatarios: pessoas, aviso_email: email, updated_at: new Date().toISOString() }).eq("chave", chave);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Avisos atualizados"); qc.invalidateQueries({ queryKey: ["vencimentos-config", chave] }); onFechar(); },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar"),
  });

  const visiveis = equipe.filter((p) => !busca || p.nome_completo?.toLowerCase().includes(busca.toLowerCase()));
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Avisos: {titulo}</DialogTitle>
          <DialogDescription>{descricao ?? "O Sigma confere todo dia às 8h e manda um resumo por pessoa, no sino e por e-mail."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!semDias && <div className="space-y-1.5">
            <span className="text-sm font-medium">Avisar quantos dias antes</span>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => {
                const on = dias.includes(d);
                return <Badge key={d} variant={on ? "default" : "outline"} className="cursor-pointer font-normal" onClick={() => setDias(on ? dias.filter((x) => x !== d) : [...dias, d])}>{d === 1 ? "1 dia" : `${d} dias`}</Badge>;
              })}
            </div>
            <p className="text-xs text-muted-foreground">Documento vencido também gera um aviso.</p>
          </div>}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Quem recebe ({pessoas.length})</span>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className="h-8" />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {visiveis.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={pessoas.includes(p.id)} onCheckedChange={(v) => setPessoas(v ? [...pessoas, p.id] : pessoas.filter((x) => x !== p.id))} />
                  {p.nome_completo}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={email} onCheckedChange={setEmail} /> Também por e-mail</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || (!semDias && !dias.length)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// selo de validade usado nas duas telas
export function seloValidade(validade: string | null | undefined) {
  if (!validade) return { texto: "Sem validade", classe: "bg-muted text-muted-foreground", resta: null as number | null };
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  const resta = Math.round((new Date(`${validade}T12:00:00`).getTime() - hoje.getTime()) / 864e5);
  const data = validade.split("-").reverse().join("/");
  if (resta < 0) return { texto: `Vencido em ${data}`, classe: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300", resta };
  if (resta <= 30) return { texto: `Vence ${data} (${resta === 0 ? "hoje" : `${resta}d`})`, classe: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300", resta };
  return { texto: `Válido até ${data}`, classe: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300", resta };
}
