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
const pad = (n) => String(n).padStart(2, '0');
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoToday = () => localIso(new Date());
const shiftDay = (iso, n) => {
  const d = new Date(iso + 'T00:00');
  d.setDate(d.getDate() + n);
  return localIso(d);
};
const weekdayOf = (iso) => ((new Date(iso + 'T00:00').getDay() + 6) % 7) + 1;
const todayWeekday = () => weekdayOf(isoToday());
const fmtDay = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const fmtDate = (s) => fmtDay(new Date(s + 'T00:00'));
const fmtLong = (s) => capital(new Date(s + 'T00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }));
const segno = (d) => (d === 0 ? 'stabile' : `${d < 0 ? '−' : '+'}${kg(Math.abs(d))}`);
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
  diarioData: isoToday(),
  ultimo: { persona: 'entrambi', momento: 'Colazione' },
  mancaMigrazione: false,
  profili: {},
  pasti: [],
  spesa: [],
  spese: [],
  pesate: [],
  diario: [],
  visite: []
};

const STATI = [['fatto', 'Fatto'], ['sgarro', 'Sgarro'], ['saltato', 'Saltato']];

const nome = (p) => {
  if (p === 'entrambi') return 'Entrambi';
  if (p === 'insieme') return 'Insieme';
  return state.profili[p]?.nome || (p === 'p1' ? 'Jose' : 'Annalisa');
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
  pesate: ['data', true],
  diario: ['data', true],
  visite: ['data', false]
};
// Tabelle aggiunte da migrazione-02.sql: se mancano, l'app funziona lo stesso
const NUOVE = new Set(['diario', 'visite']);

function toast(msg) {
  // Con le impostazioni aperte il messaggio va dentro la finestra, altrimenti resta nascosto sotto
  if ($('#settings').open) {
    const m = $('#settings-msg');
    m.textContent = msg;
    m.hidden = false;
    return;
  }
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
  if (table === 'profili') {
    const rows = await run(sb.from('profili').select('*'));
    state.profili = Object.fromEntries(rows.map((p) => [p.persona, p]));
    return;
  }
  const [col, asc] = ORDINE[table];
  let q = sb.from(table).select('*').order(col, { ascending: asc });
  if (col !== 'id') q = q.order('id', { ascending: true });
  if (NUOVE.has(table)) {
    const { data, error } = await q;
    if (error) {
      console.warn(error);
      state.mancaMigrazione = true;
      state[table] = [];
      return;
    }
    state[table] = data;
    return;
  }
  state[table] = await run(q);
}

async function loadAll() {
  state.mancaMigrazione = false;
  await Promise.all(['profili', ...Object.keys(ORDINE)].map(load));
  render();
}

async function reload(table) {
  await load(table);
  render();
}

/* Tempo reale: quando l'altra persona modifica qualcosa, ricarico quella tabella.
   Se state scrivendo in un campo, aspetto che finiate prima di ridisegnare. */
let renderInSospeso = false;
const staScrivendo = () => {
  const a = document.activeElement;
  return !!a && $('#view').contains(a) && a.matches('input:not([type="checkbox"]), textarea, select');
};
function softRender() {
  if (staScrivendo()) renderInSospeso = true;
  else render();
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (renderInSospeso && !staScrivendo()) {
    renderInSospeso = false;
    render();
  }
}, 0));

let canale = null;
const timers = {};
function ascolta() {
  if (canale) return;
  canale = sb.channel('modifiche')
    .on('postgres_changes', { event: '*', schema: 'public' }, ({ table }) => {
      if (table !== 'profili' && !ORDINE[table]) return;
      clearTimeout(timers[table]);
      timers[table] = setTimeout(() => load(table).then(softRender).catch(() => {}), 300);
    })
    .subscribe();
}

/* ---------- Views ---------- */

function firstDate() {
  const dates = [...state.pesate.map((p) => p.data), ...state.spese.map((s) => s.data)].sort();
  return dates[0] || null;
}

function aderenza(p, from, to) {
  const r = state.diario.filter((x) => x.persona === p && x.data >= from && x.data <= to);
  if (!r.length) return null;
  return {
    pct: Math.round((100 * r.filter((x) => x.stato === 'fatto').length) / r.length),
    n: r.length,
    sgarri: r.filter((x) => x.stato === 'sgarro').length
  };
}

function weightAt(p, iso) {
  const w = state.pesate.filter((x) => x.persona === p && x.data <= iso);
  return w.length ? Number(w[w.length - 1].peso_kg) : null;
}

