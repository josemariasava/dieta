'use strict';

const MOMENTI = ['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena'];
const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const CATEGORIE_SPESA = ['Frutta e verdura', 'Carne e pesce', 'Latticini e uova', 'Pane, pasta e cereali', 'Legumi', 'Dispensa', 'Altro'];
const CATEGORIE_COSTI = ['Spesa alimentare', 'Nutrizionista', 'Sport e palestra', 'Integratori', 'Altro'];
const PERSONE = ['p1', 'p2'];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const num1 = (n) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const kg = (n) => (n == null ? '—' : `${num1(n)} kg`);
const sum = (arr) => arr.reduce((a, b) => a + Number(b || 0), 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const isoToday = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const todayWeekday = () => ((new Date().getDay() + 6) % 7) + 1;
const fmtDay = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const fmtDate = (s) => fmtDay(new Date(s + 'T00:00'));
const fmtMonth = (ym) => capital(new Date(ym + '-01T00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));
const shiftMonth = (ym, dir) => {
  const d = new Date(ym + '-01T00:00');
  d.setMonth(d.getMonth() + dir);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const state = {
  tab: 'oggi',
  giorno: todayWeekday(),
  filtro: 'tutti',
  mese: isoToday().slice(0, 7),
  ultimo: { persona: 'entrambi', momento: 'Colazione' },
  profili: {},
  pasti: [],
  spesa: [],
  spese: [],
  pesate: []
};

const nome = (p) => {
  if (p === 'entrambi') return 'Entrambi';
  if (p === 'insieme') return 'Insieme';
  return state.profili[p]?.nome || (p === 'p1' ? 'Jose' : 'Lei');
};
const who = (p) => `<span class="who ${esc(p)}">${esc(nome(p))}</span>`;
const options = (values, selected, label = (v) => v) =>
  values.map((v) => `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(label(v))}</option>`).join('');

/* ---------- Supabase ---------- */

const cfg = window.DIETA_CONFIG || {};
let sb = null;

const ORDINE = {
  pasti: ['id', true],
  spesa: ['id', true],
  spese: ['data', false],
  pesate: ['data', true]
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3200);
}

function errore(error) {
  console.error(error);
  if (error?.code === '42501') {
    toast('Questo account non è autorizzato: aggiungi la tua email alla tabella membri su Supabase.');
  } else {
    toast(`Errore: ${error?.message || 'operazione non riuscita'}. Riprova.`);
  }
}

async function run(query) {
  const { data, error } = await query;
  if (error) {
    errore(error);
    throw error;
  }
  return data;
}

async function load(table) {
  const [col, asc] = ORDINE[table];
  let q = sb.from(table).select('*').order(col, { ascending: asc });
  if (table === 'spese' || table === 'pesate') q = q.order('id', { ascending: true });
  state[table] = await run(q);
}

async function loadAll() {
  const [profili] = await Promise.all([
    run(sb.from('profili').select('*')),
    ...Object.keys(ORDINE).map(load)
  ]);
  state.profili = Object.fromEntries(profili.map((p) => [p.persona, p]));
  render();
}

async function reload(table) {
  await load(table);
  render();
}

/* ---------- Views ---------- */

function firstDate() {
  const dates = [...state.pesate.map((p) => p.data), ...state.spese.map((s) => s.data)].sort();
  return dates[0] || null;
}

function personCard(p) {
  const w = state.pesate.filter((x) => x.persona === p);
  const prof = state.profili[p] || {};
  if (!w.length) {
    return `<article class="pcard p-${p}"><h3>${esc(nome(p))}</h3>
      <p class="muted small">Nessuna pesata ancora. Registra il peso di partenza nella sezione Peso.</p></article>`;
  }
  const first = Number(w[0].peso_kg);
  const last = Number(w[w.length - 1].peso_kg);
  const delta = last - first;
  const target = prof.peso_obiettivo != null ? Number(prof.peso_obiettivo) : null;
  let progress = '';
  if (target != null && first > target) {
    const pct = clamp((first - last) / (first - target), 0, 1);
    progress = `<div class="bar" role="img" aria-label="${Math.round(pct * 100)}% dell'obiettivo"><span style="width:${(pct * 100).toFixed(1)}%"></span></div>
      <p class="small muted">${Math.round(pct * 100)}% dell'obiettivo (${kg(target)}) · ${last <= target ? 'obiettivo raggiunto!' : `mancano ${kg(last - target)}`}</p>`;
  } else if (target == null) {
    progress = `<p class="small muted">Imposta un peso obiettivo nelle impostazioni.</p>`;
  }
  let bmi = '';
  if (prof.altezza_cm) {
    const v = last / (Number(prof.altezza_cm) / 100) ** 2;
    const cat = v < 18.5 ? 'sottopeso' : v < 25 ? 'normopeso' : v < 30 ? 'sovrappeso' : 'obesità';
    bmi = `<div><p class="label">IMC</p><p class="num"><strong>${num1(v)}</strong> <span class="small muted">${cat}</span></p></div>`;
  }
  const deltaTxt = delta === 0 ? 'stabile' : `${delta < 0 ? '−' : '+'}${kg(Math.abs(delta))}`;
  return `<article class="pcard p-${p}">
    <h3>${esc(nome(p))}</h3>
    <div class="stats">
      <div><p class="label">Peso attuale</p><p class="big">${kg(last)}</p></div>
      <div><p class="label">Dall'inizio</p><p class="delta ${delta < 0 ? 'good' : delta > 0 ? 'bad' : ''}">${deltaTxt}</p></div>
      ${bmi}
    </div>
    ${progress}
  </article>`;
}

function menuList(items, withDelete = false) {
  const groups = MOMENTI.map((m) => [m, items.filter((i) => i.momento === m)]).filter(([, l]) => l.length);
  if (!groups.length) return '';
  return groups.map(([m, list]) => `<div class="meal"><h4>${esc(m)}</h4><ul class="list">
    ${list.map((i) => `<li>
      <span class="grow">${esc(i.alimento)}${i.note ? `<span class="note">${esc(i.note)}</span>` : ''}</span>
      ${i.quantita ? `<span class="qty">${esc(i.quantita)}</span>` : ''}
      ${who(i.persona)}
      ${withDelete ? `<button class="del" data-action="del" data-table="pasti" data-id="${i.id}" aria-label="Elimina ${esc(i.alimento)}">×</button>` : ''}
    </li>`).join('')}
  </ul></div>`).join('');
}

function chart() {
  const series = PERSONE.map((p) => ({ p, pts: state.pesate.filter((x) => x.persona === p).map((x) => ({ t: Date.parse(x.data + 'T00:00'), v: Number(x.peso_kg) })) }))
    .filter((s) => s.pts.length);
  if (!series.length) return '<p class="empty">Il grafico apparirà dopo la prima pesata.</p>';

  const targets = PERSONE.map((p) => ({ p, v: state.profili[p]?.peso_obiettivo })).filter((t) => t.v != null && series.some((s) => s.p === t.p));
  const all = series.flatMap((s) => s.pts);
  const vals = [...all.map((x) => x.v), ...targets.map((t) => Number(t.v))];
  let t0 = Math.min(...all.map((x) => x.t));
  let t1 = Math.max(...all.map((x) => x.t));
  if (t0 === t1) { t0 -= 3 * 864e5; t1 += 3 * 864e5; }

  const steps = [0.5, 1, 2, 5, 10, 20];
  let lo = Math.min(...vals) - 0.5;
  let hi = Math.max(...vals) + 0.5;
  const step = steps.find((s) => (hi - lo) / s <= 5) || 50;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const W = 400, H = 220, L = 40, R = 8, T = 10, B = 26;
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${num1(v)}</text>`;
  }
  const xl = [t0, t1].map((t, i) => `<text x="${x(t)}" y="${H - 8}" text-anchor="${i ? 'end' : 'start'}">${fmtDay(new Date(t))}</text>`).join('');
  const tl = targets.map((t) => `<line class="target s-${t.p}" x1="${L}" x2="${W - R}" y1="${y(t.v)}" y2="${y(t.v)}"/>`).join('');
  const lines = series.map((s) => {
    const d = s.pts.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.t).toFixed(1)},${y(pt.v).toFixed(1)}`).join(' ');
    const end = s.pts[s.pts.length - 1];
    return `<path class="line s-${s.p}" d="${d}"/>
      ${s.pts.map((pt) => `<circle class="f-${s.p}" cx="${x(pt.t)}" cy="${y(pt.v)}" r="${pt === end ? 5 : 2.5}"/>`).join('')}`;
  }).join('');

  const legend = series.map((s) => `<span style="--c: var(--${s.p})">${esc(nome(s.p))}</span>`).join('') +
    (targets.length ? '<span style="--c: var(--muted)">Obiettivo (tratteggiato)</span>' : '');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento del peso"><g class="grid">${grid}</g>${xl}${tl}${lines}</svg></div><div class="legend">${legend}</div>`;
}

