-- sla_exames agora guarda nome do paciente (20261112220000): leitura só para quem opera o SLA (admin e
-- gestor_radiologia), não mais qualquer usuário logado. Leituras e quedas do coletor seguem abertas (sem dado pessoal).
drop policy if exists sla_exames_ler on public.sla_exames;
create policy sla_exames_ler on public.sla_exames for select to authenticated using (sla_pode_operar(auth.uid()));
