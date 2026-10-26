import { useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "financeiro-anexos";
const limpar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Baixa num .zip todas as notas fiscais recebidas na competência, uma pasta por mês (Mavi, 26/10): a
 * contabilidade pede as notas do mês e o Conta Azul não recebe anexo pela API. Arquivo por médico:
 * "Nome - NF 123.pdf". Só entra nota recebida (arquivo guardado no Sigma).
 */
export function BaixarNotasMesButton({ mes, ano }: { mes: number; ano: number }) {
  const [baixando, setBaixando] = useState(false);

  const baixar = async () => {
    setBaixando(true);
    try {
      const { data, error } = await (supabase as any).from("financeiro_pagamentos")
        .select("profissional_nome, nf_numero, nf_arquivo_path")
        .eq("mes_referencia", mes).eq("ano_referencia", ano).not("nf_arquivo_path", "is", null)
        .order("profissional_nome");
      if (error) throw error;
      const notas = (data ?? []) as Array<{ profissional_nome: string | null; nf_numero: string | null; nf_arquivo_path: string }>;
      if (!notas.length) { toast.info("Nenhuma nota recebida nesta competência."); return; }

      const pasta = `Notas fiscais ${String(mes).padStart(2, "0")}-${ano}`;
      const zip = new JSZip();
      const usados = new Set<string>();
      let falhas = 0;
      for (const n of notas) {
        const { data: blob, error: e } = await supabase.storage.from(BUCKET).download(n.nf_arquivo_path);
        if (e || !blob) { falhas++; continue; }
        const ext = (n.nf_arquivo_path.split(".").pop() || "pdf").toLowerCase().slice(0, 5);
        const base = `${limpar(n.profissional_nome || "Médico")} - NF ${limpar(n.nf_numero || "sem número")}`;
        let nome = `${base}.${ext}`;
        for (let i = 2; usados.has(nome); i++) nome = `${base} (${i}).${ext}`;
        usados.add(nome);
        zip.file(`${pasta}/${nome}`, blob);
      }
      const arquivo = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement("a");
      a.href = url; a.download = `${pasta}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`${notas.length - falhas} nota(s) baixada(s)${falhas ? `; ${falhas} não puderam ser lidas` : ""}.`);
    } catch (e: any) {
      toast.error("Erro ao baixar as notas: " + (e?.message || ""));
    } finally {
      setBaixando(false);
    }
  };

  return (
    <Button size="sm" variant="outline" className="h-9 gap-1.5 shrink-0" onClick={baixar} disabled={baixando}
      title="Baixa todas as notas recebidas desta competência num arquivo .zip">
      {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Baixar notas do mês
    </Button>
  );
}
