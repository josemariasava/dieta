# Diario Leggero

App web per il nostro percorso con il nutrizionista: piano alimentare, lista della spesa, spese e andamento del peso.

- Sito statico (HTML/CSS/JS, nessuna build) pubblicato con GitHub Pages.
- Dati e login su Supabase (piano gratuito). Accesso solo alle email nella tabella `membri`.

## Configurazione
1. Esegui `schema.sql` nel SQL Editor di Supabase, poi aggiungi le email in `membri`.
2. Crea i due utenti in Authentication > Users > Add user (spunta "Auto Confirm User").
3. Inserisci Project URL e chiave anon in `config.js`.
4. Esegui `migrazione-02.sql` (diario, visite, tempo reale).
