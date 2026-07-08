# Spike fidelity checklist

The ONE risky thing this spike proves: **can Claude turn a real, messy lab
protocol into a correct, structured, runnable representation?** This is about
parse fidelity you can eyeball — not UI.

Run it, then open `outputs/parsed_preview.html` and tick each box below. Each
target names where to look in the preview so it is easy to verify.

Test protocol: `examples/Protokol_ekstrakcji_RNA_neutrofile.docx`
(Polish — total RNA extraction from neutrophils, Qiagen RNeasy).

## Must-capture targets

- [ ] **Conditional lysis volume** — 350 µl if ≤ 5×10⁶ cells, else 600 µl.
  → Procedure step 1: a blue **conditional** box AND two reagent rows with
  `if …` volume conditions.
- [ ] **Either/or homogenization** — QIAshredder 2 min at max speed **OR** 5×
  through a 20–21 G needle.
  → Procedure step 2: an **either / or** block with two nested steps (one a
  2-min timer, one a `×5` repeat).
- [ ] **"Nie wirować"** kept as a negative/critical caution, not dropped.
  → The 70% ethanol step: a **red** hazard box (⛔).
- [ ] **Repeat "for the remaining volume"** on the column-load step.
  → The RNeasy-column load step: a 🔁 **repeat** line.
- [ ] **DNase I + RDD mix** (10 µl + 70 µl per sample) as a prep-ahead step.
  → Preparation phase: a step with the **prep-ahead** badge and both volumes.
- [ ] **Timers** — 15 s / 2 min / 15 min / 1 min appear as durations; the 24 h
  buffer-freshness window appears too.
  → Timer badges (⏱) on spins and the DNase incubation; 24 h on the fresh-buffer
  prep step.
- [ ] **Kit-variant elution** — 30–50 µl (Mini) with Micro: 14 µl.
  → Elution step: volume 30–50 µl and a conditional / note for Micro 14 µl.
- [ ] **Hazards** — 2-mercaptoethanol under the fume hood; keep on ice / work
  fast.
  → Hazard boxes (⚠️) on the fresh-buffer prep and the notes.
- [ ] **Open parameters as questions** — kit, input cell number, lysis/elution
  volumes, target RIN, bulk vs single-cell ("Do ustalenia na miejscu…").
  → Top yellow **Open parameters** panel lists all of these as questions.
- [ ] **Comparison table + "Źródła" EXCLUDED** from runnable steps.
  → No step comes from the "Porównanie z innymi protokołami" table or the
  citations; they appear only under **Reference**.
- [ ] **Polish parsed correctly, untranslated.**
  → Every `text` / `verbatim` is still Polish.

## Verdict

If the parse holds on these → build the beautiful player next.
If it doesn't → ship the geo-harmonizer as the fallback submission.
