import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

/**
 * Aviso de edital repetido na criação manual (T3 de docs/arquitetura/licitacoes-contratos-gss.md).
 * Denise, reunião de 07/10: "antes de inserir, verificar se já existe" (hoje ela usa Ctrl+F).
 * Procura no quadro da mesma empresa, inclusive arquivados (função licitacoes_possiveis_duplicados).
 * A Bianca pediu bloqueio; até a GSS decidir é aviso com confirmação. Para bloquear: true.
 */
export const BLOQUEAR_DUPLICADO = false;

export type Duplicado = { id: string; titulo: string | null; numero_edital: string | null; orgao: string | null; municipio_uf: string | null; status: string; arquivado_em: string | null; data_disputa: string | null; motivo: string | null };

export function useDuplicadosLicitacao(ativo: boolean, f: { numero_edital?: string; orgao?: string; municipio_uf?: string; cnpj_orgao?: string; tipo_licitacao?: string }) {
  // espera a pessoa parar de digitar
  const chave = JSON.stringify([f.numero_edital, f.orgao, f.municipio_uf, f.cnpj_orgao, f.tipo_licitacao]);
  const [estavel, setEstavel] = useState(chave);
  useEffect(() => { const t = setTimeout(() => setEstavel(chave), 500); return () => clearTimeout(t); }, [chave]);
  const [numero, orgao, municipio, cnpj, tipo] = JSON.parse(estavel);
  return useQuery({
    queryKey: ["licitacao-duplicados", estavel],
    enabled: ativo && /\d+\s*[/.\-]\s*(19|20)\d{2}/.test(numero || ""),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("licitacoes_possiveis_duplicados", {
        _numero: numero || "", _orgao: orgao || "", _municipio_uf: municipio || "", _cnpj: cnpj || "", _empresa: tipo === "AGES" ? "AGES" : "GSS",
      });
      if (error) throw error;
      return (data ?? []) as Duplicado[];
    },
  });
}

const situacao = (d: Duplicado) => d.arquivado_em ? `arquivado em ${new Date(d.arquivado_em).toLocaleDateString("pt-BR")}` : "no quadro";

export function DuplicadoAviso({ itens, onAbrir }: { itens: Duplicado[]; onAbrir: (id: string) => void }) {
  if (!itens.length) return null;
  return (
    <div className="mx-3 mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Este edital parece já existir</p>
      <ul className="mt-1 space-y-1">
        {itens.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{d.titulo || d.numero_edital} · {situacao(d)}{d.motivo ? ` · ${d.motivo}` : ""}</span>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onAbrir(d.id)}>Abrir o existente</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DuplicadoConfirmar({ itens, onAbrir, onCriar, onFechar }: { itens: Duplicado[]; onAbrir: (id: string) => void; onCriar: () => void; onFechar: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Edital repetido?</DialogTitle>
          <DialogDescription>
            {BLOQUEAR_DUPLICADO ? "Este edital já está no Sigma. Abra o existente em vez de criar outro." : "Já existe um edital com este número para o mesmo órgão/cidade. Confira antes de criar outro card."}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {itens.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.titulo || d.numero_edital}</p>
                <p className="text-xs text-muted-foreground">{situacao(d)}{d.motivo ? ` · ${d.motivo}` : ""}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onAbrir(d.id)}>Abrir</Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Voltar</Button>
          {!BLOQUEAR_DUPLICADO && <Button variant="destructive" onClick={onCriar}>Criar mesmo assim</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