function viewOggi() {
  const start = firstDate();
  const dayN = start ? Math.floor((Date.parse(isoToday()) - Date.parse(start)) / 864e5) + 1 : null;
  const menu = state.pasti.filter((p) => p.giorno === todayWeekday());
  const mese = isoToday().slice(0, 7);
  const meseTot = sum(state.spese.filter((s) => s.data.startsWith(mese)).map((s) => s.importo));
  const daComprare = state.spesa.filter((s) => !s.comprato).length;
  return `
  <section class="hero">
    <p class="eyebrow">${esc(capital(new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })))}</p>
    <h1>${dayN ? `Giorno ${dayN} del percorso` : 'Il percorso inizia qui'}</h1>
  </section>
  <div class="cards">${PERSONE.map(personCard).join('')}</div>
  <section class="panel">
    <div class="panel-head"><h2>Menù di oggi</h2><button class="link" data-action="goto" data-tab="piano">Piano completo</button></div>
    ${menuList(menu) || '<p class="empty">Nessun pasto previsto per oggi. Inserisci il piano del nutrizionista nella sezione Piano.</p>'}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Andamento del peso</h2><button class="link" data-action="goto" data-tab="peso">Registra peso</button></div>
    ${chart()}
  </section>
  <div class="cards">
    <section class="panel row-between">
      <div><p class="label">Spese di ${esc(fmtMonth(mese).toLowerCase())}</p><p class="big">${eur(meseTot)}</p></div>
      <button class="link" data-action="goto" data-tab="spese">Dettagli</button>
    </section>
    <section class="panel row-between">
      <div><p class="label">Da comprare</p><p class="big">${daComprare} ${daComprare === 1 ? 'prodotto' : 'prodotti'}</p></div>
      <button class="link" data-action="goto" data-tab="spesa">Lista</button>
    </section>
  </div>`;
}

