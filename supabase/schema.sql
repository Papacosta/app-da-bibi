-- =============================================================
-- App da Bibi — banco de dados (Supabase / Postgres)
-- Cole tudo no "SQL Editor" do Supabase e clique em "Run".
-- Pode rodar de novo sem problemas (é idempotente).
-- =============================================================

-- ---------- Perfis (quem é admin e quem é responsável) ----------
create table if not exists public.perfis (
  id     uuid primary key references auth.users(id) on delete cascade,
  email  text not null,
  nome   text not null default '',
  -- 'pendente'    = acabou de ser criado, não vê nada
  -- 'responsavel' = a tia: vê os dias e os pagamentos
  -- 'admin'       = você: vê e edita tudo
  papel  text not null default 'pendente'
         check (papel in ('pendente', 'responsavel', 'admin'))
);

-- Cria o perfil automaticamente quando um usuário é criado no Auth
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Funções auxiliares usadas nas regras de acesso
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid()
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = 'admin', false)
$$;

create or replace function public.pode_ver_dias()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('admin', 'responsavel'), false)
$$;

-- ---------- Configurações (uma única linha) ----------
create table if not exists public.configuracoes (
  id                  int primary key default 1 check (id = 1),
  valor_percurso      numeric(10,2) not null default 25,   -- R$ recebido por percurso
  percursos_por_dia   int           not null default 2,    -- ida + volta
  km_percurso         numeric(8,2)  not null default 8,    -- km de UM percurso
  minutos_percurso    int           not null default 20,   -- tempo de UM percurso
  consumo_km_l        numeric(6,2)  not null default 11,   -- km por litro do carro
  preco_combustivel   numeric(6,2)  not null default 6.00, -- R$ por litro
  dias_semana         int[]         not null default '{1,2,3,5}' -- 0=dom ... 6=sáb
);
insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

-- ---------- Dias (cada dia em que levou ou não levou) ----------
create table if not exists public.dias (
  id                uuid primary key default gen_random_uuid(),
  data              date not null unique,           -- evita registrar o mesmo dia 2x
  status            text not null default 'levei' check (status in ('levei', 'nao_levei')),
  percursos         int  not null default 2 check (percursos between 0 and 10),
  km                numeric(8,2)  not null default 0 check (km >= 0),
  minutos           int           not null default 0 check (minutos >= 0),
  valor             numeric(10,2) not null default 0 check (valor >= 0),  -- quanto a tia deve por este dia
  observacao        text not null default '',
  criado_em         timestamptz not null default now()
);

-- ---------- Custo de combustível de cada dia (só o admin vê) ----------
-- Fica separado para a responsável nunca ter acesso aos custos.
create table if not exists public.custos_dia (
  dia_id            uuid primary key references public.dias(id) on delete cascade,
  custo_combustivel numeric(10,2) not null default 0 check (custo_combustivel >= 0)
);

-- ---------- Pagamentos recebidos da tia ----------
create table if not exists public.pagamentos (
  id         uuid primary key default gen_random_uuid(),
  data       date not null,
  valor      numeric(10,2) not null check (valor > 0),
  observacao text not null default '',
  criado_em  timestamptz not null default now()
);

-- ---------- Gastos (manutenção, lavagem, etc. — só o admin vê) ----------
create table if not exists public.gastos (
  id         uuid primary key default gen_random_uuid(),
  data       date not null,
  categoria  text not null default 'manutencao'
             check (categoria in ('manutencao', 'combustivel_extra', 'estacionamento', 'limpeza', 'outros')),
  descricao  text not null default '',
  valor      numeric(10,2) not null check (valor > 0),
  criado_em  timestamptz not null default now()
);

-- =============================================================
-- Regras de acesso (Row Level Security)
-- =============================================================
alter table public.perfis        enable row level security;
alter table public.configuracoes enable row level security;
alter table public.dias          enable row level security;
alter table public.pagamentos    enable row level security;
alter table public.gastos        enable row level security;
alter table public.custos_dia    enable row level security;

-- Perfis: cada um vê o próprio; admin vê todos
drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select
  using (id = auth.uid() or public.eh_admin());

-- Configurações: só admin
drop policy if exists config_admin on public.configuracoes;
create policy config_admin on public.configuracoes for all
  using (public.eh_admin()) with check (public.eh_admin());

-- Dias e pagamentos: admin e responsável leem; só admin altera
drop policy if exists dias_ler on public.dias;
create policy dias_ler on public.dias for select using (public.pode_ver_dias());
drop policy if exists dias_admin on public.dias;
create policy dias_admin on public.dias for all
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists pagamentos_ler on public.pagamentos;
create policy pagamentos_ler on public.pagamentos for select using (public.pode_ver_dias());
drop policy if exists pagamentos_admin on public.pagamentos;
create policy pagamentos_admin on public.pagamentos for all
  using (public.eh_admin()) with check (public.eh_admin());

-- Gastos: só admin
drop policy if exists gastos_admin on public.gastos;
create policy gastos_admin on public.gastos for all
  using (public.eh_admin()) with check (public.eh_admin());

-- Custos de combustível: só admin
drop policy if exists custos_admin on public.custos_dia;
create policy custos_admin on public.custos_dia for all
  using (public.eh_admin()) with check (public.eh_admin());
