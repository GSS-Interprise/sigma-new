import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, Phone, MapPin, Stethoscope, AlertCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  especialidadeIds: string[];
  uf: string;
  poolCount?: number;
}

interface LeadPreview {
  id: string;
  nome: string;
  phone_e164: string | null;
  uf: string | null;
  cidade: string | null;
  classificacao: string | null;
  cooldown_ate: string | null;
  opt_out: boolean | null;
  especialidade_nome?: string | null;
}

const PAGE_SIZE = 100;

/**
 * F2.2 — Modal "Ver lista de leads" da campanha.
 *
 * Aparece quando operadora clica no badge "~X leads disponíveis" no wizard.
 * Lista o pool real com paginação e busca por nome/telefone, pra a operadora
 * conferir antes de confirmar a campanha. Aplica os mesmos filtros do RPC
 * selecionar_leads_campanha (merged_into_id, phone vazio, classificacao,
 * cooldown, opt_out) pra que o que aparece aqui = o que vai disparar.
 */
export function PreviewLeadsCampanhaModal({
  open,
  onOpenChange,
  especialidadeIds,
  uf,
  poolCount,
}: Props) {
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery<LeadPreview[]>({
    queryKey: ["preview-leads-campanha", especialidadeIds.join(","), uf, page, busca],
    enabled: open,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      // Mesma lógica de filtros do poolCount no wizard
      if (especialidadeIds.length > 0) {
        let q = (supabase as any)
          .from("lead_especialidades")
          .select(
            "lead_id, leads!inner(id, nome, phone_e164, uf, cidade, classificacao, cooldown_ate, opt_out), especialidades!inner(nome)"
          )
          .in("especialidade_id", especialidadeIds)
          .is("leads.merged_into_id", null)
          .not("leads.phone_e164", "is", null)
          .neq("leads.phone_e164", "")
          .eq("leads.opt_out", false)
          .not("leads.classificacao", "in", "(protegido,proibido)")
          .or(`cooldown_ate.is.null,cooldown_ate.lt.${nowIso}`, { foreignTable: "leads" })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (uf) q = q.eq("leads.uf", uf);
        if (busca.trim()) {
          q = q.or(`nome.ilike.%${busca}%,phone_e164.ilike.%${busca}%`, {
            foreignTable: "leads",
          });
        }
        const { data: rows } = await q;
        return (rows || []).map((r: any) => ({
          id: r.leads.id,
          nome: r.leads.nome,
          phone_e164: r.leads.phone_e164,
          uf: r.leads.uf,
          cidade: r.leads.cidade,
          classificacao: r.leads.classificacao,
          cooldown_ate: r.leads.cooldown_ate,
          opt_out: r.leads.opt_out,
          especialidade_nome: r.especialidades?.nome,
        }));
      }
      // Sem especialidade — query direto em leads
      let q = supabase
        .from("leads")
        .select("id, nome, phone_e164, uf, cidade, classificacao, cooldown_ate, opt_out")
        .is("merged_into_id", null)
        .not("phone_e164", "is", null)
        .neq("phone_e164", "")
        .not("classificacao", "in", "(protegido,proibido)")
        .or(`cooldown_ate.is.null,cooldown_ate.lt.${nowIso}`)
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (uf) q = q.eq("uf", uf);
      if (busca.trim()) q = q.or(`nome.ilike.%${busca}%,phone_e164.ilike.%${busca}%`);
      const { data: rows } = await q;
      return (rows || []) as LeadPreview[];
    },
  });

  const leads = data || [];
  const temMaisPaginas = leads.length === PAGE_SIZE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Quem vai receber a campanha
          </DialogTitle>
          <DialogDescription>
            {poolCount !== undefined ? (
              <>
                <span className="font-semibold text-foreground">
                  {poolCount.toLocaleString("pt-BR")} médicos
                </span>{" "}
                no pool. Confira a lista antes de criar a campanha.
              </>
            ) : (
              "Confira os médicos que entram no pool antes de criar."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {busca
                  ? "Nenhum médico encontrado pra essa busca"
                  : "Sem médicos no pool com esses filtros"}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {leads.map((lead) => (
                <li key={lead.id} className="py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{lead.nome}</p>
                      {lead.classificacao && lead.classificacao !== "normal" && (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {lead.classificacao}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {lead.phone_e164 && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.phone_e164}
                        </span>
                      )}
                      {(lead.cidade || lead.uf) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[lead.cidade, lead.uf].filter(Boolean).join("/")}
                        </span>
                      )}
                      {lead.especialidade_nome && (
                        <span className="flex items-center gap-1">
                          <Stethoscope className="h-3 w-3" />
                          {lead.especialidade_nome}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + leads.length}
            {poolCount !== undefined && ` de ${poolCount.toLocaleString("pt-BR")}`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!temMaisPaginas}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
