-- =============================================================
-- App da Bibi — verificação usada pelo lembrete diário por e-mail.
-- Cole no SQL Editor do Supabase e clique em Run.
-- Responde só "sim/não" e uma contagem: nenhum dado do app é exposto.
-- =============================================================
create or replace function public.lembrete_hoje()
returns json language sql stable security definer set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
       cfg  as (select dias_semana from public.configuracoes where id = 1),
       ini  as (select coalesce(min(data), (select d from hoje)) as i from public.dias)
  select json_build_object(
    'hoje', (select d from hoje),
    'previsto_hoje', extract(dow from (select d from hoje))::int = any ((select dias_semana from cfg)::int[]),
    'registrado_hoje', exists (select 1 from public.dias where data = (select d from hoje)),
    'pendentes_anteriores', (
      select count(*) from generate_series(
        greatest((select i from ini), (select d from hoje) - 30),
        (select d from hoje) - 1, interval '1 day') as g(x)
      where extract(dow from g.x)::int = any ((select dias_semana from cfg)::int[])
        and not exists (select 1 from public.dias where data = g.x::date))
  )
$$;
grant execute on function public.lembrete_hoje() to anon, authenticated;