function personCard(p) {
  const w = state.pesate.filter((x) => x.persona === p);
  const prof = state.profili[p] || {};
  const a = aderenza(p, shiftDay(isoToday(), -6), isoToday());
  const settimana = a
    ? `<p class="small">Piano seguito negli ultimi 7 giorni: <strong>${a.pct}%</strong> <span class="muted">(${a.n} ${a.n === 1 ? 'pasto segnato' : 'pasti segnati'})</span></p>`
    : '';
  if (!w.length) {
    return `<article class="pcard p-${p}"><h3>${esc(nome(p))}</h3>
      <p class="muted small">Nessuna pesata ancora. Registra il peso di partenza nella sezione Peso.</p>${settimana}</article>`;
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
  return `<article class="pcard p-${p}">
    <h3>${esc(nome(p))}</h3>
    <div class="stats">
      <div><p class="label">Peso attuale</p><p class="big">${kg(last)}</p></div>
      <div><p class="label">Dall'inizio</p><p class="delta ${delta < 0 ? 'good' : delta > 0 ? 'bad' : ''}">${segno(delta)}</p></div>
      ${bmi}
    </div>
    ${progress}
    ${settimana}
  </article>`;
}

function diarioPanel() {
  const data = state.diarioData;
  const oggi = isoToday();
  const g = weekdayOf(data);
  const titolo = data === oggi ? 'oggi' : data === shiftDay(oggi, -1) ? 'ieri' : fmtLong(data).toLowerCase();
  const blocchi = PERSONE.map((p) => {
    const previsti = MOMENTI.filter((m) => state.pasti.some((x) => x.giorno === g && x.momento === m && (x.persona === p || x.persona === 'entrambi')));
    const momenti = previsti.length ? previsti : MOMENTI;
    return `<div class="diary p-${p}"><h3>${esc(nome(p))}</h3><ul class="list">${momenti.map((m) => {
      const r = state.diario.find((x) => x.persona === p && x.data === data && x.momento === m);
      return `<li>
        <span class="grow">${esc(m)}${r?.nota ? `<span class="note">${esc(r.nota)}</span>` : ''}</span>
        <span class="seg" role="group" aria-label="${esc(m)} di ${esc(nome(p))}">${STATI.map(([s, l]) =>
          `<button class="seg-btn s-${s}" data-action="diario" data-p="${p}" data-m="${esc(m)}" data-s="${s}" aria-pressed="${r?.stato === s}">${l}</button>`).join('')}</span>
      </li>`;
    }).join('')}</ul></div>`;
  }).join('');
  return `<section class="panel">
    <div class="panel-head">
      <h2>Diario di ${esc(titolo)}</h2>
      <span class="row-end">
        <button class="btn small-btn" data-action="diario-giorno" data-dir="-1" aria-label="Giorno precedente">‹</button>
        ${data < oggi ? '<button class="btn small-btn" data-action="diario-giorno" data-dir="1" aria-label="Giorno successivo">›</button>' : ''}
      </span>
    </div>
    <p class="small muted">Segnate com'è andato ogni pasto. Toccate di nuovo lo stesso pulsante per annullare.</p>
    <div class="cards">${blocchi}</div>
  </section>`;
}

function riepilogo(from, to) {
  return PERSONE.map((p) => {
    const primo = state.pesate.find((x) => x.persona === p);
    const start = from ? weightAt(p, from) : primo ? Number(primo.peso_kg) : null;
    const end = weightAt(p, to);
    const d = start != null && end != null ? end - start : null;
    const a = aderenza(p, from || '0000-01-01', to);
    return `<div>
      <p><strong class="who-name p-${p}">${esc(nome(p))}</strong></p>
      <p class="small">Peso: ${d == null ? '—' : `<span class="delta ${d < 0 ? 'good' : d > 0 ? 'bad' : ''}">${segno(d)}</span>`}</p>
      <p class="small">Piano seguito: ${a ? `<strong>${a.pct}%</strong>${a.sgarri ? ` · ${a.sgarri} ${a.sgarri === 1 ? 'sgarro' : 'sgarri'}` : ''}` : '—'}</p>
    </div>`;
  }).join('');
}

const ordinaVisite = (a, b) => (a.data + (a.ora || '')).localeCompare(b.data + (b.ora || ''));
const quando = (iso) => {
  const n = Math.round((Date.parse(iso + 'T00:00') - Date.parse(isoToday() + 'T00:00')) / 864e5);
  return n === 0 ? 'oggi' : n === 1 ? 'domani' : `tra ${n} giorni`;
};
const oraTxt = (v) => (v.ora ? `, ore ${v.ora.slice(0, 5)}` : '');

function prossimaVisita() {
  return state.visite.filter((v) => v.data >= isoToday()).sort(ordinaVisite)[0] || null;
}

function viewVisite() {
  const oggi = isoToday();
  const prossima = prossimaVisita();
  const ultima = state.visite.filter((v) => v.data < oggi)[0] || null;
  const precedente = (v) => state.visite.filter((x) => x.data < v.data)[0] || null;
  return `
  <section class="hero"><p class="eyebrow">Nutrizionista</p><h1>Visite</h1></section>
  ${prossima ? `<section class="panel next">
    <p class="eyebrow">Prossima visita · ${quando(prossima.data)}</p>
    <h2>${esc(fmtLong(prossima.data))}${esc(oraTxt(prossima))}</h2>
    <p class="small muted">Da raccontare al nutrizionista: ${ultima ? `dall'ultima visita (${fmtDate(ultima.data)})` : "dall'inizio del percorso"} a oggi.</p>
    <div class="totals">${riepilogo(ultima?.data ?? null, oggi)}</div>
  </section>` : ''}
  <section class="panel">
    <h2>Nuova visita</h2>
    <form data-form="visita" class="form-grid">
      <div class="field"><label for="v-data">Data</label><input id="v-data" name="data" type="date" value="${shiftDay(oggi, 7)}" required></div>
      <div class="field"><label for="v-ora">Ora</label><input id="v-ora" name="ora" type="time"></div>
      <div class="field wide"><label for="v-note">Note</label><textarea id="v-note" name="note" rows="2" placeholder="Domande da fare, indicazioni ricevute…"></textarea></div>
      <button class="btn primary wide" type="submit">Aggiungi visita</button>
    </form>
  </section>
  ${state.visite.length ? state.visite.map((v) => {
    const prev = precedente(v);
    return `<section class="panel">
      <div class="panel-head">
        <h3>${esc(fmtLong(v.data))}${esc(oraTxt(v))}</h3>
        <span class="row-end">
          <span class="who ${v.data >= oggi ? 'p1' : 'entrambi'}">${v.data >= oggi ? 'In programma' : 'Fatta'}</span>
          <button class="del" data-action="del" data-table="visite" data-id="${v.id}" aria-label="Elimina visita">×</button>
        </span>
      </div>
      ${v.data <= oggi ? `<p class="small muted">${prev ? `Dalla visita del ${fmtDate(prev.data)}` : "Dall'inizio del percorso"} a questa visita</p><div class="totals">${riepilogo(prev?.data ?? null, v.data)}</div>` : ''}
      <form data-form="nota-visita" data-id="${v.id}" class="form-grid">
        <div class="field wide"><label for="vn-${v.id}">${v.data >= oggi ? 'Domande da fare' : 'Indicazioni ricevute'}</label>
          <textarea id="vn-${v.id}" name="note" rows="3">${esc(v.note)}</textarea></div>
        <div class="row-end wide"><button class="btn" type="submit">Salva note</button></div>
      </form>
    </section>`;
  }).join('') : '<p class="empty">Nessuna visita registrata. Aggiungete il primo appuntamento con il nutrizionista.</p>'}`;
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
  const visita = prossimaVisita();
  return `
  <section class="hero">
    <p class="eyebrow">${esc(fmtLong(isoToday()))}</p>
    <h1>${dayN ? `Giorno ${dayN} del percorso` : 'Il percorso inizia qui'}</h1>
  </section>
  ${visita ? `<section class="panel next row-between">
    <div><p class="eyebrow">Visita dal nutrizionista · ${quando(visita.data)}</p><p><strong>${esc(fmtLong(visita.data))}${esc(oraTxt(visita))}</strong></p></div>
    <button class="link" data-action="goto" data-tab="visite">Riepilogo</button>
  </section>` : ''}
  <div class="cards">${PERSONE.map(personCard).join('')}</div>
  ${state.mancaMigrazione ? '' : diarioPanel()}
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

const VIEWS = { oggi: viewOggi, piano: viewPiano, spesa: viewSpesa, spese: viewSpese, peso: viewPeso, visite: viewVisite };

function render() {
  renderInSospeso = false;
  const avviso = state.mancaMigrazione
    ? '<p class="banner">Diario e visite non sono ancora attivi: eseguite <code>migrazione-02.sql</code> nel SQL Editor di Supabase.</p>'
    : '';
  $('#view').innerHTML = avviso + VIEWS[state.tab]();
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
  },
  async visita(f) {
    await run(sb.from('visite').insert({ data: f.data, ora: f.ora || null, note: f.note || null }));
    await reload('visite');
    toast('Visita aggiunta');
  },
  async 'nota-visita'(f, form) {
    await run(sb.from('visite').update({ note: f.note || null }).eq('id', form.dataset.id));
    await reload('visite');
    toast('Note salvate');
  }
};

function caricaScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error('download non riuscito'));
    document.head.appendChild(s);
  });
}

const ACTIONS = {
  goto: (el) => goto(el.dataset.tab),
  giorno(el) { state.giorno = Number(el.dataset.g); render(); },
  mese(el) { state.mese = shiftMonth(state.mese, Number(el.dataset.dir)); render(); },
  'diario-giorno'(el) { state.diarioData = shiftDay(state.diarioData, Number(el.dataset.dir)); render(); },
  async diario(el) {
    const { p, m, s } = el.dataset;
    const data = state.diarioData;
    const r = state.diario.find((x) => x.persona === p && x.data === data && x.momento === m);
    if (r?.stato === s) {
      await run(sb.from('diario').delete().eq('id', r.id));
    } else {
      let nota = null;
      if (s === 'sgarro') {
        const t = prompt('Cosa avete mangiato? (facoltativo)', r?.nota || '');
        if (t === null) return;
        nota = t.trim() || null;
      }
      await run(sb.from('diario').upsert({ persona: p, data, momento: m, stato: s, nota }, { onConflict: 'persona,data,momento' }));
    }
    await reload('diario');
  },
  async esporta() {
    if (!window.XLSX) {
      try {
        await caricaScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      } catch (e) {
        toast('Non riesco a scaricare il modulo per Excel. Controllate la connessione e riprovate.');
        throw e;
      }
    }
    await loadAll();
    const val = (v) => (v == null ? '' : v);
    const fogli = {
      Pesate: state.pesate.map((r) => ({ Data: r.data, Chi: nome(r.persona), 'Peso (kg)': Number(r.peso_kg), 'Vita (cm)': r.vita_cm != null ? Number(r.vita_cm) : '', Note: val(r.note) })),
      Diario: state.diario.map((r) => ({ Data: r.data, Chi: nome(r.persona), Pasto: r.momento, Stato: capital(r.stato), Nota: val(r.nota) })),
      Piano: state.pasti.map((r) => ({ Giorno: GIORNI[r.giorno - 1], Pasto: r.momento, Per: nome(r.persona), Alimento: r.alimento, Quantità: val(r.quantita), Note: val(r.note) })),
      Spese: state.spese.map((r) => ({ Data: r.data, Descrizione: r.descrizione, Categoria: r.categoria, 'Importo (€)': Number(r.importo), 'Pagato da': nome(r.pagato_da) })),
      Visite: state.visite.map((r) => ({ Data: r.data, Ora: r.ora ? r.ora.slice(0, 5) : '', Note: val(r.note) })),
      Spesa: state.spesa.map((r) => ({ Prodotto: r.nome, Quantità: val(r.quantita), Reparto: r.categoria, Comprato: r.comprato ? 'sì' : 'no' })),
      Profili: PERSONE.map((p) => ({ Persona: nome(p), 'Altezza (cm)': val(state.profili[p]?.altezza_cm), 'Peso obiettivo (kg)': val(state.profili[p]?.peso_obiettivo) }))
    };
    const wb = XLSX.utils.book_new();
    Object.entries(fogli).forEach(([n, rows]) =>
      XLSX.utils.book_append_sheet(wb, rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['Nessun dato']]), n));
    XLSX.writeFile(wb, `diario-leggero-${isoToday()}.xlsx`);
    toast('File Excel scaricato');
  },
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
          <div class="field"><label for="st-alt-${p}">Altezza (cm)</label><input id="st-alt-${p}" name="alt-${p}" type="number" inputmode="decimal" step="any" min="100" max="230" value="${pr.altezza_cm ?? ''}"></div>
          <div class="field"><label for="st-obj-${p}">Peso obiettivo (kg)</label><input id="st-obj-${p}" name="obj-${p}" type="number" inputmode="decimal" step="any" min="30" max="250" value="${pr.peso_obiettivo ?? ''}"></div>
        </div>
      </fieldset>`;
    }).join('');
    $('#settings-msg').hidden = true;
    $('#settings').showModal();
  },
  async logout() {
    $('#settings').close();
    if (canale) await sb.removeChannel(canale);
    canale = null;
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
    await FORMS[form.dataset.form](data, form);
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
  try {
    await loadAll();
    ascolta();
  } catch {}
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
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
