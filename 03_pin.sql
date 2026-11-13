-- ===================================================================
-- 03) Ingreso con PIN (sin usuarios)
-- El PIN viaja en el encabezado "x-pin" de cada pedido y se compara
-- contra un hash guardado en la base. El PIN nunca se guarda en claro.
-- Para fijar o cambiar el PIN, ejecutá en SQL Editor:
--   select public.cambiar_pin('TU_PIN');
-- ===================================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.ajustes (clave text primary key, valor text not null);
alter table public.ajustes enable row level security;          -- sin políticas: inaccesible desde la web
revoke all on public.ajustes from anon, authenticated;

create or replace function public.pin_ok(p text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select p is not null and length(p) > 0 and exists (
    select 1 from public.ajustes a
    where a.clave = 'pin_hash' and a.valor = extensions.crypt(p, a.valor));
$$;
revoke execute on function public.pin_ok(text) from public, anon, authenticated;

create or replace function public.es_editor() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.editores e
                 where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email','')))
      or public.pin_ok(nullif(current_setting('request.headers', true), '')::json ->> 'x-pin');
$$;
grant execute on function public.es_editor() to anon, authenticated;

-- Verificación desde la pantalla de ingreso (con demora ante PIN incorrecto)
create or replace function public.verificar_pin(p text) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if public.pin_ok(p) then return true; end if;
  perform pg_sleep(1.5);
  return false;
end $$;
revoke execute on function public.verificar_pin(text) from public;
grant execute on function public.verificar_pin(text) to anon, authenticated;

-- Solo ejecutable desde el SQL Editor (no desde la web)
create or replace function public.cambiar_pin(nuevo text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if nuevo is null or length(nuevo) < 4 then raise exception 'El PIN debe tener al menos 4 caracteres'; end if;
  insert into public.ajustes (clave, valor) values ('pin_hash', extensions.crypt(nuevo, extensions.gen_salt('bf')))
  on conflict (clave) do update set valor = excluded.valor;
  return 'PIN actualizado';
end $$;
revoke execute on function public.cambiar_pin(text) from public, anon, authenticated;

delete from public.editores where email = 'editores.vc@example.com';
