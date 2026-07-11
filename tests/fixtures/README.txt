benchpilot — coverage-harness fixtures (from the 8-protocol test)

protocols/  : the 8 protocol texts fed to the live parser.
              transformation, pcr, western  = batch 1
              passaging, elisa, agarose_gel, cryopreservation, gram_stain = batch 2
              (neutrophil RNA extraction is already in the repo under examples/)

Sources (real, fetched verbatim where noted):
  transformation  — Addgene bacterial transformation (verbatim)
  passaging       — Gibco/Thermo subculturing adherent cells (verbatim)
  elisa           — Abcam sandwich ELISA (verbatim)
  western         — Cell Signaling Western blot (verbatim; brief gel+transfer lead-in added)
  pcr             — Barrick Lab reaction table (real) + standard Taq cycling program
  agarose_gel, cryopreservation, gram_stain — standard representative protocols

run.py / run_batch.py : the driver used to parse each and tally the action
  distribution. It injects a stdlib-urllib llm into core.parse.parse_protocol
  (no anthropic SDK needed) and prints per-step action + %generic. Point it at
  a copy of core/ and a .env with ANTHROPIC_API_KEY. Use these to seed the
  offline coverage harness (Stage 7): parse once, commit the cached responses.
