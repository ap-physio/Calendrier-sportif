-- Calendrier des courses : à coller UNE fois dans Supabase → SQL Editor → Run.
-- Crée : la liste des deux membres, les courses, l'historique des modifications,
-- le stockage privé des GPX, et réserve tout l'accès à Aurèle et Candice.

-- 1. Membres autorisés (e-mail de connexion → coureur)
create table if not exists public.membres (
  email text primary key,
  coureur text not null unique,
  nom text not null
);
insert into public.membres (email, coureur, nom) values
  ('poucheletaurele@gmail.com', 'aurele', 'Aurèle'),
  ('candice.roberjot@gmail.com', 'candice', 'Candice')
on conflict (email) do update set coureur = excluded.coureur, nom = excluded.nom;

create or replace function public.est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

create or replace function public.mon_coureur() returns text
language sql stable security definer set search_path = public as $$
  select coureur from public.membres where lower(email) = lower(auth.jwt() ->> 'email');
$$;

-- 2. Courses (la fiche complète est dans "data", au même format que data/courses.json)
create table if not exists public.courses (
  id text primary key,
  data jsonb not null,
  cree_par text,
  cree_le timestamptz not null default now(),
  modifie_par text,
  modifie_le timestamptz not null default now()
);

-- Qui a fait quoi : rempli automatiquement, impossible à falsifier depuis le site
create or replace function public.courses_auteur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.cree_par := public.mon_coureur();
    new.cree_le := now();
  else
    new.cree_par := old.cree_par;
    new.cree_le := old.cree_le;
  end if;
  new.modifie_par := public.mon_coureur();
  new.modifie_le := now();
  return new;
end $$;
drop trigger if exists courses_auteur on public.courses;
create trigger courses_auteur before insert or update on public.courses
  for each row execute function public.courses_auteur();

-- 3. Historique de toutes les modifications
create table if not exists public.historique (
  id bigint generated always as identity primary key,
  course_id text not null,
  action text not null,          -- ajout / modification / suppression
  par text,
  le timestamptz not null default now(),
  avant jsonb,
  apres jsonb
);

create or replace function public.courses_historique() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.historique (course_id, action, par, avant, apres)
  values (
    coalesce(new.id, old.id),
    case tg_op when 'INSERT' then 'ajout' when 'UPDATE' then 'modification' else 'suppression' end,
    public.mon_coureur(),
    case when tg_op in ('UPDATE', 'DELETE') then old.data end,
    case when tg_op in ('INSERT', 'UPDATE') then new.data end
  );
  return null;
end $$;
drop trigger if exists courses_historique on public.courses;
create trigger courses_historique after insert or update or delete on public.courses
  for each row execute function public.courses_historique();

-- 4. Accès réservé aux deux membres
alter table public.membres enable row level security;
alter table public.courses enable row level security;
alter table public.historique enable row level security;

drop policy if exists "membres lisent membres" on public.membres;
create policy "membres lisent membres" on public.membres for select to authenticated using (public.est_membre());

drop policy if exists "membres lisent courses" on public.courses;
create policy "membres lisent courses" on public.courses for select to authenticated using (public.est_membre());
drop policy if exists "membres ajoutent courses" on public.courses;
create policy "membres ajoutent courses" on public.courses for insert to authenticated with check (public.est_membre());
drop policy if exists "membres modifient courses" on public.courses;
create policy "membres modifient courses" on public.courses for update to authenticated using (public.est_membre()) with check (public.est_membre());
drop policy if exists "membres suppriment courses" on public.courses;
create policy "membres suppriment courses" on public.courses for delete to authenticated using (public.est_membre());

drop policy if exists "membres lisent historique" on public.historique;
create policy "membres lisent historique" on public.historique for select to authenticated using (public.est_membre());

-- 5. Stockage privé des GPX
insert into storage.buckets (id, name, public) values ('gpx', 'gpx', false)
on conflict (id) do nothing;

drop policy if exists "membres lisent gpx" on storage.objects;
create policy "membres lisent gpx" on storage.objects for select to authenticated using (bucket_id = 'gpx' and public.est_membre());
drop policy if exists "membres ajoutent gpx" on storage.objects;
create policy "membres ajoutent gpx" on storage.objects for insert to authenticated with check (bucket_id = 'gpx' and public.est_membre());
drop policy if exists "membres remplacent gpx" on storage.objects;
create policy "membres remplacent gpx" on storage.objects for update to authenticated using (bucket_id = 'gpx' and public.est_membre());
drop policy if exists "membres suppriment gpx" on storage.objects;
create policy "membres suppriment gpx" on storage.objects for delete to authenticated using (bucket_id = 'gpx' and public.est_membre());

-- 6. Droits pour les comptes connectés (certains projets Supabase ne les donnent pas d'office)
grant usage on schema public to authenticated;
grant select on public.membres to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
grant select on public.historique to authenticated;

-- 7. Documents joints
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "membres lisent documents" on storage.objects;
create policy "membres lisent documents" on storage.objects for select to authenticated using (bucket_id = 'documents' and public.est_membre());
drop policy if exists "membres ajoutent documents" on storage.objects;
create policy "membres ajoutent documents" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.est_membre());
drop policy if exists "membres remplacent documents" on storage.objects;
create policy "membres remplacent documents" on storage.objects for update to authenticated using (bucket_id = 'documents' and public.est_membre());
drop policy if exists "membres suppriment documents" on storage.objects;
create policy "membres suppriment documents" on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.est_membre());
