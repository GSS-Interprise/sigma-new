import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VencimentosConfigDialog, seloValidade } from "./VencimentosConfigDialog";

/**
 * Vencimento dos documentos dos médicos (T13 de docs/arquitetura/licitacoes-contratos-gss.md).
 * Até 14/10 nenhum dos documentos tinha validade preenchida: aqui a equipe vê o que vence e
 * preenche a validade dos já enviados direto na lista. O robô vencimentos-alertas avisa.
 */
const TIPOS: Record<string, string> = {
  crm: "CRM", rqe: "RQE", certidao: "Certidão", certificado: "Certificado", titulo_especialista: "Título de especialista",
  diploma: "Diploma", rg: "RG", cpf: "CPF", comprovante_residencia: "Comprovante de residência", carta_recomendacao: "Carta de recomendação",
  contrato_aditivo: "Contrato/aditivo", outro: "Outro",
};
type Visao = "atencao" | "sem" | "todos";

export function MedicosVencimentosTab() {
  const qc = useQueryClient();
  const [visao, setVisao] = useState<Visao>("atencao");
  const [tipo, setTipo] = useState("todos");
  const [busca, setBusca] = useState("");
  const [avisos, setAvisos] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["medicos-vencimentos", visao, tipo],
    queryFn: async () => {
      let q = (supabase as any).from("medico_documentos")
        .select("id, arquivo_nome, arquivo_path, tipo_documento, data_validade, medico_id, medicos(nome_completo)")
        .neq("tipo_documento", "link_externo").limit(300);
      if (tipo !== "todos") q = q.eq("tipo_documento", tipo);
      if (visao === "atencao") {
        const lim = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
        q = q.not("data_validade", "is", null).lte("data_validade", lim).order("data_validade");
      } else if (visao === "sem") {
        q = q.is("data_validade", null).order("created_at", { ascending: false });
      } else {
        q = q.order("data_validade", { ascending: true, nullsFirst: false });
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const salvarValidade = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: string | null }) => {
      const { error } = await (supabase as any).from("medico_documentos").update({ data_validade: data }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Validade salva"); qc.invalidateQueries({ queryKey: ["medicos-vencimentos"] }); },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar"),
  });

  // os arquivos vêm de três jeitos (mesma regra da DocumentacaoTab): URL, "bucket/caminho" ou só caminho
  const abrir = async (d: any) => {
    const p: string = d.arquivo_path || "";
    if (!p) return;
    if (p.startsWith("http")) { window.open(p, "_blank"); return; }
    const conhecido = ["medicos-documentos", "lead-anexos", "medico-kanban-anexos"].find((b) => p.startsWith(`${b}/`));
    const tentativas = conhecido ? [[conhecido, p.slice(conhecido.length + 1)]] : [["medicos-documentos", p], ["lead-anexos", p]];
    for (const [bucket, caminho] of tentativas) {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(caminho, 600);
      if (data?.signedUrl) { window.open(data.signedUrl, "_blank"); return; }
    }
    toast.error("Não consegui abrir o arquivo");
  };

  const visiveis = docs.filter((d) => !busca || d.medicos?.nome_completo?.toLowerCase().includes(busca.toLowerCase()) || d.arquivo_nome?.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">Vencimento dos documentos dos médicos</h2>
          <p className="text-sm text-muted-foreground">CRM, RQE, certidões e o que mais tiver validade. Preencha a validade aqui mesmo; o Sigma avisa antes de vencer.</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => setAvisos(true)}><Bell className="h-4 w-4" /> Avisos</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={visao} onValueChange={(v) => setVisao(v as Visao)}>
          <SelectTrigger className="h-8 w-[230px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="atencao">Vencidos e vencendo (60 dias)</SelectItem>
            <SelectItem value="sem">Sem validade preenchida</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(TIPOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Médico ou arquivo" className="h-8 w-[220px]" />
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
            : !visiveis.length ? <p className="p-6 text-center text-sm text-muted-foreground">{visao === "atencao" ? "Nenhum documento vencido ou vencendo nos próximos 60 dias." : "Nada encontrado."}</p>
            : (
              <div className="divide-y">
                {visiveis.map((d) => {
                  const s = seloValidade(d.data_validade);
                  return (
                    <div key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-[220px] flex-1">
                        <p className="font-medium">{d.medicos?.nome_completo ?? "Médico"}</p>
                        <p className="truncate text-xs text-muted-foreground">{TIPOS[d.tipo_documento] ?? d.tipo_documento} · {d.arquivo_nome}</p>
                      </div>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.classe)}>{s.texto}</span>
                      <Input type="date" defaultValue={d.data_validade ?? ""} className="h-8 w-[150px]" title="Validade"
                        onBlur={(e) => { const v = e.target.value || null; if (v !== (d.data_validade ?? null)) salvarValidade.mutate({ id: d.id, data: v }); }} />
                      {d.arquivo_path && <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver arquivo" onClick={() => abrir(d)}><Eye className="h-4 w-4" /></Button>}
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>
      {docs.length >= 300 && <p className="text-xs text-muted-foreground">Mostrando os 300 primeiros. Use os filtros para achar o resto.</p>}
      {avisos && <VencimentosConfigDialog chave="medico_documentos" titulo="documentos dos médicos" onFechar={() => setAvisos(false)} />}
    </div>
  );
}
