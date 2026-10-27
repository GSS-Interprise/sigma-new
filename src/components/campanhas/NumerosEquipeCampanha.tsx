import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Quais números da equipe trabalham esta lista. Mensagem que sai do celular de um deles para
// um médico da campanha conta como disparo dela (regra no banco: registrar_contato_equipe).
type Numero = { phone_number_id: string; phone_e164: string | null; display_name: string | null; dono: string | null };

export function NumerosEquipeCampanha({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: numeros = [], isLoading } = useQuery({
    queryKey: ["numeros-equipe-campanha"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_chakra_connections" as never)
        .select("phone_number_id, phone_e164, display_name, responsavel:responsavel_id(nome_completo)")
        .order("phone_e164");
      if (error) throw error;
      return ((data || []) as unknown as Array<Numero & { responsavel: { nome_completo: string | null } | null }>)
        .map((n) => ({ ...n, dono: n.responsavel?.nome_completo ?? null }));
    },
  });

  const alternar = (id: string, marcado: boolean) =>
    onChange(marcado ? [...new Set([...value, id])] : value.filter((v) => v !== id));

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm">Números da equipe nesta campanha</Label>
        <p className="text-xs text-muted-foreground">
          Mensagem do celular desses números para um médico da lista conta como disparo da campanha.
        </p>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando números…</p>
      ) : numeros.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Nenhum número conectado. Conecte em Configurações → WhatsApp API.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {numeros.map((n) => {
            const marcado = value.includes(n.phone_number_id);
            return (
              <label key={n.phone_number_id}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-2.5 ${marcado ? "border-emerald-400 bg-emerald-50/60" : ""}`}>
                <Checkbox checked={marcado} onCheckedChange={(c) => alternar(n.phone_number_id, c === true)} />
                <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{n.dono || n.display_name || n.phone_e164}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {n.phone_e164}{!n.dono && " · sem dono definido"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
