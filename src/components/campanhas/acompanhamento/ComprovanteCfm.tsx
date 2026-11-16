import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

// Comprovante da situação no CFM, ao lado da "Validação equipe (processos)" do lead quente (Raul, 16/11/2026: a equipe
// tirava print da consulta do CFM; o Sigma já tem a situação). Vem da base pública do CFM importada no Sigma, por isso
// mostra a data da base: não é consulta do dia (a consulta ao vivo do CFM pede reCAPTCHA, que não burlamos).
// A base só traz médicos com situação Regular: quem não aparece nela pode estar cassado, suspenso ou com CRM errado.

type Registro = {
  crm: string | null;
  uf: string | null;
  cfm: null | {
    nome: string;
    situacao: string | null;
    especialidades: { nome: string; rqe: string | null }[];
    base_em: string | null;
  };
};

export function ComprovanteCfm({ leadId }: { leadId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["registro-profissional", leadId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("lead_registro_profissional", { p_lead_id: leadId });
      if (error) throw error;
      return data as Registro;
    },
  });

  if (isLoading) return <Skeleton className="h-14 w-full rounded-md" />;
  if (isError || !data) return <p className="text-xs text-muted-foreground">Não foi possível ler o CFM agora.</p>;

  const linkCfm = "https://portal.cfm.org.br/busca-medicos";
  if (!data.crm) {
    return (
      <Aviso texto="Médico sem CRM no cadastro: preencha o CRM na ficha para conferir no CFM." link={linkCfm} />
    );
  }
  if (!data.cfm) {
    return (
      <Aviso texto={`CRM ${data.crm}/${data.uf ?? "?"} não está na base do CFM (só traz médicos regulares). Confira no CFM: pode estar cassado, suspenso ou com o CRM errado.`} link={linkCfm} />
    );
  }

  const base = data.cfm.base_em ? format(new Date(data.cfm.base_em), "MMM/yyyy", { locale: ptBR }) : null;
  const esp = data.cfm.especialidades
    .map((e) => (e.rqe ? `${e.nome} (RQE ${e.rqe})` : e.nome))
    .join(" · ");
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-950">
      <p className="flex items-center gap-1.5 font-semibold">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
        CFM: {data.cfm.situacao ?? "sem situação"} · CRM {data.crm}/{data.uf}
      </p>
      {esp && <p className="mt-0.5 break-words text-emerald-900/80">{esp}</p>}
      <p className="mt-0.5 text-emerald-900/70">
        Fonte: base pública do CFM{base ? `, atualizada em ${base}` : ""}.{" "}
        <a href={linkCfm} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
          Conferir no CFM <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}

function Aviso({ texto, link }: { texto: string; link: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="flex items-start gap-1.5">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {texto}{" "}
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
            Abrir o CFM <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      </p>
    </div>
  );
}
