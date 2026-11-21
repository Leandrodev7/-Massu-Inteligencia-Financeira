alter table public.historico_patrimonio
  add column if not exists movimentacao_liquida numeric;

comment on column public.historico_patrimonio.movimentacao_liquida is
  'Aportes menos resgates desde o registro de saldo anterior; NULL indica fluxo ainda desconhecido.';

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'historico_patrimonio'
      and c.relrowsecurity
  ) then
    raise exception 'Habilite RLS em public.historico_patrimonio antes de permitir registros.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'historico_patrimonio'
      and policyname = 'historico_patrimonio_insert_own'
  ) then
    create policy historico_patrimonio_insert_own
      on public.historico_patrimonio
      as permissive
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'historico_patrimonio'
      and policyname = 'historico_patrimonio_insert_own_guard'
  ) then
    create policy historico_patrimonio_insert_own_guard
      on public.historico_patrimonio
      as restrictive
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'historico_patrimonio'
      and policyname = 'historico_patrimonio_update_own'
  ) then
    create policy historico_patrimonio_update_own
      on public.historico_patrimonio
      as permissive
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end;
$$;

grant insert on public.historico_patrimonio to authenticated;
grant update on public.historico_patrimonio to authenticated;
