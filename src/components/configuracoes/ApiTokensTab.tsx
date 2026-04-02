import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Copy, Trash2, Eye, EyeOff, AlertCircle, Download } from "lucide-react";

const downloadDocTxt = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const licitacoesDocText = `DOCUMENTAÇÃO DA API - LICITAÇÕES
==================================

Base URL: https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes
Autenticação: Authorization: Bearer {seu_token}

FORMATO DE RESPOSTA DE SUCESSO:
{
  "success": true,
  "message": "Licitação criada com sucesso",
  "data": {
    "card_id": "uuid-interno-do-card",
    "licitacao": { ...dados completos... },
    "column": { "id": "...", "label": "..." },
    "attachment_endpoint": "/api-licitacoes/{id}/attachments"
  },
  "timestamp": "2025-12-04T13:00:00.000Z"
}

FORMATO DE RESPOSTA DE ERRO:
{
  "success": false,
  "error": {
    "code": "MISSING_FIELDS",
    "message": "Campos obrigatórios não informados: orgao",
    "details": { "required_fields": [...], "missing": [...] },
    "timestamp": "2025-12-04T13:00:00.000Z"
  }
}

EXEMPLOS DE REQUISIÇÕES:

GET - Listar colunas do Kanban:
curl -X GET 'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/columns' -H 'Authorization: Bearer seu_token_aqui'

GET - Listar licitações:
curl -X GET 'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes?page=1&limit=10' -H 'Authorization: Bearer seu_token_aqui'

POST - Criar licitação:
curl -X POST 'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes' \\
  -H 'Authorization: Bearer seu_token_aqui' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "numero_edital": "PE 55/2025",
    "orgao": "Prefeitura Municipal",
    "objeto": "Contratação de serviços médicos",
    "titulo": "PE 55/2025 - São Paulo/SP",
    "column_id": "uuid-coluna-kanban"
  }'

PUT/PATCH - Atualizar licitação:
curl -X PATCH 'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{card_id}' \\
  -H 'Authorization: Bearer seu_token_aqui' \\
  -H 'Content-Type: application/json' \\
  -d '{ "valor_estimado": 200000 }'

DELETE - Remover licitação:
curl -X DELETE 'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{id}' -H 'Authorization: Bearer seu_token_aqui'

ANEXOS:
GET  - Listar: /api-licitacoes/{card_id}/attachments
POST - Upload: /api-licitacoes/{card_id}/attachments (form-data ou binary)
DELETE - Remover: /api-licitacoes/{card_id}/attachments/{filename}

CAMPOS OBRIGATÓRIOS: numero_edital, orgao, objeto

CÓDIGOS DE ERRO:
200 OK | 201 Created | 400 MISSING_FIELDS | 400 INVALID_ID | 401 UNAUTHORIZED | 404 NOT_FOUND | 409 DUPLICATE | 500 INTERNAL_ERROR
`;

