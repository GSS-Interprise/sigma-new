import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Megaphone, Send, Loader2, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { TrafegoPagoFunilRelatorio } from "./TrafegoPagoFunilRelatorio";

interface Props {
  campanhaPropostaId: string;
}

interface LeadRow {
  id: string;
  nome: string | null;
  phone_e164: string | null;
  email: string | null;
  especialidade: string | null;
  uf: string | null;
  cidade: string | null;
}

export function SegmentoTrafegoPago({ campanhaPropostaId }: Props) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["trafego-pago-leads", campanhaPropostaId],
    queryFn: async () => {
      const { data: cp, error: cpErr } = await supabase
        .from("campanha_propostas")
        .select("lista_id")
        .eq("id", campanhaPropostaId)
        .maybeSingle();
      if (cpErr) throw cpErr;
      if (!cp?.lista_id) return [] as LeadRow[];
      const { data, error } = await supabase
        .from("disparo_lista_itens")
        .select("leads:lead_id(id, nome, phone_e164, email, especialidade, uf, cidade)")
        .eq("lista_id", cp.lista_id);
      if (error) throw error;
      const map = new Map<string, LeadRow>();
      (data || []).forEach((i: any) => {
        const l = i.leads;
        if (l?.id) map.set(l.id, l);
      });
      return Array.from(map.values());
    },
  });

  const todosSelecionados = useMemo(
    () => leads.length > 0 && selecionados.size === leads.length,
    [leads, selecionados]
  );

  const toggleTodos = () => {
    if (todosSelecionados) setSelecionados(new Set());
    else setSelecionados(new Set(leads.map((l) => l.id)));
  };

  const toggleUm = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enviar = async () => {
    const payload = leads
      .filter((l) => selecionados.has(l.id))
      .map((l) => ({
        id: l.id,
        nome: l.nome,
        telefone: l.phone_e164,
        email: l.email,
        especialidade: l.especialidade,
        uf: l.uf,
        cidade: l.cidade,
      }));
    if (!payload.length) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("trafego-pago-enviar-xlsx", {
        body: { campanha_proposta_id: campanhaPropostaId, leads: payload },
      });
      if (error) throw error;
      if (!data?.success) throw new Error("Webhook retornou erro");
      toast.success(`XLSX enviado com ${payload.length} leads`);
      setSelecionados(new Set());
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
    <TrafegoPagoFunilRelatorio campanhaPropostaId={campanhaPropostaId} />
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Tráfego Pago
        </CardTitle>
        <CardDescription>
          Selecione os leads e envie como XLSX para o webhook
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum lead disponível. Vincule uma lista a esta proposta.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={todosSelecionados} onCheckedChange={toggleTodos} />
                <span>Selecionar todos ({leads.length})</span>
              </label>
              <span className="text-muted-foreground">
                {selecionados.size} selecionado(s)
              </span>
            </div>
            <div className="border rounded max-h-80 overflow-auto divide-y">
              {leads.map((l) => (
                <label
                  key={l.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selecionados.has(l.id)}
                    onCheckedChange={() => toggleUm(l.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.nome || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {l.phone_e164 || "sem telefone"}
                      {l.especialidade ? ` · ${l.especialidade}` : ""}
                      {l.uf ? ` · ${l.uf}` : ""}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {selecionados.size > 0 && (
              <Button onClick={enviar} disabled={enviando} className="w-full" size="sm">
                {enviando ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    <Send className="h-4 w-4 mr-2" />
                  </>
                )}
                Enviar {selecionados.size} lead(s) como XLSX
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
