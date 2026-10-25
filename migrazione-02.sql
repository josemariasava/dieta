-- Diario Leggero, aggiornamento 2: diario dei pasti, visite e tempo reale.
-- Incolla tutto in Supabase > SQL Editor > New query, poi premi "Run".

-- Diario: per ogni persona, giorno e pasto, com'è andata
create table if not exists diario (
  id bigint generated always as identity primary key,
  persona text not null check (persona in ('p1', 'p2')),
  data date not null,
  momento text not null,
  stato text not null check (stato in ('fatto', 'sgarro', 'saltato')),
  nota text,
  created_at timestamptz not null default now(),
  unique (persona, data, momento)
);

-- Visite dal nutrizionista
create table if not exists visite (
  id bigint generated always as identity primary key,
  data date not null,
  ora time,
  note text,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['diario', 'visite'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists solo_membri on %I', t);
    execute format(
      'create policy solo_membri on %I for all to authenticated using (is_member()) with check (is_member())', t);
  end loop;
end $$;

grant select, insert, update, delete on diario, visite to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Tempo reale: le modifiche dell'altra persona arrivano subito
do $$
declare t text;
begin
  foreach t in array array['profili', 'pasti', 'spesa', 'spese', 'pesate', 'diario', 'visite'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
