import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import gssLogo from "@/assets/gss-logo.jpeg";

export function DashboardHeader() {
  const { user } = useAuth();
  
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('*, setores(nome)')
        .eq('id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id
  });

  const nomeUsuario = profile?.nome_completo?.split(' ')[0] || 'Usuário';
  const iniciais = profile?.nome_completo
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const getCurrentDateTime = () => {
    return new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-gradient-to-r from-accent/10 via-primary/5 to-background rounded-xl p-8 mb-8 border border-accent/20 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-accent/30">
            <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-lg font-semibold">
              {iniciais}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {new Date().getHours() < 12 ? '☀️' : new Date().getHours() < 18 ? '🌤️' : '🌙'}
              </span>
              <h1 className="text-3xl font-bold text-foreground">
                {getGreeting()}, {nomeUsuario}!
              </h1>
              <NotificacoesSino />
            </div>
            {profile?.setores?.nome && (
              <div className="flex items-center gap-2 mt-2">
                <div className="h-5 w-5 rounded-full bg-accent/20 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                </div>
                <p className="text-sm font-semibold text-primary">
                  {profile.setores.nome}
                </p>
              </div>
            )}
            <p className="text-muted-foreground mt-2 text-sm">
              Aqui está o resumo das suas operações hoje
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              {getCurrentDateTime()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <img src={gssLogo} alt="GSS Logo" className="h-14 mb-3 rounded-md" />
          <div>
            <p className="text-base font-bold text-primary">SIGMA</p>
            <p className="text-xs text-muted-foreground leading-snug">
              Sistema Integrado de Gestão<br />Médica e Alocação
            </p>
            <p className="text-xs text-accent font-medium mt-1">By GSS</p>
          </div>
        </div>
      </div>
    </div>
  );
}
