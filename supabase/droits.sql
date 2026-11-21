-- Droits d'accès pour les comptes connectés (votre projet Supabase ne les donne pas automatiquement).
-- L'accès reste limité à vos deux e-mails par les règles du script principal.
grant usage on schema public to authenticated;
grant select on public.membres to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
grant select on public.historique to authenticated;
