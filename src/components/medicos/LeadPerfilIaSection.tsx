import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, RefreshCw, Phone, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leadId: string;
}

interface PerfilInteresse {
  lead_id: string;
  tipo_contratacao_preferida: string[] | null;
  modalidade_preferida: string[] | null;
  valor_minimo_aceitavel: number | null;
  valor_minimo_unidade: string | null;
  ufs: string[] | null;
  cidades: string[] | null;
  dias_preferidos: string[] | null;
  periodo_preferido: string | null;
  disponibilidade_plantoes_mes: number | null;
  observacoes_ia: string | null;
  ultima_extracao_em: string | null;
  extracao_fonte: string | null;
  confianca_score: number | null;
}

interface Contato {
  id: string;
  tipo: "whatsapp" | "email" | "telefone_fixo" | "linkedin" | "instagram";
  valor: string;
  is_primary: boolean;
  verified: boolean;
  ativo: boolean;
  origem: string | null;
  primeiro_contato_em: string | null;
  ultimo_contato_em: string | null;
  instance_detectada: string | null;
}

export function LeadPerfilIaSection({ leadId }: Props) {
  const qc = useQueryClient();
  const [extracting, setExtracting] = useState(false);

  const { data: perfil, isLoading: loadingPerfil } = useQuery({
    queryKey: ["lead-perfil-ia", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("banco_interesse_leads")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();
      return data as PerfilInteresse | null;
    },
  });

  const { data: contatos = [], isLoading: loadingContatos } = useQuery({
    queryKey: ["lead-contatos", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lead_contatos")
        .select("*")
        .eq("lead_id", leadId)
        .order("tipo", { ascending: true })
        .order("is_primary", { ascending: false });
      return (data || []) as Contato[];
    },
  });

  const mutExtrair = useMutation({
    mutationFn: async () => {
      setExtracting(true);
      const { data, error } = await supabase.functions.invoke("lead-perfil-extrator", {
        body: { lead_id: leadId, force: true },
      });
      if (error) throw new Error(error.message || "Falha na extração");
      if (data?.ok === false) throw new Error(data.error || data.reason || "Falha na extração");
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Perfil extraído (confiança ${data.confianca_score || 0}%)`);
      qc.invalidateQueries({ queryKey: ["lead-perfil-ia", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-timeline-unificado", leadId] });
      setExtracting(false);
    },
    onError: (e: any) => {
      toast.error("Erro: " + e.message);
      setExtracting(false);
    },
  });

  if (loadingPerfil && loadingContatos) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Perfil IA extraído */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-indigo-600" />
              Perfil extraído pela IA
              {perfil?.confianca_score != null && (
                <Badge variant="outline" className="text-xs">
                  confiança {perfil.confianca_score}%
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => mutExtrair.mutate()}
              disabled={extracting}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${extracting ? "animate-spin" : ""}`} />
              {extracting ? "Extraindo..." : perfil ? "Re-extrair" : "Extrair agora"}
            </Button>
          </div>
          {perfil?.ultima_extracao_em && (
            <p className="text-xs text-muted-foreground mt-1">
              Última extração: {format(new Date(perfil.ultima_extracao_em), "PPPp", { locale: ptBR })}
              {perfil.extracao_fonte && ` · ${perfil.extracao_fonte}`}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {!perfil ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum perfil extraído ainda.</p>
              <p className="text-xs mt-1">
                A IA precisa de pelo menos 4 interações do médico pra gerar um perfil. Clique em "Extrair agora" pra forçar.
              </p>
            </div>
          ) : (
            <>
              {perfil.observacoes_ia && (
                <div className="p-3 rounded bg-indigo-50/50 border border-indigo-100 text-sm">
                  <span className="text-xs uppercase font-semibold text-indigo-700">Resumo</span>
                  <p className="mt-1 text-foreground">{perfil.observacoes_ia}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <FieldBadges label="Modalidade preferida" values={perfil.modalidade_preferida} />
                <FieldBadges label="Contratação preferida" values={perfil.tipo_contratacao_preferida} />
                <FieldBadges label="UFs de interesse" values={perfil.ufs} />
                <FieldBadges label="Cidades mencionadas" values={perfil.cidades} />
                <FieldBadges label="Dias preferidos" values={perfil.dias_preferidos} />
                {perfil.periodo_preferido && (
                  <Field label="Período preferido" value={perfil.periodo_preferido} />
                )}
                {perfil.valor_minimo_aceitavel && (
                  <Field
                    label="Valor mínimo aceitável"
                    value={`R$ ${perfil.valor_minimo_aceitavel.toLocaleString("pt-BR")} / ${perfil.valor_minimo_unidade || "plantão"}`}
                  />
                )}
                {perfil.disponibilidade_plantoes_mes && (
                  <Field label="Disponibilidade" value={`~${perfil.disponibilidade_plantoes_mes} plantões/mês`} />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Contatos do lead */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Contatos ({contatos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {contatos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum contato cadastrado.</p>
          ) : (
            <div className="space-y-1.5">
              {contatos.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded border text-sm hover:bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.tipo === "whatsapp" && <Phone className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    {c.tipo === "email" && <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                    <span className="font-mono truncate">{c.valor}</span>
                    {c.is_primary && (
                      <Badge variant="outline" className="text-xs py-0 px-1.5 h-5">principal</Badge>
                    )}
                    {!c.ativo && (
                      <Badge variant="outline" className="text-xs py-0 px-1.5 h-5 bg-red-50 text-red-700 border-red-200">
                        inativo
                      </Badge>
                    )}
                    {c.verified && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 ml-2">
                    {c.origem === "webhook_auto" && "detectado por msg"}
                    {c.origem === "migracao_lote" && "importado"}
                    {c.origem === "manual_teste" && "manual"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <div className="text-xs uppercase font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm">{String(value)}</div>
    </div>
  );
}

function FieldBadges({ label, values }: { label: string; values: string[] | null | undefined }) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <div className="text-xs uppercase font-semibold text-muted-foreground mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => (
          <Badge key={i} variant="outline" className="text-xs font-normal">{v}</Badge>
        ))}
      </div>
    </div>
  );
}
