# Stage 5 — prove it's general (second protocol) + regression tests

**Read `prompts/master-3d-scene-generator.md`.** The whole point is that this
renders ANY protocol, not just the RNA one. This stage proves it and locks it.

## Scope
- Parse a DIFFERENT protocol end-to-end: `examples/transformation.txt`
  (`python scripts/parse_check.py` after pointing it at that input), producing a
  fresh `parsed.json`. Load it in the player.
- Verify the mapping holds for actions the RNA protocol didn't exercise:
  `heat` → heat block + bubbles/warm; `cool_ice` → ice bucket + frost;
  `pour_add` / `pipette_mix` / `incubate_wait` correct; any unmapped/odd action
  → plain bench (`generic`), no crash.
- Add a small regression test: the resolver returns a valid recipe for every
  value in `core/schema.py`'s `ACTIONS`, and `generic` for anything else.
- Confirm nothing regressed: `pytest -q` green, `core/` still has zero rendering
  knowledge, parse is still a single batched llm call, WebGL fallback intact.

## Done when
- Both protocols (RNA + transformation) render coherently, equipment-appropriate
  per step, with no console errors.
- `npm test` and `pytest -q` both green.
- A short note in the README/docs shows the two example renders (optional but nice
  for the pitch).

Commit: `test(web): generalize to a second protocol + resolver coverage`.
