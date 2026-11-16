/*!
 * DaF-Lernspeicher (progress.js) – gemeinsamer lokaler Fortschritt für alle DaF-Spiele
 *
 * Aufgabe: Jedes Spiel meldet nur "Wort X, Fähigkeit Y, richtig/falsch". Dieses Modul speichert das im
 * Browser (localStorage) und sagt jedem Spiel, welche Wörter als Nächstes geübt werden sollten –
 * auch Wörter, bei denen man in einem ANDEREN Spiel Fehler gemacht hat.
 *
 * Voraussetzung für spielübergreifenden Fortschritt: alle Spiele liegen auf derselben Origin
 * (z. B. wirrdad.github.io) und benutzen denselben Speicher-Schlüssel (STORAGE_KEY unten).
 *
 * Einbinden:
 *   <script src="https://wirrdad.github.io/daf-shared/progress.js"></script>
 *   DafProgress.init().then(function () { ... DafProgress.pick(...) ... DafProgress.record(...) });
 *
 * Alle Daten bleiben auf dem Gerät. Es wird nichts hochgeladen.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else {
    // Den eigenen Skript-Pfad merken, damit vocab_a1.json standardmäßig daneben gefunden wird
    var src = '';
    try { src = (document.currentScript && document.currentScript.src) || ''; } catch (e) {}
    root.DafProgress = api.create({ scriptUrl: src });
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'daf.v1.fortschritt';   // NICHT ändern, sonst sehen die Spiele den Fortschritt nicht mehr
  var SCHEMA = 1;
  var NIVEAUS = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'];
  var BOX_TAGE = [0, 1, 3, 7, 14];            // Leitner: Box 0 sofort wieder, Box 4 erst nach 14 Tagen
  var TAG = 86400000;
  var GRAMMATIK_ID = '*';                     // Platzhalter für Einträge ohne Einzelwort (Satzspiele)

  // Fähigkeiten, die die Spiele melden dürfen (freie Zusätze mit "g:" für Grammatikthemen sind erlaubt)
  var SKILLS = ['wortart', 'artikel', 'plural', 'schreibung', 'bedeutung', 'konjugation', 'pronomen',
                'kasus', 'thema', 'erkennen'];

  function create(opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var random = opts.random || Math.random;
    var maxLog = opts.maxLog || 300;
    var storage = opts.storage !== undefined ? opts.storage : defaultStorage();
    var vocab = opts.vocab || null;
    var vocabUrl = opts.vocabUrl || guessVocabUrl(opts.scriptUrl);
    var persistent = !!storage;
    var state = load();
    var index = null;

    // ---------- Speicher ----------
    function defaultStorage() {
      try {
        var s = typeof localStorage !== 'undefined' ? localStorage : null;
        if (!s) return null;
        s.setItem('daf.v1.test', '1'); s.removeItem('daf.v1.test');   // Privatmodus/gesperrt erkennen
        return s;
      } catch (e) { return null; }
    }
    function fresh() { return { v: SCHEMA, created: now(), updated: now(), items: {}, log: [] }; }
    function load() {
      if (!storage) return fresh();
      var raw = null;
      try { raw = storage.getItem(STORAGE_KEY); } catch (e) { persistent = false; return fresh(); }
      if (!raw) return fresh();
      try {
        var d = JSON.parse(raw);
        if (!d || d.v !== SCHEMA || typeof d.items !== 'object') throw new Error('schema');
        if (!d.log) d.log = [];
        return d;
      } catch (e) {
        // Defekte oder fremde Daten sichern statt zu überschreiben
        try { storage.setItem(STORAGE_KEY + '.defekt', raw); } catch (e2) {}
        return fresh();
      }
    }
    function save() {
      state.updated = now();
      if (!storage) return false;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); persistent = true; return true; }
      catch (e) { persistent = false; return false; }   // z. B. Speicher voll: Spiel läuft weiter
    }
    function guessVocabUrl(scriptUrl) {
      if (scriptUrl && /progress\.js/.test(scriptUrl)) return scriptUrl.replace(/progress\.js.*$/, 'vocab_a1.json');
      return 'vocab_a1.json';
    }

    // ---------- Wortschatz ----------
    function buildIndex(v) {
      var idx = { words: {}, byForm: {}, themen: {} };
      (v.themen || []).forEach(function (t) { idx.themen[t.id] = t; });
      function addForm(f, id, kind) {
        if (!f) return;
        var k = String(f).toLowerCase();
        (idx.byForm[k] = idx.byForm[k] || []).push({ id: id, form: kind });
      }
      (v.woerter || []).forEach(function (w) {
        idx.words[w.id] = w;
        addForm(w.lemma, w.id, 'lemma');
        if (w.plural) addForm(w.plural, w.id, 'plural');
        (w.pluralAlt || []).forEach(function (p) { addForm(p, w.id, 'plural'); });
        if (w.praesens) Object.keys(w.praesens).forEach(function (p) { addForm(w.praesens[p], w.id, 'praesens:' + p); });
        // Stammwörter ("ein-", "dein-"), Klammerformen ("gern(e)") und Varianten ("circa/ca.") auch einzeln auffindbar
        String(w.lemma).split(/\s*\/\s*|,\s*/).forEach(function (part) {
          part = part.replace(/-$/, '').replace(/\(([^)]*)\)/, '');
          if (part && part.toLowerCase() !== String(w.lemma).toLowerCase()) addForm(part, w.id, 'lemma');
        });
      });
      return idx;
    }
    function init(o) {
      o = o || {};
      if (o.vocab) vocab = o.vocab;
      if (vocab) { index = buildIndex(vocab); return Promise.resolve(api); }
      return fetch(o.vocabUrl || vocabUrl).then(function (r) {
        if (!r.ok) throw new Error('Wortschatz nicht ladbar: ' + r.status);
        return r.json();
      }).then(function (v) { vocab = v; index = buildIndex(v); return api; });
    }
    function need() { if (!index) throw new Error('DafProgress.init() zuerst aufrufen und warten.'); }
    function getWord(id) { need(); return index.words[id] || null; }
    function niveauOf(w) {
      need();
      var t = index.themen[w.thema];
      return t && t.niveau ? t.niveau : null;       // null = noch nicht festgelegt
    }
    function lookup(text) { need(); return (index.byForm[String(text).toLowerCase()] || []).slice(); }

    // ---------- Aufzeichnen ----------
    function keyOf(wordId, skill) { return (wordId || GRAMMATIK_ID) + '|' + skill; }
    function record(e) {
      if (!e || !e.game || !e.skill || typeof e.correct !== 'boolean') return null;
      if (e.wordId && index && !index.words[e.wordId]) return null;   // unbekannte ID nicht speichern
      var k = keyOf(e.wordId, e.skill), t = now();
      var it = state.items[k] || (state.items[k] = { r: 0, f: 0, s: 0, b: 0, l: 0, d: 0, g: {} });
      var g = it.g[e.game] || (it.g[e.game] = { r: 0, f: 0 });
      if (e.correct) { it.r++; g.r++; it.s++; it.b = Math.min(it.b + 1, BOX_TAGE.length - 1); }
      else { it.f++; g.f++; it.s = 0; it.b = 0; }
      it.l = t; it.d = t + BOX_TAGE[it.b] * TAG;
      state.log.push([t, e.game, e.wordId || GRAMMATIK_ID, e.skill, e.correct ? 1 : 0]);
      if (state.log.length > maxLog) state.log.splice(0, state.log.length - maxLog);
      save();
      return it;
    }
    // Für Spiele, die nur den angezeigten Text kennen (z. B. "kommst", "Tische"): Text -> Wort-ID
    function recordText(e) {
      need();
      var hits = lookup(e.text);
      if (!hits.length) return null;
      var pick = hits[0];
      if (e.wortart) for (var i = 0; i < hits.length; i++) if (index.words[hits[i].id].wortart === e.wortart) { pick = hits[i]; break; }
      return record({ game: e.game, wordId: pick.id, skill: e.skill, correct: e.correct });
    }

    // ---------- Auswählen ----------
    function matches(w, f) {
      if (f.wortart && f.wortart.indexOf(w.wortart) < 0) return false;
      if (f.thema && f.thema.indexOf(w.thema) < 0) return false;
      if (f.nurHaupteintraege && !w.haupteintrag) return false;
      if (f.ids && f.ids.indexOf(w.id) < 0) return false;
      if (f.exclude && f.exclude.indexOf(w.id) >= 0) return false;
      if (f.hat && !f.hat.every(function (p) { return w[p] !== undefined && w[p] !== null && w[p] !== false; })) return false;
      if (f.maxNiveau || f.niveau) {
        var n = niveauOf(w);
        if (n === null) { if (f.nurFestgelegte) return false; }
        else {
          var i = NIVEAUS.indexOf(n);
          if (f.maxNiveau && i > NIVEAUS.indexOf(f.maxNiveau)) return false;
          if (f.niveau && n !== f.niveau) return false;
        }
      }
      if (f.filter && !f.filter(w)) return false;
      return true;
    }
    function candidates(f) {
      need(); f = f || {};
      return vocab.woerter.filter(function (w) { return matches(w, f); });
    }
    // Wie dringend sollte dieses Wort wiederholt werden? (0 = gar nicht)
    function urgency(w, skill, t) {
      var skills = skill ? [skill] : Object.keys(skillsSeen(w.id));
      var best = 0;
      skills.forEach(function (s) {
        var it = state.items[keyOf(w.id, s)];
        if (!it || it.f === 0) return;
        var rate = it.f / (it.r + it.f);
        var overdue = Math.max(0, (t - it.d) / TAG);
        var score = rate * 2 + Math.min(overdue, 7) * 0.3 + (it.b === 0 ? 1 : 0) + (it.s === 0 ? 0.5 : 0);
        if (it.d > t && it.b > 0) score *= 0.3;   // noch nicht fällig und zuletzt richtig
        if (score > best) best = score;
      });
      return best;
    }
    function skillsSeen(id) {
      var out = {}, pre = id + '|';
      Object.keys(state.items).forEach(function (k) { if (k.indexOf(pre) === 0) out[k.slice(pre.length)] = 1; });
      return out;
    }
    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    /**
     * Wörter für eine Spielrunde.
     * Optionen: n (Anzahl), skill, wortart:[…], thema:[…], maxNiveau:'A1.1', niveau, hat:['plural'], exclude:[ids],
     *           mix (Anteil Wiederholwörter, Standard 0.4), nurHaupteintraege, nurFestgelegte, filter(fn)
     */
    function pick(o) {
      need(); o = o || {};
      var n = o.n || 10, mix = o.mix === undefined ? 0.4 : o.mix, t = now(), skill = o.skill || null;
      var pool = candidates(o);
      var weak = pool.map(function (w) { return { w: w, u: urgency(w, skill, t) }; })
        .filter(function (x) { return x.u > 0.5; })
        .sort(function (a, b) { return b.u - a.u; });
      var wantWeak = Math.min(weak.length, Math.round(n * mix));
      var chosen = weak.slice(0, wantWeak).map(function (x) { return x.w; });
      var taken = {}; chosen.forEach(function (w) { taken[w.id] = 1; });
      var rest = pool.filter(function (w) { return !taken[w.id]; });
      // Zuerst noch nie geübte Wörter, dann die am längsten nicht gesehenen
      var unseen = shuffle(rest.filter(function (w) { return !seen(w.id, skill); }));
      var seenWords = rest.filter(function (w) { return seen(w.id, skill); })
        .sort(function (a, b) { return lastSeen(a.id, skill) - lastSeen(b.id, skill); });
      chosen = chosen.concat(unseen, seenWords).slice(0, n);
      return shuffle(chosen);
    }
    function seen(id, skill) {
      if (skill) return !!state.items[keyOf(id, skill)];
      return Object.keys(skillsSeen(id)).length > 0;
    }
    function lastSeen(id, skill) {
      if (skill) { var it = state.items[keyOf(id, skill)]; return it ? it.l : 0; }
      var m = 0, s = skillsSeen(id); Object.keys(s).forEach(function (k) { var it = state.items[keyOf(id, k)]; if (it && it.l > m) m = it.l; });
      return m;
    }
    // Die schwächsten Einträge (für Anzeigen wie "Das solltest du noch üben")
    function weakest(o) {
      need(); o = o || {}; var t = now(), out = [];
      Object.keys(state.items).forEach(function (k) {
        var p = k.split('|'), id = p[0], skill = p[1];
        if (o.skill && skill !== o.skill) return;
        var it = state.items[k]; if (!it.f) return;
        if (id !== GRAMMATIK_ID) {
          var w = index.words[id]; if (!w || !matches(w, o)) return;
        } else if (!o.grammatik) { return; }
        var rate = it.f / (it.r + it.f);
        out.push({ wordId: id === GRAMMATIK_ID ? null : id, skill: skill, richtig: it.r, falsch: it.f, box: it.b, faellig: it.d <= t, score: rate });
      });
      out.sort(function (a, b) { return b.score - a.score || b.falsch - a.falsch; });
      return out.slice(0, o.limit || 20);
    }

    // ---------- Auswertung, Übertragen, Zurücksetzen ----------
    function stats() {
      var s = { eintraege: 0, richtig: 0, falsch: 0, nachBox: [0, 0, 0, 0, 0], nachSpiel: {}, nachFaehigkeit: {}, gespeichert: persistent };
      Object.keys(state.items).forEach(function (k) {
        var it = state.items[k], sk = k.split('|')[1];
        s.eintraege++; s.richtig += it.r; s.falsch += it.f; s.nachBox[it.b]++;
        var f = s.nachFaehigkeit[sk] = s.nachFaehigkeit[sk] || { richtig: 0, falsch: 0 }; f.richtig += it.r; f.falsch += it.f;
        Object.keys(it.g).forEach(function (g) {
          var x = s.nachSpiel[g] = s.nachSpiel[g] || { richtig: 0, falsch: 0 }; x.richtig += it.g[g].r; x.falsch += it.g[g].f;
        });
      });
      return s;
    }
    function toB64(str) {
      if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
      return btoa(unescape(encodeURIComponent(str)));
    }
    function fromB64(b) {
      if (typeof Buffer !== 'undefined') return Buffer.from(b, 'base64').toString('utf8');
      return decodeURIComponent(escape(atob(b)));
    }
    function exportCode() { return 'DAF1.' + toB64(JSON.stringify(state)); }
    function importCode(code, o) {
      o = o || {};
      var m = /^DAF1\.(.+)$/.exec(String(code || '').trim());
      if (!m) throw new Error('Das ist kein gültiger DaF-Code.');
      var d;
      try { d = JSON.parse(fromB64(m[1])); } catch (e) { throw new Error('Der Code ist beschädigt.'); }
      if (!d || d.v !== SCHEMA || typeof d.items !== 'object') throw new Error('Der Code passt nicht zu dieser Version.');
      if (o.replace) { state = d; if (!state.log) state.log = []; save(); return stats(); }
      Object.keys(d.items).forEach(function (k) {   // zusammenführen: nichts geht verloren
        var a = state.items[k], b = d.items[k];
        if (!a) { state.items[k] = b; return; }
        var neuer = b.l > a.l ? b : a;
        var g = {};
        [a.g, b.g].forEach(function (src) { Object.keys(src || {}).forEach(function (n) {
          var x = g[n] = g[n] || { r: 0, f: 0 }; x.r = Math.max(x.r, src[n].r); x.f = Math.max(x.f, src[n].f); }); });
        state.items[k] = { r: Math.max(a.r, b.r), f: Math.max(a.f, b.f), s: neuer.s, b: neuer.b, l: neuer.l, d: neuer.d, g: g };
      });
      save(); return stats();
    }
    function clear() { state = fresh(); save(); }

    var api = {
      init: init, record: record, recordText: recordText, pick: pick, candidates: candidates, weakest: weakest,
      getWord: getWord, lookup: lookup, niveauOf: niveauOf, stats: stats,
      exportCode: exportCode, importCode: importCode, clear: clear,
      isPersistent: function () { return persistent; },
      SKILLS: SKILLS, NIVEAUS: NIVEAUS, STORAGE_KEY: STORAGE_KEY,
      _state: function () { return state; }
    };
    return api;
  }
  return { create: create, STORAGE_KEY: STORAGE_KEY, NIVEAUS: NIVEAUS, SKILLS: SKILLS };
}));
