import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, RefreshCw, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { format } from "date-fns";

interface ClienteImportacoesProps {
  clienteSlug: string;
}

export function ClienteImportacoes({ clienteSlug }: ClienteImportacoesProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);

  // Fetch cliente ID by slug
  const { data: cliente } = useQuery({
    queryKey: ["bi-cliente", clienteSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bi_clientes")
        .select("id, nome")
        .eq("slug", clienteSlug)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch imports
  const { data: imports, isLoading } = useQuery({
    queryKey: ["bi-client-imports", cliente?.id],
    queryFn: async () => {
      if (!cliente?.id) return [];
      const { data, error } = await supabase
        .from("bi_client_imports")
        .select("*")
        .eq("cliente_id", cliente.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!cliente?.id,
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      setPreview(jsonData.slice(0, 5));
    } catch {
      toast.error("Erro ao ler arquivo");
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file || !cliente?.id) throw new Error("Dados insuficientes");

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      if (jsonData.length === 0) throw new Error("Arquivo vazio");

      // Create import record
      const { data: importRecord, error: importError } = await supabase
        .from("bi_client_imports")
        .insert({
          cliente_id: cliente.id,
          arquivo_nome: file.name,
          total_registros: jsonData.length,
          status: "processando",
        })
        .select()
        .single();

      if (importError) throw importError;

      // Insert rows into staging
      let errorCount = 0;
      const rows = jsonData.map((row: any, index: number) => {
        const errors: string[] = [];
        // Basic validation
        if (!row.nome && !row.Nome) errors.push("Campo 'nome' obrigatório");

        const hasError = errors.length > 0;
        if (hasError) errorCount++;

        return {
          import_id: importRecord.id,
          linha_numero: index + 2, // +2 because row 1 is header
          dados: row,
          status: hasError ? "erro" : "processado",
          erro_mensagem: hasError ? errors.join("; ") : null,
        };
      });

      // Insert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("bi_client_import_rows").insert(batch);
        if (error) throw error;
      }

      // Update import status
      await supabase
        .from("bi_client_imports")
        .update({
          status: errorCount > 0 ? "processado_com_erros" : "processado",
          total_erros: errorCount,
        })
        .eq("id", importRecord.id);

      return { total: jsonData.length, erros: errorCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["bi-client-imports"] });
      toast.success(
        `${result.total} registros importados${result.erros > 0 ? ` (${result.erros} com erro)` : ""}`
      );
      setDialogOpen(false);
      setFile(null);
      setPreview([]);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao importar");
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async (importId: string) => {
      // Reset error rows to pending
      const { error } = await supabase
        .from("bi_client_import_rows")
        .update({ status: "pendente", erro_mensagem: null })
        .eq("import_id", importId)
        .eq("status", "erro");
      if (error) throw error;

      await supabase
        .from("bi_client_imports")
        .update({ status: "reprocessando" })
        .eq("id", importId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bi-client-imports"] });
      toast.success("Reprocessamento iniciado");
    },
  });

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pendente: { label: "Pendente", variant: "outline" },
      processando: { label: "Processando", variant: "secondary" },
      processado: { label: "Processado", variant: "default" },
      processado_com_erros: { label: "Com Erros", variant: "destructive" },
      reprocessando: { label: "Reprocessando", variant: "secondary" },
    };
    const info = map[status] || { label: status, variant: "outline" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Importações</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Importar CSV
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Importar Arquivo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Arquivo CSV / Excel</Label>
                <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
                <p className="text-xs text-muted-foreground mt-1">
                  O arquivo deve conter ao menos a coluna "nome"
                </p>
              </div>

              {preview.length > 0 && (
                <div>
                  <Label>Preview (5 primeiros registros)</Label>
                  <div className="mt-2 border rounded p-2 text-xs max-h-40 overflow-auto">
                    {preview.map((row, i) => (
                      <div key={i} className="py-1 border-b last:border-0 truncate">
                        {JSON.stringify(row).slice(0, 120)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Histórico de Importações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !imports?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação realizada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Registros</TableHead>
                  <TableHead>Erros</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell className="font-medium">{imp.arquivo_nome}</TableCell>
                    <TableCell>
                      {format(new Date(imp.created_at), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>{imp.total_registros}</TableCell>
                    <TableCell>{imp.total_erros}</TableCell>
                    <TableCell>{statusBadge(imp.status)}</TableCell>
                    <TableCell>
                      {imp.total_erros > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => reprocessMutation.mutate(imp.id)}
                          disabled={reprocessMutation.isPending}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Reprocessar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