function viewPiano() {
  const g = state.giorno;
  const items = state.pasti.filter((p) => p.giorno === g && (state.filtro === 'tutti' || p.persona === state.filtro || p.persona === 'entrambi'));
  return `
  <section class="hero"><p class="eyebrow">Piano alimentare</p><h1>${GIORNI[g - 1]}</h1></section>
  <div class="chips" role="group" aria-label="Giorno">
    ${GIORNI.map((n, i) => `<button class="chip-btn${i + 1 === todayWeekday() ? ' today' : ''}" data-action="giorno" data-g="${i + 1}" aria-pressed="${i + 1 === g}">${n.slice(0, 3)}</button>`).join('')}
  </div>
  <section class="panel">
    <div class="panel-head">
      <h2>Pasti</h2>
      <select id="filtro" aria-label="Mostra pasti di" style="width:auto">
        ${options(['tutti', ...PERSONE], state.filtro, (v) => (v === 'tutti' ? 'Tutti e due' : `Solo ${nome(v)}`))}
      </select>
    </div>
    ${menuList(items, true) || `<p class="empty">Nessun pasto per ${GIORNI[g - 1].toLowerCase()}. Aggiungi il primo alimento qui sotto.</p>`}
    ${items.length ? `<div class="row-end"><button class="link" data-action="copia-giorno">Copia ${GIORNI[g - 1].toLowerCase()} su tutta la settimana</button></div>` : ''}
  </section>
  <section class="panel">
    <h2>Aggiungi alimento</h2>
    <form data-form="pasto" class="form-grid">
      <div class="field"><label for="p-persona">Per</label>
        <select id="p-persona" name="persona">${options(['entrambi', ...PERSONE], state.ultimo.persona, nome)}</select></div>
      <div class="field"><label for="p-momento">Pasto</label>
        <select id="p-momento" name="momento">${options(MOMENTI, state.ultimo.momento)}</select></div>
      <div class="field wide"><label for="p-alimento">Alimento</label>
        <input id="p-alimento" name="alimento" required placeholder="Es. yogurt greco bianco"></div>
      <div class="field"><label for="p-quantita">Quantità</label>
        <input id="p-quantita" name="quantita" placeholder="Es. 150 g"></div>
      <div class="field"><label for="p-note">Note</label>
        <input id="p-note" name="note" placeholder="Es. oppure kefir"></div>
      <button class="btn primary wide" type="submit">Aggiungi a ${GIORNI[g - 1].toLowerCase()}</button>
    </form>
  </section>`;
}

