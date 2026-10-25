-- Diario Leggero, aggiornamento 3: "ping" per evitare la pausa di Supabase dopo 7 giorni di inattività.
-- Incolla tutto in Supabase > SQL Editor > New query, poi premi "Run".
-- La funzione legge il database ma restituisce solo l'ora: nessun dato vostro esce.

create or replace function ping() returns timestamptz
language sql stable security definer set search_path = public as $$
  select now() from (select 1 from profili limit 1) t
  union all select now()
  limit 1;
$$;

revoke all on function ping() from public;
grant execute on function ping() to anon, authenticated;
