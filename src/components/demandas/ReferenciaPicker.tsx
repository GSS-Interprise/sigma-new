import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Gavel, FileText, UserSearch, MessageCircle, X } from "lucide-react";
import { getReferenciasPermitidas, ReferenciaTipo } from "@/lib/setoresAccess";
import { cn } from "@/lib/utils";

export interface RefSelection {
  licitacao_id?: string | null;
  contrato_id?: string | null;
  lead_id?: string | null;
  sigzap_conversation_id?: string | null;
}

interface Props {
  setorDestinoId: string | null;
  isAdmin?: boolean;
  value: RefSelection;
  onChange: (v: RefSelection) => void;
}

const TIPO_META: Record<
  ReferenciaTipo,
  { label: string; icon: any; field: keyof RefSelection }
> = {
  licitacao: { label: "Licitação", icon: Gavel, field: "licitacao_id" },
  contrato: { label: "Contrato", icon: FileText, field: "contrato_id" },
  lead: { label: "Lead", icon: UserSearch, field: "lead_id" },
  sigzap: { label: "Conversa SigZap", icon: MessageCircle, field: "sigzap_conversation_id" },
  campanha: { label: "Campanha", icon: MessageCircle, field: "sigzap_conversation_id" },
};

export function ReferenciaPicker({
  setorDestinoId,
  isAdmin,
  value,
  onChange,
}: Props) {
  const permitidas = getReferenciasPermitidas(setorDestinoId, isAdmin).filter(
    (t) => t !== "campanha",
  );
  const [tipoAtivo, setTipoAtivo] = useState<ReferenciaTipo | null>(null);
  const [search, setSearch] = useState("");

  const { data: results = [] } = useQuery({
    queryKey: ["ref-picker", tipoAtivo, search],
    enabled: !!tipoAtivo,
    queryFn: async () => {
      if (!tipoAtivo) return [];
      if (tipoAtivo === "licitacao") {
        const { data } = await supabase
          .from("licitacoes")
          .select("id, titulo, numero_edital, orgao")
          .or(
            `titulo.ilike.%${search}%,numero_edital.ilike.%${search}%,orgao.ilike.%${search}%`,
          )
          .limit(10);
        return (data || []).map((d: any) => ({
          id: d.id,
          label: d.titulo || d.numero_edital || "Licitação",
          sub: d.orgao,
        }));
      }
      if (tipoAtivo === "contrato") {
        const { data } = await supabase
          .from("contratos")
          .select("id, codigo_contrato, objeto_contrato")
          .or(
            `codigo_contrato.ilike.%${search}%,objeto_contrato.ilike.%${search}%`,
          )
          .limit(10);
        return (data || []).map((d: any) => ({
          id: d.id,
          label: d.codigo_contrato || "Contrato",
          sub: d.objeto_contrato,
        }));
      }
      if (tipoAtivo === "lead") {
        const { data } = await supabase
          .from("captacao_leads")
          .select("id, nome, especialidade, uf")
          .ilike("nome", `%${search}%`)
          .limit(10);
        return (data || []).map((d: any) => ({
          id: d.id,
          label: d.nome || "Lead",
          sub: [d.especialidade, d.uf].filter(Boolean).join(" • "),
        }));
      }
      if (tipoAtivo === "sigzap") {
        const { data } = await supabase
          .from("sigzap_conversations" as any)
          .select("id, contact_name, contact_phone")
          .or(
            `contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%`,
          )
          .limit(10);
        return (data || []).map((d: any) => ({
          id: d.id,
          label: d.contact_name || d.contact_phone || "Conversa",
          sub: d.contact_phone,
        }));
      }
      return [];
    },
  });

  if (!permitidas.length) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Esse setor não tem acesso a recursos vinculáveis.
      </div>
    );
  }

  const selected: { tipo: ReferenciaTipo; id: string }[] = [];
  permitidas.forEach((t) => {
    const id = value[TIPO_META[t].field];
    if (id) selected.push({ tipo: t, id: id as string });
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {permitidas.map((t) => {
          const meta = TIPO_META[t];
          const Icon = meta.icon;
          return (
            <Popover
              key={t}
              open={tipoAtivo === t}
              onOpenChange={(o) => {
                setTipoAtivo(o ? t : null);
                setSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn("h-7 text-xs gap-1")}
                >
                  <Icon className="h-3.5 w-3.5" />+ {meta.label}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <Input
                  autoFocus
                  placeholder={`Buscar ${meta.label.toLowerCase()}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 mb-2"
                />
                <div className="max-h-60 overflow-auto space-y-1">
                  {results.length === 0 && (
                    <div className="text-xs text-muted-foreground p-2">
                      Digite para buscar…
                    </div>
                  )}
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="w-full text-left p-2 rounded hover:bg-muted text-xs"
                      onClick={() => {
                        onChange({ ...value, [meta.field]: r.id });
                        setTipoAtivo(null);
                        setSearch("");
                      }}
                    >
                      <div className="font-medium">{r.label}</div>
                      {r.sub && (
                        <div className="text-muted-foreground text-[11px]">{r.sub}</div>
                      )}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(({ tipo }) => {
            const meta = TIPO_META[tipo];
            const Icon = meta.icon;
            return (
              <Badge key={tipo} variant="secondary" className="gap-1 pr-1">
                <Icon className="h-3 w-3" />
                {meta.label}
                <button
                  type="button"
                  onClick={() => onChange({ ...value, [meta.field]: null })}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