function viewSpesa() {
  const daFare = state.spesa.filter((s) => !s.comprato).length;
  const groups = CATEGORIE_SPESA.map((c) => [c, state.spesa.filter((s) => s.categoria === c)]).filter(([, l]) => l.length);
  const altri = state.spesa.filter((s) => !CATEGORIE_SPESA.includes(s.categoria));
  if (altri.length) groups.push(['Altro', altri]);
  return `
  <section class="hero"><p class="eyebrow">Lista della spesa</p>
    <h1>${state.spesa.length ? `${daFare} da comprare` : 'Lista vuota'}</h1></section>
  <section class="panel">
    <form data-form="spesa" class="form-grid">
      <div class="field wide"><label for="s-nome">Prodotto</label><input id="s-nome" name="nome" required placeholder="Es. petto di pollo"></div>
      <div class="field"><label for="s-quantita">Quantità</label><input id="s-quantita" name="quantita" placeholder="Es. 500 g"></div>
      <div class="field"><label for="s-categoria">Reparto</label><select id="s-categoria" name="categoria">${options(CATEGORIE_SPESA, 'Frutta e verdura')}</select></div>
      <button class="btn primary wide" type="submit">Aggiungi alla lista</button>
    </form>
    <div class="row-between">
      <button class="link" data-action="genera-spesa">Aggiungi gli alimenti del piano</button>
      ${state.spesa.some((s) => s.comprato) ? '<button class="link" data-action="pulisci-spesa">Rimuovi i prodotti comprati</button>' : ''}
    </div>
  </section>
  ${groups.length ? groups.map(([c, list]) => `<section class="panel"><h4>${esc(c)}</h4><ul class="list">
    ${list.map((s) => `<li class="${s.comprato ? 'done' : ''}">
      <input type="checkbox" class="check" id="chk-${s.id}" data-toggle="${s.id}"${s.comprato ? ' checked' : ''}>
      <label class="grow" for="chk-${s.id}" style="color:inherit;font-weight:400;font-size:1rem">${esc(s.nome)}</label>
      ${s.quantita ? `<span class="qty">${esc(s.quantita)}</span>` : ''}
      <button class="del" data-action="del" data-table="spesa" data-id="${s.id}" aria-label="Elimina ${esc(s.nome)}">×</button>
    </li>`).join('')}
  </ul></section>`).join('') : '<p class="empty">Aggiungi i prodotti a mano oppure prendili dal piano alimentare.</p>'}`;
}

