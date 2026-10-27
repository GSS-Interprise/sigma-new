import { useMemo, useState } from "react";
import { Plus, X, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import {
  EspecialidadeRqe,
  formatarEspecialidade,
  lerRqeDoTexto,
  linhaIncompleta,
  rqeSoNumero,
} from "@/lib/especialidades";

interface Props {
  value: EspecialidadeRqe[];
  onChange: (value: EspecialidadeRqe[]) => void;
  // Texto antigo da planilha/CFM (leads.rqe). Só aparece quando ainda falta algo, para a
  // equipe copiar o número sem abrir outro lugar.
  textoAntigo?: string | null;
}

// Cada especialidade do médico pede o número do RQE dela (pedido da Bianca, 27/10/2026).
// Generalista ou clínico sem residência marca "Sem RQE".
export function EspecialidadesRqeEditor({ value, onChange, textoAntigo }: Props) {
  const [open, setOpen] = useState(false);
  const { data: catalogo = [], isLoading } = useEspecialidades();

  const escolhidas = useMemo(() => new Set(value.map((v) => v.especialidade_id)), [value]);
  const faltando = value.filter(linhaIncompleta).length;

  // Pares do texto antigo que ainda não estão na lista ou estão sem número
  const sugeridos = useMemo(() => {
    if (!textoAntigo) return [];
    return lerRqeDoTexto(textoAntigo, catalogo).filter((p) => {
      const atual = value.find((v) => v.especialidade_id === p.especialidade_id);
      return !atual || linhaIncompleta(atual);
    });
  }, [textoAntigo, catalogo, value]);

  const atualizar = (id: string, campos: Partial<EspecialidadeRqe>) =>
    onChange(value.map((v) => (v.especialidade_id === id ? { ...v, ...campos } : v)));

  const adicionar = (e: { id: string; nome: string }) => {
    if (!escolhidas.has(e.id)) {
      onChange([...value, { especialidade_id: e.id, nome: e.nome, rqe: "", sem_rqe: false }]);
    }
    setOpen(false);
  };

  const usarTexto = () => {
    const porId = new Map(value.map((v) => [v.especialidade_id, v]));
    sugeridos.forEach((s) => porId.set(s.especialidade_id, s));
    onChange(Array.from(porId.values()));
  };

  const mostrarTextoAntigo = !!textoAntigo?.trim() && (value.length === 0 || faltando > 0);

  return (
    <div className="space-y-2 min-w-0">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma especialidade cadastrada.</p>
      )}

      <ul className="space-y-1.5">
        {value.map((linha) => {
          const incompleta = linhaIncompleta(linha);
          return (
            <li
              key={linha.especialidade_id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border bg-background px-2.5 py-1.5",
                incompleta && "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20",
              )}
            >
              <span className="min-w-0 flex-1 basis-40 text-sm font-medium break-words">
                {formatarEspecialidade(linha.nome)}
              </span>
              <div className="flex items-center gap-3">
                <Input
                  aria-label={`Número do RQE de ${formatarEspecialidade(linha.nome)}`}
                  inputMode="numeric"
                  placeholder="Nº do RQE"
                  value={linha.sem_rqe ? "" : linha.rqe}
                  disabled={linha.sem_rqe}
                  onChange={(e) => atualizar(linha.especialidade_id, { rqe: rqeSoNumero(e.target.value) })}
                  className={cn("h-8 w-28", incompleta && "border-amber-400")}
                />
                <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                  <Checkbox
                    checked={linha.sem_rqe}
                    onCheckedChange={(c) =>
                      atualizar(linha.especialidade_id, { sem_rqe: c === true, rqe: c === true ? "" : linha.rqe })
                    }
                  />
                  Sem RQE (generalista)
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label={`Tirar ${formatarEspecialidade(linha.nome)}`}
                  onClick={() => onChange(value.filter((v) => v.especialidade_id !== linha.especialidade_id))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {faltando > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {faltando === 1
            ? "1 especialidade sem RQE: informe o número ou marque Sem RQE."
            : `${faltando} especialidades sem RQE: informe o número ou marque Sem RQE.`}
        </p>
      )}

      {mostrarTextoAntigo && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 break-words">Texto antigo: {textoAntigo}</span>
          {sugeridos.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={usarTexto}>
              <Wand2 className="h-3 w-3" />
              Preencher do texto
            </Button>
          )}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Adicionar especialidade
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(320px,calc(100vw-32px))] p-0 bg-popover" align="start">
          <Command>
            <CommandInput placeholder="Buscar especialidade..." />
            <CommandList>
              <CommandEmpty>{isLoading ? "Carregando..." : "Nenhuma especialidade encontrada."}</CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto">
                {catalogo
                  .filter((e) => !escolhidas.has(e.id))
                  .map((e) => (
                    <CommandItem key={e.id} value={e.nome} onSelect={() => adicionar(e)}>
                      {formatarEspecialidade(e.nome)}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