const importLeadsDocText = `DOCUMENTAÇÃO DA API - IMPORT LEADS
====================================

Base URL: https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/import-leads
Método: POST
Autenticação: Não requer token (endpoint público)

PAYLOAD JSON (BODY):
{
  "nome": "JOSE JOAQUIM DA COSTA CARVALHO JUNIOR",                              // Obrigatório
  "cpf": "375.717.457-72",                                                       // Obrigatório (chave de deduplicação)
  "especialidades_crua": "CIRURGIA GERAL - RQE Nº 10, GINECOLOGIA E OBSTETRÍCIA - RQE Nº 11",  // Salvo em observações
  "data_nascimento": "04/06/1952",                                                // Formato DD/MM/YYYY
  "cidade": "RIO BRANCO",
  "uf": "AC",                                                                     // Máximo 2 caracteres
  "telefones": [                                                                   // Array de telefones
    "(68) 99961-4808",                                                             // → 1º vira phone_e164
    "(68) 99973-8134",                                                             // → demais vão p/ telefones_adicionais
    "(68) 99974-1987"
  ],
  "emails": [                                                                      // Array de e-mails
    "josejoaquim040652@gmail.com",                                                 // → 1º vira email principal
    "josejoaquim@gmail.com"
  ],
  "endereco": "TV CAMPO DO RIO BRANCO 469 C C, CAPOEIRA, RIO BRANCO, AC, 69905-022"  // CEP extraído automaticamente
}

MAPEAMENTO DE CAMPOS:
Campo JSON           → Campo no BD              → Observação
nome                 → nome                     → Trimmed
cpf                  → cpf                      → Chave de deduplicação
telefones[0]         → phone_e164               → Normalizado p/ 55XXXXXXXXXXX
telefones[1+]        → telefones_adicionais     → Merge sem duplicatas
emails[0]            → email                    → Validado
especialidades_crua  → observacoes              → Prefixado "Especialidades:"
data_nascimento      → data_nascimento          → DD/MM/YYYY → YYYY-MM-DD
cidade               → cidade
uf                   → uf                       → Max 2 chars, uppercase
endereco             → endereco + cep           → CEP extraído do final

RESPOSTAS:
201 Criado  → { "success": true, "action": "created", "lead": {...} }
200 Atualizado → { "success": true, "action": "updated", "lead": {...} }
400 → nome/cpf obrigatório, CPF 11 dígitos, JSON inválido
409 → Lead duplicado (DUPLICATE_LEAD)
405 → Método não permitido
500 → Erro interno

EXEMPLO CURL:
curl -X POST 'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/import-leads' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "nome": "JOSE JOAQUIM DA COSTA CARVALHO JUNIOR",
    "cpf": "375.717.457-72",
    "especialidades_crua": "CIRURGIA GERAL - RQE Nº 10, GINECOLOGIA E OBSTETRÍCIA - RQE Nº 11",
    "data_nascimento": "04/06/1952",
    "cidade": "RIO BRANCO",
    "uf": "AC",
    "telefones": ["(68) 99961-4808", "(68) 99973-8134", "(68) 99974-1987"],
    "emails": ["josejoaquim040652@gmail.com", "josejoaquim@gmail.com"],
    "endereco": "TV CAMPO DO RIO BRANCO 469 C C, CAPOEIRA, RIO BRANCO, AC, 69905-022"
  }'

REGRAS DE NEGÓCIO:
- Deduplicação por CPF: Se já existe, faz UPDATE (merge telefones)
- CPF novo: INSERT com status "Novo" e origem "API Import"
- Telefones normalizados para E.164 (55 + DDD + número)
- especialidades_crua salvo em observacoes (prefixado "Especialidades:")
- CEP extraído automaticamente do final do endereço
`;
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";