function viewSpese() {
  const mese = state.mese;
  const delMese = state.spese.filter((s) => s.data.startsWith(mese));
  const tot = sum(delMese.map((s) => s.importo));
  const perCat = CATEGORIE_COSTI.map((c) => [c, sum(delMese.filter((s) => s.categoria === c).map((s) => s.importo))]).filter(([, v]) => v > 0);
  const max = Math.max(...perCat.map(([, v]) => v), 1);
  const totale = sum(state.spese.map((s) => s.importo));
  const pagato = (p) => sum(delMese.filter((s) => s.pagato_da === p).map((s) => s.importo));
  return `
  <section class="hero"><p class="eyebrow">Spese</p><h1>${eur(tot)} a ${esc(fmtMonth(mese).toLowerCase())}</h1></section>
  <div class="row-between">
    <button class="btn" data-action="mese" data-dir="-1" aria-label="Mese precedente">‹ ${esc(fmtMonth(shiftMonth(mese, -1)))}</button>
    ${mese < isoToday().slice(0, 7) ? `<button class="btn" data-action="mese" data-dir="1" aria-label="Mese successivo">${esc(fmtMonth(shiftMonth(mese, 1)))} ›</button>` : ''}
  </div>
  <section class="panel">
    <div class="totals">
      <div><p class="label">Pagato da ${esc(nome('p1'))}</p><p class="num"><strong>${eur(pagato('p1'))}</strong></p></div>
      <div><p class="label">Pagato da ${esc(nome('p2'))}</p><p class="num"><strong>${eur(pagato('p2'))}</strong></p></div>
      <div><p class="label">Insieme</p><p class="num"><strong>${eur(pagato('insieme'))}</strong></p></div>
      <div><p class="label">Totale del percorso</p><p class="num"><strong>${eur(totale)}</strong></p></div>
    </div>
    ${perCat.length ? `<div class="catbars">${perCat.map(([c, v]) => `<div class="catbar"><span>${esc(c)}</span><div class="bar"><span style="width:${(v / max) * 100}%"></span></div><span class="num">${eur(v)}</span></div>`).join('')}</div>` : ''}
  </section>
  <section class="panel">
    <h2>Nuova spesa</h2>
    <form data-form="costo" class="form-grid">
      <div class="field wide"><label for="c-descrizione">Descrizione</label><input id="c-descrizione" name="descrizione" required placeholder="Es. spesa settimanale Esselunga"></div>
      <div class="field"><label for="c-importo">Importo (€)</label><input id="c-importo" name="importo" type="number" inputmode="decimal" step="0.01" min="0" required></div>
      <div class="field"><label for="c-data">Data</label><input id="c-data" name="data" type="date" value="${isoToday()}" required></div>
      <div class="field"><label for="c-categoria">Categoria</label><select id="c-categoria" name="categoria">${options(CATEGORIE_COSTI, 'Spesa alimentare')}</select></div>
      <div class="field"><label for="c-pagato">Pagato da</label><select id="c-pagato" name="pagato_da">${options(['insieme', ...PERSONE], 'insieme', nome)}</select></div>
      <button class="btn primary wide" type="submit">Aggiungi spesa</button>
    </form>
  </section>
  <section class="panel">
    <h2>Movimenti del mese</h2>
    ${delMese.length ? `<ul class="list">${delMese.map((s) => `<li>
      <span class="grow">${esc(s.descrizione)}<span class="note">${fmtDate(s.data)} · ${esc(s.categoria)}</span></span>
      ${who(s.pagato_da)}
      <span class="num"><strong>${eur(s.importo)}</strong></span>
      <button class="del" data-action="del" data-table="spese" data-id="${s.id}" aria-label="Elimina ${esc(s.descrizione)}">×</button>
    </li>`).join('')}</ul>` : '<p class="empty">Nessuna spesa registrata in questo mese.</p>'}
  </section>`;
}

