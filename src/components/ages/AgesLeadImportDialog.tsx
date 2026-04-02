import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface AgesLeadImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AgesLeadImportDialog = ({ open, onOpenChange }: AgesLeadImportDialogProps) => {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      setPreview(jsonData.slice(0, 5));
    } catch (error) {
      console.error(error);
      toast.error("Erro ao ler arquivo");
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Nenhum arquivo selecionado");

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      const leads = jsonData.map((row: any) => ({
        nome: row.nome || row.Nome || "",
        profissao: row.profissao || row.Profissao || row.Profissão || null,
        telefone: row.telefone || row.Telefone || null,
        email: row.email || row.Email || null,
        cidade: row.cidade || row.Cidade || null,
        uf: row.uf || row.UF || null,
        origem: row.origem || row.Origem || "Importação Excel",
        status: "novo",
      })).filter((l: any) => l.nome);

      if (leads.length === 0) {
        throw new Error("Nenhum lead válido encontrado");
      }

      const { error } = await supabase.from("ages_leads").insert(leads);
      if (error) throw error;

      return leads.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["ages-leads"] });
      toast.success(`${count} leads importados com sucesso`);
      onOpenChange(false);
      setFile(null);
      setPreview([]);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao importar");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Arquivo Excel/CSV</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground mt-1">
              O arquivo deve conter as colunas: nome, profissao, telefone, email, cidade, uf, origem
            </p>
          </div>

          {preview.length > 0 && (
            <div>
              <Label>Preview (primeiros 5 registros)</Label>
              <div className="mt-2 border rounded p-2 text-xs max-h-40 overflow-auto">
                {preview.map((row, i) => (
                  <div key={i} className="py-1 border-b last:border-0">
                    {row.nome || row.Nome} - {row.profissao || row.Profissao || row.Profissão || "N/A"}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || !file}
            >
              {importMutation.isPending ? "Importando..." : "Importar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgesLeadImportDialog;