export function ApiTokensTab() {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [showTokens, setShowTokens] = useState<{ [key: string]: boolean }>({});
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const { data: tokens, isLoading } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_tokens")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (nome: string) => {
      const token = `sigma_${crypto.randomUUID().replace(/-/g, '')}`;
      const { data, error } = await supabase
        .from("api_tokens")
        .insert({ nome, token })
        .select()
        .single();
      
      if (error) throw error;
      return { ...data, plainToken: token };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
      setNome("");
      setCreatedToken(data.plainToken);
      toast.success("Token criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar token: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("api_tokens")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
      toast.success("Token removido");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover token: " + error.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("api_tokens")
        .update({ ativo: !ativo })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Digite um nome para o token");
      return;
    }
    createMutation.mutate(nome);
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("Token copiado!");
  };

  const maskToken = (token: string) => {
    return `${token.substring(0, 12)}${'•'.repeat(20)}${token.substring(token.length - 8)}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tokens de API</CardTitle>
          <CardDescription>
            Gerencie tokens para acessar a API REST do Sigma. Use estes tokens no header Authorization: Bearer {'{token}'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {createdToken && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">Token criado! Copie agora, ele não será exibido novamente:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                      {createdToken}
                    </code>
                    <Button size="sm" variant="outline" onClick={() => copyToken(createdToken)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setCreatedToken(null)}>
                    Entendi, fechar
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleCreate} className="flex gap-4 mb-6">
            <div className="flex-1">
              <Label htmlFor="nome">Nome do Token</Label>
              <Input
                id="nome"
                placeholder="Ex: n8n-effect"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <Button type="submit" className="mt-auto" disabled={createMutation.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Token
            </Button>
          </form>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : tokens?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum token criado ainda
                    </TableCell>
                  </TableRow>
                ) : (
                  tokens?.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell className="font-medium">{token.nome}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs">
                            {showTokens[token.id] ? token.token : maskToken(token.token)}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowTokens({ ...showTokens, [token.id]: !showTokens[token.id] })}
                          >
                            {showTokens[token.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToken(token.token)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={token.ativo ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => toggleMutation.mutate({ id: token.id, ativo: token.ativo })}
                        >
                          {token.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(token.created_at), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {token.last_used_at ? format(new Date(token.last_used_at), "dd/MM/yyyy HH:mm") : "Nunca"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja remover este token?")) {
                              deleteMutation.mutate(token.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold mb-2">Documentação da API</h3>
              <Button variant="outline" size="sm" onClick={() => downloadDocTxt("api-licitacoes-doc.txt", licitacoesDocText)}>
                <Download className="h-4 w-4 mr-1" /> Exportar TXT
              </Button>
            </div>
              <p className="text-sm text-muted-foreground mb-2">
                Base URL: <code className="bg-background px-1 py-0.5 rounded">https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes</code>
              </p>
              <p className="text-sm text-muted-foreground">
                Autenticação: <code className="bg-background px-1 py-0.5 rounded">Authorization: Bearer {'{seu_token}'}</code>
              </p>

            <div className="mt-4 p-3 bg-green-500/10 rounded space-y-2">
              <h4 className="font-medium text-sm text-green-700">✅ Formato de Resposta de Sucesso:</h4>
              <code className="block p-2 bg-background rounded text-xs overflow-x-auto">
                {`{
  "success": true,
  "message": "Licitação criada com sucesso",
  "data": {
    "card_id": "uuid-interno-do-card",
    "licitacao": { ...dados completos... },
    "column": { "id": "...", "label": "..." },
    "attachment_endpoint": "/api-licitacoes/{id}/attachments"
  },
  "timestamp": "2025-12-04T13:00:00.000Z"
}`}
              </code>
            </div>

            <div className="mt-4 p-3 bg-red-500/10 rounded space-y-2">
              <h4 className="font-medium text-sm text-red-700">❌ Formato de Resposta de Erro:</h4>
              <code className="block p-2 bg-background rounded text-xs overflow-x-auto">
                {`{
  "success": false,
  "error": {
    "code": "MISSING_FIELDS",
    "message": "Campos obrigatórios não informados: orgao",
    "details": { "required_fields": [...], "missing": [...] },
    "timestamp": "2025-12-04T13:00:00.000Z"
  }
}`}
              </code>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Exemplos de Requisições:</h4>
              
              <div className="space-y-2">
                <p className="text-sm font-medium">GET - Listar colunas do Kanban:</p>
                <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                  {`curl -X GET \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/columns' \\
  -H 'Authorization: Bearer seu_token_aqui'`}
                </code>
                <p className="text-xs text-muted-foreground">Retorna todas as colunas com seus IDs - use para obter column_id válidos</p>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-medium">GET - Listar licitações:</p>
                <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                  {`curl -X GET \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes?page=1&limit=10' \\
  -H 'Authorization: Bearer seu_token_aqui'`}
                </code>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">GET - Buscar licitação por ID:</p>
                <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                  {`curl -X GET \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{id}' \\
  -H 'Authorization: Bearer seu_token_aqui'`}
                </code>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">POST - Criar licitação:</p>
                <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                  {`curl -X POST \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes' \\
  -H 'Authorization: Bearer seu_token_aqui' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "numero_edital": "PE 55/2025",
    "orgao": "Prefeitura Municipal",
    "objeto": "Contratação de serviços médicos",
    "titulo": "PE 55/2025 - São Paulo/SP",
    "licitacao_codigo": "LIC-2025-001",
    "municipio_uf": "São Paulo/SP",
    "effect_id": "id_externo_effect",
    "fonte": "n8n",
    "responsavel_id": "uuid-usuario",
    "column_id": "uuid-coluna-kanban"
  }'`}
                </code>
                <p className="text-xs text-muted-foreground">Resposta inclui card_id e attachment_endpoint para enviar arquivos</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">PUT/PATCH - Atualizar licitação:</p>
                <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                  {`curl -X PATCH \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{card_id}' \\
  -H 'Authorization: Bearer seu_token_aqui' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "valor_estimado": 200000,
    "observacoes": "Dados atualizados via IA"
  }'`}
                </code>
                <p className="text-xs text-muted-foreground">PATCH atualiza apenas campos enviados. PUT substitui o registro.</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">DELETE - Remover licitação:</p>
                <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                  {`curl -X DELETE \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{id}' \\
  -H 'Authorization: Bearer seu_token_aqui'`}
                </code>
              </div>

              <div className="space-y-2 mt-4">
                <h4 className="font-medium text-sm">📎 Gerenciamento de Anexos:</h4>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">GET - Listar anexos do card:</p>
                  <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                    {`curl -X GET \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{card_id}/attachments' \\
  -H 'Authorization: Bearer seu_token_aqui'`}
                  </code>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">POST - Upload de anexo (form-data):</p>
                  <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                    {`curl -X POST \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{card_id}/attachments' \\
  -H 'Authorization: Bearer seu_token_aqui' \\
  -F 'file=@/caminho/edital.pdf' \\
  -F 'filename=edital_completo.pdf'`}
                  </code>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">POST - Upload de anexo (binary):</p>
                  <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                    {`curl -X POST \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{card_id}/attachments?filename=edital.pdf' \\
  -H 'Authorization: Bearer seu_token_aqui' \\
  -H 'Content-Type: application/pdf' \\
  --data-binary @/caminho/edital.pdf`}
                  </code>
                  <p className="text-xs text-muted-foreground">Aceita qualquer tipo de arquivo (PDF, Word, Excel, imagens, vídeos, ZIP, RAR, etc.) até 50MB</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">DELETE - Remover anexo:</p>
                  <code className="block p-3 bg-background rounded text-xs overflow-x-auto">
                    {`curl -X DELETE \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes/{card_id}/attachments/{filename}' \\
  -H 'Authorization: Bearer seu_token_aqui'`}
                  </code>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-background rounded space-y-2">
              <h4 className="font-medium text-sm">⚠️ Nomenclatura de Campos:</h4>
              <p className="text-xs text-muted-foreground">
                A API aceita <strong>snake_case</strong> (recomendado) e camelCase (compatibilidade).
              </p>
            </div>

            <div className="mt-4 p-3 bg-background rounded space-y-2">
              <h4 className="font-medium text-sm">Códigos de Erro Específicos:</h4>
              <div className="space-y-1 text-xs">
                <div><code className="bg-green-500/10 text-green-600 px-1 py-0.5 rounded">200</code> OK - success: true</div>
                <div><code className="bg-green-500/10 text-green-600 px-1 py-0.5 rounded">201</code> Created - Recurso criado (retorna card_id)</div>
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400 MISSING_FIELDS</code> - Campos obrigatórios não enviados</div>
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400 INVALID_ID</code> - UUID inválido</div>
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400 INVALID_COLUMN_ID</code> - Coluna não existe (retorna lista válida)</div>
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400 INVALID_FILE_TYPE</code> - Tipo de arquivo não permitido</div>
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400 NO_FILE</code> - Arquivo não enviado</div>
                <div><code className="bg-red-500/10 text-red-600 px-1 py-0.5 rounded">401 UNAUTHORIZED</code> - Token inválido ou ausente</div>
                <div><code className="bg-red-500/10 text-red-600 px-1 py-0.5 rounded">404 NOT_FOUND</code> - Recurso não encontrado</div>
                <div><code className="bg-red-500/10 text-red-600 px-1 py-0.5 rounded">409 DUPLICATE_EFFECT_ID</code> - effect_id já existe</div>
                <div><code className="bg-red-500/10 text-red-600 px-1 py-0.5 rounded">409 DUPLICATE_CODIGO</code> - licitacao_codigo já existe</div>
                <div><code className="bg-red-500/10 text-red-600 px-1 py-0.5 rounded">500 INTERNAL_ERROR</code> - Erro no servidor</div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-background rounded space-y-2">
              <h4 className="font-medium text-sm">Campos Obrigatórios:</h4>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li><code>numero_edital</code> - Número do edital</li>
                <li><code>orgao</code> - Órgão solicitante</li>
                <li><code>objeto</code> - Objeto da licitação</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                📋 Use <code>column_id</code> para posicionar no Kanban e <code>effect_id</code> para evitar duplicatas.
              </p>
            </div>
          </div>

          {/* ===== DOCUMENTAÇÃO IMPORT LEADS ===== */}
          <div className="mt-8 p-4 bg-muted rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold mb-2">📋 Documentação da API - Import Leads</h3>
              <Button variant="outline" size="sm" onClick={() => downloadDocTxt("api-import-leads-doc.txt", importLeadsDocText)}>
                <Download className="h-4 w-4 mr-1" /> Exportar TXT
              </Button>
            </div>
              <p className="text-sm text-muted-foreground mb-2">
                Base URL: <code className="bg-background px-1 py-0.5 rounded">https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/import-leads</code>
              </p>
              <p className="text-sm text-muted-foreground">
                Método: <code className="bg-background px-1 py-0.5 rounded">POST</code> — Não requer autenticação por token (endpoint público)
              </p>

            <div className="p-3 bg-background rounded space-y-2">
              <h4 className="font-medium text-sm">📝 Payload JSON (Body):</h4>
              <code className="block p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre">
{`{
  "nome": "JOSE JOAQUIM DA COSTA CARVALHO JUNIOR",                              // ✅ Obrigatório
  "cpf": "375.717.457-72",                                                       // ✅ Obrigatório (chave de deduplicação)
  "especialidades_crua": "CIRURGIA GERAL - RQE Nº 10, GINECOLOGIA E OBSTETRÍCIA - RQE Nº 11",  // Salvo em observações
  "data_nascimento": "04/06/1952",                                                // Formato DD/MM/YYYY
  "cidade": "RIO BRANCO",
  "uf": "AC",                                                                     // Máximo 2 caracteres
  "telefones": [                                                                   // Array de telefones
    "(68) 99961-4808",                                                             // → 1º vira phone_e164
    "(68) 99973-8134",                                                             // → demais vão p/ telefones_adicionais
    "(68) 99974-1987"
  ],
  "emails": [                                                                      // Array de e-mails
    "josejoaquim040652@gmail.com",                                                 // → 1º vira email principal
    "josejoaquim@gmail.com"
  ],
  "endereco": "TV CAMPO DO RIO BRANCO 469 C C, CAPOEIRA, RIO BRANCO, AC, 69905-022"  // CEP extraído automaticamente
}`}
              </code>
            </div>

            <div className="p-3 bg-background rounded space-y-2">
              <h4 className="font-medium text-sm">🔄 Mapeamento de Campos → Tabela leads:</h4>
              <div className="space-y-1 text-xs">
                <div className="grid grid-cols-3 gap-2 font-medium border-b pb-1 mb-1">
                  <span>Campo JSON</span>
                  <span>Campo no BD</span>
                  <span>Observação</span>
                </div>
                <div className="grid grid-cols-3 gap-2"><span><code>nome</code></span><span><code>nome</code></span><span>Trimmed</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>cpf</code></span><span><code>cpf</code></span><span>Chave de deduplicação</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>telefones[0]</code></span><span><code>phone_e164</code></span><span>Normalizado p/ 55XXXXXXXXXXX</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>telefones[1+]</code></span><span><code>telefones_adicionais</code></span><span>Merge sem duplicatas</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>emails[0]</code></span><span><code>email</code></span><span>Validado</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>especialidades_crua</code></span><span><code>observacoes</code></span><span>Prefixado "Especialidades:"</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>data_nascimento</code></span><span><code>data_nascimento</code></span><span>DD/MM/YYYY → YYYY-MM-DD</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>cidade</code></span><span><code>cidade</code></span><span>—</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>uf</code></span><span><code>uf</code></span><span>Max 2 chars, uppercase</span></div>
                <div className="grid grid-cols-3 gap-2"><span><code>endereco</code></span><span><code>endereco</code> + <code>cep</code></span><span>CEP extraído do final</span></div>
              </div>
            </div>

            <div className="p-3 bg-green-500/10 rounded space-y-2">
              <h4 className="font-medium text-sm text-green-700">✅ Resposta de Sucesso (201 - Novo / 200 - Atualizado):</h4>
              <code className="block p-2 bg-background rounded text-xs overflow-x-auto whitespace-pre">
{`{
  "success": true,
  "action": "created",   // ou "updated" se CPF já existia
  "message": "Novo lead criado: uuid-do-lead",
  "lead": {
    "id": "uuid",
    "nome": "JOSE JOAQUIM...",
    "cpf": "375.717.457-72",
    "email": "josejoaquim040652@gmail.com",
    "phone_e164": "5568999614808",
    "status": "Novo",
    "origem": "API Import",
    "cidade": "RIO BRANCO",
    "uf": "AC"
  }
}`}
              </code>
            </div>

            <div className="p-3 bg-red-500/10 rounded space-y-2">
              <h4 className="font-medium text-sm text-red-700">❌ Respostas de Erro:</h4>
              <div className="space-y-1 text-xs">
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400</code> <code>{`{ "error": "nome is required" }`}</code></div>
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400</code> <code>{`{ "error": "cpf is required" }`}</code></div>
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400</code> <code>{`{ "error": "cpf must have 11 digits" }`}</code></div>
                <div><code className="bg-yellow-500/10 text-yellow-600 px-1 py-0.5 rounded">400</code> <code>{`{ "error": "Invalid JSON body" }`}</code></div>
                <div><code className="bg-red-500/10 text-red-600 px-1 py-0.5 rounded">409</code> <code>{`{ "error": "Lead já existe com este CPF", "code": "DUPLICATE_LEAD" }`}</code></div>
                <div><code className="bg-red-500/10 text-red-600 px-1 py-0.5 rounded">405</code> <code>{`{ "error": "Method not allowed. Use POST." }`}</code></div>
                <div><code className="bg-red-500/10 text-red-600 px-1 py-0.5 rounded">500</code> <code>{`{ "error": "Internal server error", "message": "..." }`}</code></div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Exemplo de Requisição:</h4>
              <div className="space-y-2">
                <p className="text-sm font-medium">POST - Criar/Atualizar Lead:</p>
                <code className="block p-3 bg-background rounded text-xs overflow-x-auto whitespace-pre">
{`curl -X POST \\
  'https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/import-leads' \\
  -H 'Content-Type: application/json' \\
  -d '{
     "nome": "JOSE JOAQUIM DA COSTA CARVALHO JUNIOR",
     "cpf": "375.717.457-72",
     "especialidades_crua": "CIRURGIA GERAL - RQE Nº 10, GINECOLOGIA E OBSTETRÍCIA - RQE Nº 11",
     "data_nascimento": "04/06/1952",
     "cidade": "RIO BRANCO",
     "uf": "AC",
     "telefones": ["(68) 99961-4808", "(68) 99973-8134", "(68) 99974-1987"],
     "emails": ["josejoaquim040652@gmail.com", "josejoaquim@gmail.com"],
     "endereco": "TV CAMPO DO RIO BRANCO 469 C C, CAPOEIRA, RIO BRANCO, AC, 69905-022"
  }'`}
                </code>
              </div>
            </div>

            <div className="p-3 bg-background rounded space-y-2">
              <h4 className="font-medium text-sm">⚙️ Regras de Negócio:</h4>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li><strong>Deduplicação por CPF:</strong> Se o CPF já existe, atualiza o lead existente (merge de telefones)</li>
                <li><strong>Se CPF é novo:</strong> Cria lead com status <code>"Novo"</code> e origem <code>"API Import"</code></li>
                <li><strong>Telefones:</strong> Normalizados para formato E.164 (55 + DDD + número)</li>
                <li><strong>Especialidades:</strong> O campo <code>especialidades_crua</code> é salvo no campo <code>observacoes</code> (prefixado com "Especialidades:")</li>
                <li><strong>CEP:</strong> Extraído automaticamente do final do endereço (formato XXXXX-XXX)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
