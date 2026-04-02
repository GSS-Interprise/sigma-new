import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { 
  FileText, 
  AlertTriangle, 
  Clock, 
  Calendar,
  CalendarClock,
  FileX
} from "lucide-react";
import { isAfter, isBefore, addDays, startOfDay } from "date-fns";

export function ContratoHomeTab() {
  const { data: contratos } = useQuery({
    queryKey: ['contratos-home'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          cliente:clientes(nome_fantasia),
          medico:medicos(nome_completo)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  const hoje = startOfDay(new Date());
  const em30Dias = addDays(hoje, 30);
  const em60Dias = addDays(hoje, 60);

  const totalContratos = contratos?.length || 0;

  const contratosVencidos = contratos?.filter((c) => {
    const dataFim = startOfDay(new Date(c.data_fim));
    return isBefore(dataFim, hoje);
  }) || [];

  const contratosPendentesAssinatura = contratos?.filter(
    (c) => c.assinado === 'Pendente'
  ) || [];

  const contratosVencendo30Dias = contratos?.filter((c) => {
    const dataFim = startOfDay(new Date(c.data_fim));
    return isAfter(dataFim, hoje) && isBefore(dataFim, em30Dias);
  }) || [];

  const contratosVencendo60Dias = contratos?.filter((c) => {
    const dataFim = startOfDay(new Date(c.data_fim));
    return isAfter(dataFim, em30Dias) && isBefore(dataFim, em60Dias);
  }) || [];

  const contratosSemAnexo = contratos?.filter(
    (c) => !c.documento_url
  ) || [];

  return (
    <div className="space-y-6">
      {/* Cards de métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Contratos</p>
              <h3 className="text-2xl font-bold">{totalContratos}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contratos Vencidos</p>
              <h3 className="text-2xl font-bold">{contratosVencidos.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pendentes de Assinatura</p>
              <h3 className="text-2xl font-bold">{contratosPendentesAssinatura.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Calendar className="h-6 w-6 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vencimento em 30 dias</p>
              <h3 className="text-2xl font-bold">{contratosVencendo30Dias.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <CalendarClock className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vencimento em 60 dias</p>
              <h3 className="text-2xl font-bold">{contratosVencendo60Dias.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <FileX className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sem Anexo</p>
              <h3 className="text-2xl font-bold">{contratosSemAnexo.length}</h3>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
