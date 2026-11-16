# daf-shared – gemeinsame Vokabelliste und Lernspeicher für alle DaF-Spiele

| Datei | Wofür |
|---|---|
| `vocab_a1.json` | Die einheitliche Vokabelliste (Basis: Goethe-Zertifikat A1, Start Deutsch 1) |
| `grammatik_a1.json` | Tabellen für geschlossene Klassen: Artikel, Possessivartikel, kein-, dieser/jeder/welcher, Personalpronomen mit allen Kasus, Präteritum von sein/haben/werden/Modalverben |
| `progress.js` | Der lokale Lernspeicher: merkt sich Treffer und Fehler und wählt Wörter für die nächste Runde |
| `themen_uebersicht.md` | Alle Themen mit Beispielwörtern, hier wird pro Thema A1.1 oder A1.2 festgelegt |
| `bericht_abdeckung.md` | Welche Wörter der bisherigen Spiele nicht in der Liste stehen |
| `aenderungen_runde2.md`, `aenderungen_runde3.md` | Was entfernt, ergänzt und umgebaut wurde |
| `tests/progress.test.js`, `tests/vocab.test.js` | Automatische Tests für den Lernspeicher und für die Daten (`node tests/...`) |

## 1. Die Vokabelliste (`vocab_a1.json`)

Aufbau: `{ themen: [...], woerter: [...] }`.

**Themen** (`themen[]`): `id`, `name`, `typ` (`thema` oder `grammatik`), `niveau` (zunächst `null`).
**Das Niveau (A1.1/A1.2) steht nur bei den Themen.** Ein Wort hat das Niveau seines Themas. So ändert man die Einteilung an einer Stelle.

**Wörter** (`woerter[]`), je nach Wortart:

| Feld | Bedeutung |
|---|---|
| `id` | feste Kennung, z. B. `n-apfel`, `v-kommen`. Wird nie geändert, auch wenn sich die Schreibung ändert. |
| `lemma` | Grundform (Nomen ohne Artikel, Verb im Infinitiv) |
| `wortart` | Nomen, Verb, Adjektiv, Adverb, Präposition, Konjunktion, Pronomen, Possessivartikel, Artikel, Negation, Fragewort, Zahlwort, Interjektion, Wendung, Indefinitpronomen, Eigenname |
| `thema` | ID eines Themas |
| `haupteintrag` | `false` bei abgeleiteten Wörtern (z. B. „die Abfahrt“ unter „abfahren“) |
| `quelle` | `goethe-a1` oder `goethe-a1-wortgruppe` (Zahlen, Wochentage, Farben …) |
| Nomen: `artikel`, `genus` | `der`/`die`/`das`, maskulin/feminin/neutrum |
| Nomen: `plural`, `pluralGleich`, `pluralAlt`, `nurPlural` | Pluralform; `pluralGleich: true`, wenn Singular = Plural |
| Nomen: `pluralQuelle` | `goethe`, `vhs`, `hueber` (aus den Listen), `ergaenzt` (von Claude ergänzt, bitte prüfen), `kein-plural` (kein Plural üblich) |
| Verb: `praesens` | die sechs Präsensformen `ich, du, er, wir, ihr, sie` |
| Verb: `trennbar`, `praefix` | bei trennbaren Verben ist `praesens` die Form des Stamms („rufe“), das Präfix steht extra („an“) |
| Verb: `unregelmaessig`, `reflexiv`, `modalverb`, `hilfsverb` | Markierungen |
| `einzelwort` | `false` bei Mehrwortausdrücken („wie viel“, „zum Beispiel“); Einzelwort-Spiele lassen sie aus |
| `unterthema` | Zusatzkategorie quer zu den Themen: tiere, berufe, moebel, familie, farben, technik, kleidung, kueche, reise, haushalt (Liste in `unterthemen[]`) |
| Verb: `partizip2`, `perfektHilfsverb` | z. B. `gegangen` und `sein`; bei trennbaren Verben mit Präfix („abgeholt“) |
| Verb: `kopula` | `true` bei sein, werden, bleiben, heißen, scheinen |
| `negation` | `kein`/`keine` (Nomen, nach Genus) oder `nicht` (Verb, Adjektiv, Adverb) |
| Präposition: `kasus`, `wechselpraeposition` | z. B. `["Dativ"]`; Wechselpräpositionen haben `["Akkusativ","Dativ"]` |
| Konjunktion: `konnektorTyp` | `Position 0` (und, oder, aber, denn) oder `Hauptsatz` (also) |
| Pronomen: `person`, `numerus`, `kasus` | Angaben zur Form |
| `flektiert` | `true` bei Wörtern, die nur in einer flektierten Grundform stehen (alle, dieser, letzte …) |
| `quelle` (neu) | `zusatzlisten` (aus telc/VHS/Hueber/Klett) und `spielergaenzung` (für Spiele ergänzt) |

