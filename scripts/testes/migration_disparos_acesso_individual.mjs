// Testa a migration 20261026090000_disparos_acesso_individual (e o rollback) num Postgres embutido,
// com os dados reais do snapshot de 03/04 em import_sql/ (profiles, user_roles, permissoes e
// captacao_permissoes_usuario). Não toca em banco nenhum fora do processo.
//   npm i --no-save @electric-sql/pglite && node scripts/testes/migration_disparos_acesso_individual.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const ler = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const MIGRATION = ler("supabase/migrations/20261026090000_disparos_acesso_individual.sql");
const ROLLBACK = ler("supabase/rollback/20261026090000_disparos_acesso_individual.sql");
const CHECAGEM = ler("scripts/checar_acesso_disparos_individual.sql");
const DANILO = "7b2fea38-3b27-4818-b61d-4b1a5564b7a8";
const BRENDA = "45195808-18e5-4e53-8bba-d1149da93ebd";

const db = new PGlite();

// Esqueleto mínimo do schema de produção para estas tabelas/funções (DDL de
// 20251208164117 + colunas cor/realtime_licitacoes adicionadas depois).
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create type public.app_role as enum ('admin','coordenador_escalas','diretoria','externos','gestor_ages',
    'gestor_captacao','gestor_contratos','gestor_financeiro','gestor_marketing','gestor_radiologia','lideres',
    'licitador','lider_licitacao');
  create table public.setores (id uuid primary key, nome text);
  create table public.profiles (id uuid primary key, nome_completo text, email text, telefone text,
    created_at timestamptz, updated_at timestamptz, status text, setor_id uuid);
  create table public.user_roles (id uuid primary key, user_id uuid, created_at timestamptz, role public.app_role,
    unique (user_id, role));
  create table public.permissoes (id uuid primary key, modulo text, acao text, perfil public.app_role, ativo boolean,
    created_at timestamptz, updated_at timestamptz);
  create function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable as
    $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;
  create function public.is_admin(_user_id uuid) returns boolean language sql stable as
    $$ select public.has_role(_user_id, 'admin') $$;
  create function public.update_updated_at_column() returns trigger language plpgsql as
    $$ begin new.updated_at = now(); return new; end $$;
  CREATE TABLE public.captacao_permissoes_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pode_disparos_email BOOLEAN NOT NULL DEFAULT false,
    pode_disparos_zap BOOLEAN NOT NULL DEFAULT false,
    pode_acompanhamento BOOLEAN NOT NULL DEFAULT false,
    pode_leads BOOLEAN NOT NULL DEFAULT false,
    pode_blacklist BOOLEAN NOT NULL DEFAULT false,
    pode_seigzaps_config BOOLEAN NOT NULL DEFAULT false,
    pode_contratos_servicos BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    cor text,
    realtime_licitacoes boolean not null default false,
    UNIQUE(user_id)
  );
  CREATE TRIGGER update_captacao_permissoes_updated_at BEFORE UPDATE ON public.captacao_permissoes_usuario
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
`);
// Funções copiadas de 20251208164117_bf18f048-7131-48cf-8e0f-a2ae33156340.sql
const original = ler("supabase/migrations/20251208164117_bf18f048-7131-48cf-8e0f-a2ae33156340.sql");
for (const nome of ["is_captacao_leader", "has_captacao_permission"]) {
  const ini = original.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}`);
  const fim = original.indexOf("$$;", original.indexOf("AS $$", ini)) + 3;
  await db.exec(original.slice(ini, fim));
}

for (const t of ["profiles", "user_roles", "permissoes", "captacao_permissoes_usuario"]) {
  if (t === "captacao_permissoes_usuario") await db.exec("insert into auth.users select id from public.profiles");
  await db.exec(ler(`import_sql/${t}.sql`).replace(`INSERT INTO "${t}"`, `INSERT INTO public."${t}"`));
}

const CHAVES = `user_id, pode_disparos_email, pode_disparos_zap, pode_acompanhamento, pode_leads, pode_blacklist,
  pode_seigzaps_config, pode_contratos_servicos, cor, realtime_licitacoes`;
const linhas = async (sql) => (await db.query(sql)).rows;
const porUsuario = async () =>
  Object.fromEntries((await linhas(`select ${CHAVES} from public.captacao_permissoes_usuario`)).map((r) => [r.user_id, r]));
const snapshotPerfis = async () =>
  JSON.stringify([await linhas("select * from public.user_roles order by id"), await linhas("select * from public.permissoes order by id")]);

const antes = await porUsuario();
const perfisAntes = await snapshotPerfis();
console.log(`snapshot: ${Object.keys(antes).length} registros de captação; Danilo tem registro? ${!!antes[DANILO]}; ` +
  `Brenda seigzaps/zap antes: ${antes[BRENDA]?.pode_seigzaps_config}/${antes[BRENDA]?.pode_disparos_zap}`);

// 1) aplica duas vezes (idempotência)
await db.exec(MIGRATION);
await db.exec(MIGRATION);
const depois = await porUsuario();
const comChave = await linhas("select user_id from public.captacao_permissoes_usuario where pode_acessar_disparos order by user_id");
assert.deepEqual(comChave.map((r) => r.user_id).sort(), [BRENDA, DANILO].sort(), "só Danilo e Brenda com a chave");
assert.equal(depois[DANILO].pode_seigzaps_config, true);
assert.equal(depois[BRENDA].pode_seigzaps_config, true);
assert.equal(depois[DANILO].pode_disparos_zap, false, "Danilo sem envio zap");
assert.equal(depois[DANILO].pode_disparos_email, false, "Danilo sem envio email");
for (const [uid, r] of Object.entries(antes)) {
  const esperado = uid === BRENDA ? { ...r, pode_seigzaps_config: true } : r;
  assert.deepEqual(depois[uid], esperado, `registro de ${uid} não pode mudar além do previsto`);
}
assert.equal(Object.keys(depois).length, Object.keys(antes).length + (antes[DANILO] ? 0 : 1));
assert.equal(await snapshotPerfis(), perfisAntes, "user_roles e permissoes intactos");
console.log("migration aplicada 2x: ok (só Danilo e Brenda; demais registros, perfis e matriz intactos)");

console.log("\nscripts/checar_acesso_disparos_individual.sql:");
console.table(await linhas(CHECAGEM));

// 2) rollback
await db.exec(ROLLBACK);
const col = await linhas(`select 1 from information_schema.columns
  where table_name = 'captacao_permissoes_usuario' and column_name = 'pode_acessar_disparos'`);
assert.equal(col.length, 0, "coluna removida");
const voltou = await porUsuario();
assert.equal(voltou[DANILO].pode_seigzaps_config, false);
for (const [uid, r] of Object.entries(antes)) assert.deepEqual(voltou[uid], r, `rollback restaura ${uid}`);
console.log("rollback: ok (coluna removida, Danilo sem Chips & Instâncias, Brenda e demais como antes)");

// 3) reaplicar depois do rollback
await db.exec(MIGRATION);
assert.equal((await linhas("select count(*)::int n from public.captacao_permissoes_usuario where pode_acessar_disparos"))[0].n, 2);
console.log("reaplicar após rollback: ok");
