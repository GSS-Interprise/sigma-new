import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface ClienteLogsImportacaoProps {
  clienteSlug: string;
}

export function ClienteLogsImportacao({ clienteSlug }: ClienteLogsImportacaoProps) {
  const [selectedImport, setSelectedImport] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("erro");

  // Fetch cliente
  const { data: cliente } = useQuery({
    queryKey: ["bi-cliente", clienteSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bi_clientes")
        .select("id")
        .eq("slug", clienteSlug)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch imports for filter dropdown
  const { data: imports } = useQuery({
    queryKey: ["bi-client-imports-list", cliente?.id],
    queryFn: async () => {
      if (!cliente?.id) return [];
      const { data, error } = await supabase
        .from("bi_client_imports")
        .select("id, arquivo_nome, created_at")
        .eq("cliente_id", cliente.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!cliente?.id,
  });

  // Fetch rows with errors
  const { data: rows, isLoading } = useQuery({
    queryKey: ["bi-client-import-rows", selectedImport, statusFilter, cliente?.id],
    queryFn: async () => {
      if (!cliente?.id) return [];

      let importIds: string[] = [];

      if (selectedImport === "all") {
        if (!imports?.length) return [];
        importIds = imports.map((i) => i.id);
      } else {
        importIds = [selectedImport];
      }

      let query = supabase
        .from("bi_client_import_rows")
        .select("*")
        .in("import_id", importIds)
        .order("linha_numero", { ascending: true })
        .limit(200);

      if (statusFilter !== "todos") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!cliente?.id,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Importação</label>
          <Select value={selectedImport} onValueChange={setSelectedImport}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as importações</SelectItem>
              {imports?.map((imp) => (
                <SelectItem key={imp.id} value={imp.id}>
                  {imp.arquivo_nome} — {format(new Date(imp.created_at), "dd/MM")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="erro">Erros</SelectItem>
              <SelectItem value="processado">Processados</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Logs por Linha
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !rows?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Linha</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Dados (resumo)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">{row.linha_numero}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "erro"
                              ? "destructive"
                              : row.status === "processado"
                              ? "default"
                              : "outline"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-destructive max-w-xs truncate">
                        {row.erro_mensagem || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-sm truncate font-mono">
                        {JSON.stringify(row.dados).slice(0, 100)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
