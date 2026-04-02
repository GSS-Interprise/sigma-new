import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Users, Building2, Activity } from "lucide-react";

export function AtividadesRecentes() {
  const { data: atividades } = useQuery({
    queryKey: ['atividades-recentes'],
    queryFn: async () => {
      const atividades: Array<{
        tipo: string;
        descricao: string;
        data: string;
        icone: any;
      }> = [];

      const [medicos, clientes, contratos, relacionamentos] = await Promise.all([
        supabase.from('medicos').select('nome_completo, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('clientes').select('nome_empresa, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('contratos').select('codigo_contrato, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('relacionamento_medico').select('descricao, created_at').order('created_at', { ascending: false }).limit(3),
      ]);

      if (medicos.data) {
        medicos.data.forEach(m => {
          atividades.push({
            tipo: 'Médico',
            descricao: `Médico ${m.nome_completo} cadastrado`,
            data: m.created_at,
            icone: Users
          });
        });
      }

      if (clientes.data) {
        clientes.data.forEach(c => {
          atividades.push({
            tipo: 'Cliente',
            descricao: `Cliente ${c.nome_empresa} cadastrado`,
            data: c.created_at,
            icone: Building2
          });
        });
      }

      if (contratos.data) {
        contratos.data.forEach(c => {
          atividades.push({
            tipo: 'Contrato',
            descricao: `Contrato ${c.codigo_contrato || '#'} emitido`,
            data: c.created_at,
            icone: FileText
          });
        });
      }

      if (relacionamentos.data) {
        relacionamentos.data.forEach(r => {
          atividades.push({
            tipo: 'Relacionamento',
            descricao: r.descricao,
            data: r.created_at,
            icone: Activity
          });
        });
      }

      return atividades.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 10);
    },
  });

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-accent" />
          </div>
          Atividades Recentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px]">
          <div className="space-y-3">
            {atividades && atividades.length > 0 ? (
              atividades.map((atividade, index) => {
                const Icon = atividade.icone;
                const getIconColor = () => {
                  if (atividade.tipo === 'Médico') return 'text-accent';
                  if (atividade.tipo === 'Contrato') return 'text-primary';
                  if (atividade.tipo === 'Cliente') return 'text-[hsl(var(--info))]';
                  return 'text-warning';
                };
                const getIconBg = () => {
                  if (atividade.tipo === 'Médico') return 'bg-accent/10';
                  if (atividade.tipo === 'Contrato') return 'bg-primary/10';
                  if (atividade.tipo === 'Cliente') return 'bg-[hsl(var(--info))]/10';
                  return 'bg-warning/10';
                };
                return (
                  <div key={index} className="flex items-start gap-3 pb-3 border-b border-border/50 last:border-0">
                    <div className={`h-10 w-10 rounded-xl ${getIconBg()} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`h-5 w-5 ${getIconColor()}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-snug">{atividade.descricao}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {formatDistanceToNow(new Date(atividade.data), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center mb-3">
                  <span className="text-2xl">✅</span>
                </div>
                <p className="text-sm text-muted-foreground">Nenhuma atividade recente.</p>
                <p className="text-xs text-muted-foreground mt-1">Tudo sob controle!</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
