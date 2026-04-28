import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ModuloChave = "licitacoes" | "contratos" | "disparos" | "sigzap" | null;

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Quando definido, restringe a quem tem permissão `visualizar` no módulo. null = todo mundo. */
  modulo?: ModuloChave;
  placeholder?: string;
  /** Excluir o próprio usuário da lista (default true) */
  excludeSelf?: boolean;
  className?: string;
}

function initialsOf(name?: string | null) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export function PessoasCombobox({
  value,
  onChange,
  modulo = null,
  placeholder = "Marcar pessoas…",
  excludeSelf = true,
  className,
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: pessoas = [] } = useQuery({
    queryKey: ["pessoas-combobox", modulo],
    queryFn: async () => {
      if (!modulo) {
        const { data } = await supabase
          .from("profiles")
          .select("id, nome_completo, setor_id")
          .order("nome_completo");
        return (data || []).filter((p: any) =>
          excludeSelf ? p.id !== user?.id : true,
        );
      }
      const { data: perms } = await supabase
        .from("permissoes")
        .select("perfil")
        .eq("modulo", modulo)
        .eq("acao", "visualizar")
        .eq("ativo", true);
      const perfis = Array.from(new Set((perms || []).map((p: any) => p.perfil)));
      if (!perfis.includes("admin")) perfis.push("admin");
      if (!perfis.length) return [];
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", perfis as any);
      const ids = Array.from(
        new Set((roleRows || []).map((r: any) => r.user_id)),
      ).filter((id) => (excludeSelf ? id !== user?.id : true));
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome_completo, setor_id")
        .in("id", ids)
        .order("nome_completo");
      return profs || [];
    },
  });

  const byId = useMemo(
    () => new Map((pessoas as any[]).map((p) => [p.id, p])),
    [pessoas],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return pessoas as any[];
    return (pessoas as any[]).filter((p) =>
      (p.nome_completo || "").toLowerCase().includes(s),
    );
  }, [pessoas, search]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {value.map((id) => {
            const p: any = byId.get(id);
            return (
              <Badge
                key={id}
                variant="secondary"
                className="gap-1.5 pr-1 pl-1 py-0.5"
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={p?.avatar_url || undefined} />
                  <AvatarFallback className="text-[9px]">
                    {initialsOf(p?.nome_completo)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs">{p?.nome_completo || "…"}</span>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="hover:text-destructive ml-0.5"
                  aria-label="Remover"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 transition"
          >
            <UserPlus className="h-4 w-4" />
            <span>{value.length ? "Adicionar mais pessoas" : placeholder}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome…"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground px-3 py-6 text-center">
                Nenhuma pessoa encontrada.
              </div>
            )}
            {filtered.map((p: any) => {
              const checked = value.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted text-sm",
                    checked && "bg-primary/5",
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={p.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {initialsOf(p.nome_completo)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{p.nome_completo}</span>
                  {checked && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
