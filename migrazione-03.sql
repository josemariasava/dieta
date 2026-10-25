-- Diario Leggero, aggiornamento 3: "ping" per evitare la pausa di Supabase dopo 7 giorni di inattività.
-- Incolla tutto in Supabase > SQL Editor > New query, poi premi "Run".
-- La funzione restituisce solo l'ora del server: nessun dato vostro esce.

create or replace function ping() returns timestamptz
language sql stable as $$
  select now();
$$;

revoke all on function ping() from public;
grant execute on function ping() to anon, authenticated;
