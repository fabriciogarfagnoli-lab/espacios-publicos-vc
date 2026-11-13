-- =====================================================================
-- Espacios Públicos · Villa Constitución — esquema de base de datos
-- Pegar completo en Supabase › SQL Editor › New query › Run
-- =====================================================================

-- 1) Espacios públicos (una fila por plaza / parque / mirador, etc.)
create table if not exists public.espacios (
  id          text primary key,
  nombre      text not null,
  tipo        text,
  zona        text,
  barrio      text,
  ubicacion   text,
  lat         double precision,
  lng         double precision,
  fuente      text,
  poligono    jsonb,                                 -- [[lat,lng],...] delimitación
  drive       jsonb not null default '[]'::jsonb,   -- [{label,url}]
  rubros      jsonb not null default '{}'::jsonb,   -- {juegos:{tiene,estado,nota}, ...}
  recs        jsonb not null default '[]'::jsonb,   -- [{texto,hecho,fecha}]
  actualizado timestamptz default now(),
  creado      timestamptz default now()
);

-- 2) Bitácora: trabajos realizados, relevamientos, reclamos, observaciones
create table if not exists public.registros (
  id          uuid primary key default gen_random_uuid(),
  espacio_id  text not null references public.espacios(id) on delete cascade,
  fecha       date not null default current_date,
  tipo        text not null check (tipo in ('trabajo','relevamiento','reclamo','nota')),
  rubro       text,
  descripcion text not null,
  fotos       text[] not null default '{}',     -- rutas dentro del bucket "fotos"
  cambios     jsonb,                            -- {rubro: nuevo_estado}
  rec_hecha   text,
  autor       text,                             -- email de quien cargó
  creado      timestamptz not null default now()
);
create index if not exists registros_espacio_idx on public.registros(espacio_id, fecha desc);

-- 3) Equipo habilitado para editar (emails)
create table if not exists public.editores (
  email  text primary key,
  nombre text
);

-- ¿El usuario logueado es editor?
create or replace function public.es_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editores e
                 where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email','')));
$$;
grant execute on function public.es_editor() to anon, authenticated;

-- 4) Seguridad por filas: cualquiera puede VER, solo editores MODIFICAN
alter table public.espacios  enable row level security;
alter table public.registros enable row level security;
alter table public.editores  enable row level security;

drop policy if exists "ver espacios" on public.espacios;
create policy "ver espacios" on public.espacios for select using (true);
drop policy if exists "editar espacios" on public.espacios;
create policy "editar espacios" on public.espacios for all
  using (public.es_editor()) with check (public.es_editor());

drop policy if exists "ver registros" on public.registros;
create policy "ver registros" on public.registros for select using (true);
drop policy if exists "editar registros" on public.registros;
create policy "editar registros" on public.registros for all
  using (public.es_editor()) with check (public.es_editor());

-- la lista de editores no es pública (solo se administra desde el panel)
drop policy if exists "editores ven la lista" on public.editores;
create policy "editores ven la lista" on public.editores for select using (public.es_editor());


-- Permisos de la API (las reglas RLS de arriba deciden qué filas)
grant usage on schema public to anon, authenticated;
grant select on public.espacios, public.registros to anon, authenticated;
grant insert, update, delete on public.espacios, public.registros to authenticated;
grant select on public.editores to authenticated;

-- 5) Fotos: bucket público de lectura, carga solo editores
insert into storage.buckets (id, name, public)
values ('fotos','fotos', true)
on conflict (id) do nothing;

drop policy if exists "fotos lectura" on storage.objects;
create policy "fotos lectura" on storage.objects for select using (bucket_id = 'fotos');
drop policy if exists "fotos carga editores" on storage.objects;
create policy "fotos carga editores" on storage.objects for insert
  with check (bucket_id = 'fotos' and public.es_editor());
drop policy if exists "fotos borrar editores" on storage.objects;
create policy "fotos borrar editores" on storage.objects for delete
  using (bucket_id = 'fotos' and public.es_editor());

-- 6) Actualizaciones en vivo (todos ven los cambios al instante)
do $$ begin
  begin alter publication supabase_realtime add table public.espacios;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.registros; exception when others then null; end;
end $$;

-- 7) EDITORES: reemplazá por los emails reales del equipo y ejecutá
-- insert into public.editores (email, nombre) values
--   ('tu.email@gmail.com', 'Tu nombre'),
--   ('otra.persona@ejemplo.com', 'Nombre');
