-- Documents joints aux courses (assurance, billets, PDF, photos…) : stockage privé réservé à vous deux.
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