function viewPeso() {
  const rows = [...state.pesate].reverse();
  const prevOf = (r) => {
    const same = state.pesate.filter((x) => x.persona === r.persona);
    const i = same.findIndex((x) => x.id === r.id);
    return i > 0 ? Number(same[i - 1].peso_kg) : null;
  };
  return `
  <section class="hero"><p class="eyebrow">Peso e misure</p><h1>Il nostro andamento</h1></section>
  <section class="panel">
    <h2>Nuova pesata</h2>
    <form data-form="pesata" class="form-grid">
      <div class="field"><label for="w-persona">Chi</label><select id="w-persona" name="persona">${options(PERSONE, 'p1', nome)}</select></div>
      <div class="field"><label for="w-data">Data</label><input id="w-data" name="data" type="date" value="${isoToday()}" required></div>
      <div class="field"><label for="w-peso">Peso (kg)</label><input id="w-peso" name="peso_kg" type="number" inputmode="decimal" step="0.1" min="20" max="300" required></div>
      <div class="field"><label for="w-vita">Giro vita (cm)</label><input id="w-vita" name="vita_cm" type="number" inputmode="decimal" step="0.5" min="30" max="250" placeholder="Facoltativo"></div>
      <button class="btn primary wide" type="submit">Salva pesata</button>
    </form>
  </section>
  <div class="cards">${PERSONE.map(personCard).join('')}</div>
  <section class="panel"><h2>Grafico</h2>${chart()}</section>
  <section class="panel">
    <h2>Storico</h2>
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Chi</th><th class="r">Peso</th><th class="r">Var.</th><th class="r">Vita</th><th></th></tr></thead>
      <tbody>${rows.map((r) => {
        const prev = prevOf(r);
        const d = prev == null ? null : Number(r.peso_kg) - prev;
        return `<tr>
          <td>${fmtDate(r.data)}</td><td>${who(r.persona)}</td>
          <td class="r">${kg(r.peso_kg)}</td>
          <td class="r"><span class="delta ${d < 0 ? 'good' : d > 0 ? 'bad' : ''}">${d == null ? '—' : d === 0 ? '0' : `${d < 0 ? '−' : '+'}${num1(Math.abs(d))}`}</span></td>
          <td class="r">${r.vita_cm ? `${num1(r.vita_cm)} cm` : '—'}</td>
          <td class="r"><button class="del" data-action="del" data-table="pesate" data-id="${r.id}" aria-label="Elimina pesata">×</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="empty">Ancora nessuna pesata. Registrate il peso di partenza per iniziare.</p>'}
  </section>`;
}

const VIEWS = { oggi: viewOggi, piano: viewPiano, spesa: viewSpesa, spese: viewSpese, peso: viewPeso };

function render() {
  $('#view').innerHTML = VIEWS[state.tab]();
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.tab === state.tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function goto(tab) {
  state.tab = tab;
  try { localStorage.setItem('dieta-tab', tab); } catch {}
  render();
  window.scrollTo(0, 0);
}

/* ---------- Actions ---------- */

const FORMS = {
  async pasto(f) {
    state.ultimo = { persona: f.persona, momento: f.momento };
    await run(sb.from('pasti').insert({ ...f, giorno: state.giorno, quantita: f.quantita || null, note: f.note || null }));
    await reload('pasti');
    $('#p-alimento')?.focus();
  },
  async spesa(f) {
    await run(sb.from('spesa').insert({ ...f, quantita: f.quantita || null }));
    await reload('spesa');
    $('#s-nome')?.focus();
  },
  async costo(f) {
    await run(sb.from('spese').insert({ ...f, importo: Number(f.importo) }));
    state.mese = f.data.slice(0, 7);
    await reload('spese');
    toast('Spesa aggiunta');
  },
  async pesata(f) {
    await run(sb.from('pesate').insert({ ...f, peso_kg: Number(f.peso_kg), vita_cm: f.vita_cm ? Number(f.vita_cm) : null }));
    await reload('pesate');
    toast(`Pesata di ${nome(f.persona)} salvata`);
  }
};

const ACTIONS = {
  goto: (el) => goto(el.dataset.tab),
  giorno(el) { state.giorno = Number(el.dataset.g); render(); },
  mese(el) { state.mese = shiftMonth(state.mese, Number(el.dataset.dir)); render(); },
  async del(el) {
    if (!confirm('Eliminare questo elemento?')) return;
    await run(sb.from(el.dataset.table).delete().eq('id', el.dataset.id));
    await reload(el.dataset.table);
  },
  async 'copia-giorno'() {
    const g = state.giorno;
    const src = state.pasti.filter((p) => p.giorno === g);
    if (!confirm(`Copiare i ${src.length} alimenti di ${GIORNI[g - 1].toLowerCase()} su tutti gli altri giorni? Quelli già presenti negli altri giorni restano.`)) return;
    const rows = [];
    for (let d = 1; d <= 7; d++) {
      if (d === g) continue;
      src.forEach(({ persona, momento, alimento, quantita, note }) => rows.push({ persona, giorno: d, momento, alimento, quantita, note }));
    }
    await run(sb.from('pasti').insert(rows));
    await reload('pasti');
    toast('Piano copiato su tutta la settimana');
  },
  async 'genera-spesa'() {
    const presenti = new Set(state.spesa.filter((s) => !s.comprato).map((s) => s.nome.trim().toLowerCase()));
    const nuovi = new Map();
    state.pasti.forEach((p) => {
      const k = p.alimento.trim().toLowerCase();
      if (!presenti.has(k) && !nuovi.has(k)) nuovi.set(k, p.alimento.trim());
    });
    if (!nuovi.size) return toast(state.pasti.length ? 'Tutti gli alimenti del piano sono già in lista' : 'Il piano alimentare è ancora vuoto');
    await run(sb.from('spesa').insert([...nuovi.values()].map((nome) => ({ nome, categoria: 'Altro' }))));
    await reload('spesa');
    toast(`Aggiunti ${nuovi.size} alimenti dal piano`);
  },
  async 'pulisci-spesa'() {
    await run(sb.from('spesa').delete().eq('comprato', true));
    await reload('spesa');
  },
  impostazioni() {
    $('#settings-fields').innerHTML = PERSONE.map((p) => {
      const pr = state.profili[p] || {};
      return `<fieldset class="person-settings" style="border:1px solid var(--line);border-radius:10px;padding:12px">
        <legend class="who ${p}">${p === 'p1' ? 'Persona 1' : 'Persona 2'}</legend>
        <label for="st-nome-${p}">Nome</label><input id="st-nome-${p}" name="nome-${p}" value="${esc(pr.nome || nome(p))}" required>
        <div class="form-grid">
          <div class="field"><label for="st-alt-${p}">Altezza (cm)</label><input id="st-alt-${p}" name="alt-${p}" type="number" step="0.5" min="100" max="230" value="${pr.altezza_cm ?? ''}"></div>
          <div class="field"><label for="st-obj-${p}">Peso obiettivo (kg)</label><input id="st-obj-${p}" name="obj-${p}" type="number" step="0.1" min="30" max="250" value="${pr.peso_obiettivo ?? ''}"></div>
        </div>
      </fieldset>`;
    }).join('');
    $('#settings').showModal();
  },
  async logout() {
    $('#settings').close();
    await sb.auth.signOut();
  }
};

document.addEventListener('click', async (e) => {
  const tabBtn = e.target.closest('.tabbar button');
  if (tabBtn) return goto(tabBtn.dataset.tab);
  const el = e.target.closest('[data-action]');
  if (!el || !ACTIONS[el.dataset.action]) return;
  el.disabled = true;
  try { await ACTIONS[el.dataset.action](el); } catch {} finally { el.disabled = false; }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    const data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
    await FORMS[form.dataset.form](data);
  } catch {} finally { btn.disabled = false; }
});

document.addEventListener('change', async (e) => {
  if (e.target.id === 'filtro') {
    state.filtro = e.target.value;
    return render();
  }
  const id = e.target.dataset.toggle;
  if (!id) return;
  try {
    await run(sb.from('spesa').update({ comprato: e.target.checked }).eq('id', id));
    await reload('spesa');
  } catch {
    e.target.checked = !e.target.checked;
  }
});

$('#settings-form').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const n = (v) => (String(v ?? '').trim() === '' ? null : Number(v));
  const rows = PERSONE.map((p) => ({
    persona: p,
    nome: String(f.get(`nome-${p}`)).trim() || nome(p),
    altezza_cm: n(f.get(`alt-${p}`)),
    peso_obiettivo: n(f.get(`obj-${p}`))
  }));
  try {
    await run(sb.from('profili').upsert(rows));
    rows.forEach((r) => (state.profili[r.persona] = r));
    $('#settings').close();
    render();
    toast('Impostazioni salvate');
  } catch {}
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $('#login-error');
  err.hidden = true;
  const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  if (error) {
    err.textContent = error.message === 'Invalid login credentials' ? 'Email o password errate.' : error.message;
    err.hidden = false;
  }
});

/* ---------- Start ---------- */

function showScreen(id) {
  ['setup', 'login', 'app'].forEach((s) => ($('#' + s).hidden = s !== id));
}

let caricato = false;
async function onSession(session) {
  if (!session) {
    caricato = false;
    return showScreen('login');
  }
  showScreen('app');
  if (caricato) return;
  caricato = true;
  render();
  try { await loadAll(); } catch {}
}

if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
  showScreen('setup');
} else {
  try { const t = localStorage.getItem('dieta-tab'); if (VIEWS[t]) state.tab = t; } catch {}
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  sb.auth.getSession().then(({ data }) => onSession(data.session));
  sb.auth.onAuthStateChange((_event, session) => onSession(session));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && caricato) loadAll().catch(() => {});
  });
}
