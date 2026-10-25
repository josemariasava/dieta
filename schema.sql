-- Diario Leggero: schema del database Supabase
-- Incolla tutto in Supabase > SQL Editor > New query, poi premi "Run".

-- Chi può usare l'app: solo le email in questa tabella vedono e modificano i dati.
create table if not exists membri (
  email text primary key
);
-- Dopo aver eseguito questo file, aggiungi le vostre email (non salvarle nel repository pubblico):
--   insert into membri (email) values ('tua@email.it'), ('sua@email.it');

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membri where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- Nomi, altezza e peso obiettivo di ciascuno (p1 = Jose, p2 = Annalisa)
create table if not exists profili (
  persona text primary key check (persona in ('p1', 'p2')),
  nome text not null,
  altezza_cm numeric(5,1),
  peso_obiettivo numeric(5,1)
);
insert into profili (persona, nome) values ('p1', 'Jose'), ('p2', 'Annalisa')
on conflict do nothing;

-- Piano alimentare del nutrizionista
create table if not exists pasti (
  id bigint generated always as identity primary key,
  persona text not null check (persona in ('p1', 'p2', 'entrambi')),
  giorno smallint not null check (giorno between 1 and 7),  -- 1 = lunedì
  momento text not null,
  alimento text not null,
  quantita text,
  note text,
  created_at timestamptz not null default now()
);

-- Lista della spesa
create table if not exists spesa (
  id bigint generated always as identity primary key,
  nome text not null,
  quantita text,
  categoria text not null default 'Altro',
  comprato boolean not null default false,
  created_at timestamptz not null default now()
);

-- Spese sostenute
create table if not exists spese (
  id bigint generated always as identity primary key,
  data date not null default current_date,
  descrizione text not null,
  categoria text not null,
  importo numeric(10,2) not null check (importo >= 0),
  pagato_da text not null check (pagato_da in ('p1', 'p2', 'insieme')),
  created_at timestamptz not null default now()
);

-- Pesate
create table if not exists pesate (
  id bigint generated always as identity primary key,
  persona text not null check (persona in ('p1', 'p2')),
  data date not null default current_date,
  peso_kg numeric(5,1) not null check (peso_kg > 0),
  vita_cm numeric(5,1),
  note text,
  created_at timestamptz not null default now()
);

-- Sicurezza: ogni tabella è accessibile solo ai membri
alter table membri enable row level security;  -- nessuna policy: non leggibile dall'app

do $$
declare t text;
begin
  foreach t in array array['profili', 'pasti', 'spesa', 'spese', 'pesate'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists solo_membri on %I', t);
    execute format(
      'create policy solo_membri on %I for all to authenticated using (is_member()) with check (is_member())', t);
  end loop;
end $$;

-- Accesso alle tabelle per gli utenti loggati (le policy sopra limitano comunque ai membri)
grant usage on schema public to authenticated;
grant select, insert, update, delete on profili, pasti, spesa, spese, pesate to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function is_member() to authenticated;
