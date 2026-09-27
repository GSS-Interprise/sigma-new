import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { renderEmail, aplicarVariaveis, type EmailConteudo } from "@/lib/emailMarketing";

/**
 * Editor do e-mail marketing. A equipe não escreve HTML: preenche assunto, título,
 * mensagem e botão; layout, rodapé legal e descadastro são sempre os mesmos. A prévia
 * ao lado é o HTML real que vai sair (mesmo modelo do envio, src/lib/emailMarketing.ts).
 */
export type EmailRascunho = EmailConteudo & { assunto: string; remetente_nome: string };

const VARIAVEIS = [
  { v: "{{primeiro_nome}}", d: "primeiro nome" },
  { v: "{{nome}}", d: "nome completo" },
  { v: "{{especialidade}}", d: "especialidade" },
  { v: "{{cidade}}", d: "cidade" },
  { v: "{{uf}}", d: "estado" },
];
const EXEMPLO = { nome: "Dra. Marina Souza", especialidade: "Pediatria", cidade: "Itajaí", uf: "SC" };

export function EmailComposer({
  valor, onChange, campanhaId, desabilitado = false,
}: { valor: EmailRascunho; onChange: (v: EmailRascunho) => void; campanhaId: string; desabilitado?: boolean }) {
  const [testePara, setTestePara] = useState("");
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const set = (campo: keyof EmailRascunho, v: string) => onChange({ ...valor, [campo]: v });

  const previa = useMemo(() => renderEmail(valor, EXEMPLO, "#").html, [valor]);

  const enviarTeste = async () => {
    const para = testePara.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!para.length) return toast.error("Informe ao menos um e-mail para o teste.");
    setEnviandoTeste(true);
    const { data, error } = await supabase.functions.invoke("email-campanha", {
      body: {
        acao: "teste", campanha_id: campanhaId, para,
        assunto: valor.assunto, remetente_nome: valor.remetente_nome,
        conteudo: { titulo: valor.titulo, mensagem: valor.mensagem, botao_texto: valor.botao_texto, botao_link: valor.botao_link },
      },
    });
    setEnviandoTeste(false);
    const r = data as any;
    if (error || !r?.ok) return toast.error("Teste não enviado: " + (error?.message || r?.error || r?.erro || ""));
    toast.success(`Teste enviado para ${r.enviados} endereço(s)${r.exemplo_com ? `, com os dados de ${r.exemplo_com}` : ""}.`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Assunto</Label>
            <Input value={valor.assunto} disabled={desabilitado} onChange={(e) => set("assunto", e.target.value)}
              placeholder="Vaga de {{especialidade}} em {{cidade}}" />
          </div>
          <div>
            <Label className="text-xs">Nome do remetente</Label>
            <Input value={valor.remetente_nome} disabled={desabilitado} onChange={(e) => set("remetente_nome", e.target.value)}
              placeholder="GSS Saúde · Vagas" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Título</Label>
          <Input value={valor.titulo ?? ""} disabled={desabilitado} onChange={(e) => set("titulo", e.target.value)}
            placeholder="Plantões de {{especialidade}} abertos" />
        </div>
        <div>
          <Label className="text-xs">Mensagem</Label>
          <Textarea rows={8} value={valor.mensagem ?? ""} disabled={desabilitado} onChange={(e) => set("mensagem", e.target.value)}
            placeholder={"Olá, {{primeiro_nome}}!\n\nEstamos com plantões de **{{especialidade}}** em {{cidade}}.\n\nLinha em branco separa parágrafos; **texto** fica em negrito."} />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {VARIAVEIS.map((x) => (
              <button key={x.v} type="button" disabled={desabilitado} title={`Insere ${x.d}`}
                onClick={() => set("mensagem", `${valor.mensagem ?? ""}${x.v}`)}
                className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted font-mono">
                {x.v}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Texto do botão (opcional)</Label>
            <Input value={valor.botao_texto ?? ""} disabled={desabilitado} onChange={(e) => set("botao_texto", e.target.value)}
              placeholder="Quero saber mais" />
          </div>
          <div>
            <Label className="text-xs">Link do botão</Label>
            <Input value={valor.botao_link ?? ""} disabled={desabilitado} onChange={(e) => set("botao_link", e.target.value)}
              placeholder="https://wa.me/55479..." />
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <Label className="text-xs">Enviar teste para</Label>
          <div className="flex gap-2">
            <Input value={testePara} onChange={(e) => setTestePara(e.target.value)} placeholder="voce@gestaoservicosaude.com.br, mavi@…" />
            <Button type="button" variant="outline" className="gap-1.5 shrink-0" disabled={enviandoTeste} onClick={enviarTeste}>
              {enviandoTeste ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Testar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            O teste sai com os dados de um médico do público desta campanha e com "[TESTE]" no assunto.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          Prévia · <span className="text-foreground">{aplicarVariaveis(valor.assunto || "(sem assunto)", EXEMPLO)}</span>
        </p>
        <iframe title="Prévia do e-mail" srcDoc={previa}
          className="w-full h-[520px] rounded-md border bg-[#eef1f5]" sandbox="" />
      </div>
    </div>
  );
}