Die Goethe-Liste nennt weder Wortart noch Präsensformen noch bei jedem Nomen den Plural. Diese Angaben wurden nach Standardregeln und anhand der Listen von VHS und Hueber ergänzt (siehe `pluralQuelle`, Verben: `formenQuelle`).
Die Beispielsätze der Goethe-Liste sind bewusst **nicht** übernommen worden.

## 2. Der Lernspeicher (`progress.js`)

**Wo liegen die Daten?** Im Browser des Lernenden (`localStorage`, Schlüssel `daf.v1.fortschritt`), pro Gerät und Browser. Es wird nichts hochgeladen. Alle Spiele müssen auf derselben Adresse (`wirrdad.github.io`) liegen, damit sie sich den Speicher teilen.

**Was wird gespeichert?** Pro Wort *und* Fähigkeit ein Eintrag, z. B. „Tisch + artikel“: Anzahl richtig/falsch, Serie, Box, zuletzt gesehen, nächste Wiederholung, und wie es in jedem Spiel lief.
Fähigkeiten: `wortart`, `artikel`, `plural`, `schreibung`, `bedeutung`, `konjugation`, `pronomen`, `kasus`, `thema`, `erkennen`. Für die Satzspiele ohne Einzelwort gibt es Grammatikthemen mit Vorsatz `g:` (z. B. `g:kasus-dativ`).

**Wie wird wiederholt?** Einfaches Box-System: richtig = nächste Box (Wiederholung nach 0, 1, 3, 7, 14 Tagen), falsch = zurück auf Box 0. Wörter mit Fehlern werden in `pick()` bevorzugt, auch wenn der Fehler in einem anderen Spiel passiert ist.

### Einbau in ein Spiel

```html
<script src="https://wirrdad.github.io/daf-shared/progress.js"></script>
<script>
DafProgress.init().then(function () {          // lädt vocab_a1.json automatisch
  // 1) Wörter für die Runde holen (Fehlerwörter kommen bevorzugt)
  var woerter = DafProgress.pick({
    game: 'wortkran', n: 10, skill: 'artikel',
    wortart: ['Nomen'], maxNiveau: 'A1.1'      // maxNiveau wirkt, sobald die Themen ein Niveau haben
  });

  // 2) Nach jeder Antwort melden
  DafProgress.record({ game: 'wortkran', wordId: woerter[0].id, skill: 'artikel', correct: true });

  // 3) Wenn das Spiel nur den angezeigten Text kennt ("kommst", "Tische")
  DafProgress.recordText({ game: 'wortwehr', text: 'kommst', skill: 'konjugation', correct: false });
});
</script>
```

Weitere Funktionen: `candidates(filter)`, `weakest({limit, skill})`, `lookup(text)`, `getWord(id)`, `stats()`, `exportCode()` / `importCode(code)` (Fortschritt per Textcode auf ein anderes Gerät mitnehmen), `clear()`.
Filter für `pick()`: `wortart`, `thema`, `maxNiveau`, `niveau`, `hat:['plural']` (nur Wörter mit diesem Feld), `exclude`, `mix` (Anteil Wiederholwörter, Standard 0.4), `nurFestgelegte`, `filter(fn)`.

Ist der Speicher gesperrt (Privatmodus) oder voll, läuft das Spiel weiter, nur ohne Dauerspeicherung (`isPersistent()` ist dann `false`). Beschädigte Daten werden gesichert und nicht überschrieben.

## 3. Offen

- Niveau je Thema festlegen (`themen_uebersicht.md`).
- Spiele auf die gemeinsame Liste umstellen (Wortlisten aus dem Code entfernen, `pick()` und `record()` einbauen).
- Wörter, die in den Spielen vorkommen, aber nicht in der Goethe-Liste: siehe `bericht_abdeckung.md`.
- Nutzungsrechte der Goethe-Liste vor einer öffentlichen Veröffentlichung klären.
