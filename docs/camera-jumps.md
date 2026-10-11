# Camera jumps before the fix (f8d864f + the check, eba6f2a)

`npm run check-protocol -- --examples` and `--generated 50 --seed 1`. A jump: a step between consecutive frames over CAM_JUMP (0.2 u or 1°). "frame 0 (station change)" is the first checked frame after Next, measured from the pose before Next. A frame of about 1020 at a "(station)" is the frame after the checker skips through a countdown: the sway read the wall clock.

After the fix (2c06ede): 0 jumps on 137 + 367 stations; end framing per station identical (128 + 317 changes compared, max diff 0).

## Examples (62 jumps, 58 stations)

```
agarose_gel 1→2 frame 0 (station change) 0.69 u 0°
agarose_gel 3→4 frame 0 (station change) 1.194 u 0°
agarose_gel 4→5 frame 0 (station change) 1.015 u 0°
agarose_gel 5→6 frame 0 (station change) 0.864 u 0°
agarose_gel 8→9 frame 0 (station change) 0.398 u 0°
agarose_gel 9→10 frame 0 (station change) 0.398 u 0°
agarose_gel 10→11 frame 0 (station change) 0.5 u 0°
agarose_gel 11→12 frame 0 (station change) 0.562 u 0°
cryopreservation 5→6 frame 0 (station change) 1.296 u 0°
cryopreservation 6→7 frame 0 (station change) 1.239 u 0°
elisa 1→2 frame 0 (station change) 1.785 u 0°
elisa 2→3 frame 0 (station change) 1.782 u 0°
elisa 26→27 frame 0 (station change) 0.84 u 0°
gram_stain 13→14 frame 0 (station change) 0.339 u 0°
neutrophil_rna 1→2 frame 0 (station change) 0.3 u 0°
neutrophil_rna 2→3 frame 0 (station change) 1.777 u 0°
neutrophil_rna 2→3 frame 1020 (station) 0.231 u 0°
neutrophil_rna 3→4 frame 0 (station change) 1.783 u 0°
neutrophil_rna 5→6 frame 0 (station change) 1.844 u 0°
neutrophil_rna 6→7 frame 0 (station change) 1.782 u 0°
neutrophil_rna 7→8 frame 0 (station change) 1.782 u 0°
neutrophil_rna 8→9 frame 0 (station change) 1.781 u 0°
neutrophil_rna 12→13 frame 0 (station change) 1.782 u 0°
neutrophil_rna 13→14 frame 0 (station change) 1.782 u 0°
neutrophil_rna 14→15 frame 0 (station change) 1.782 u 0°
neutrophil_rna 15→16 frame 0 (station change) 1.781 u 0°
neutrophil_rna 16→17 frame 0 (station change) 1.78 u 0°
neutrophil_rna 17→18 frame 0 (station change) 1.82 u 0°
neutrophil_rna 18→19 frame 0 (station change) 1.813 u 0°
neutrophil_rna 18→19 frame 1020 (station) 0.219 u 0°
neutrophil_rna 19→20 frame 0 (station change) 1.783 u 0°
neutrophil_rna 21→22 frame 0 (station change) 1.784 u 0°
neutrophil_rna 22→23 frame 0 (station change) 1.358 u 0°
neutrophil_rna 23→24 frame 0 (station change) 1.23 u 0°
passaging 2→3 frame 0 (station change) 1.187 u 0°
passaging 3→4 frame 0 (station change) 1.19 u 0°
passaging 4→5 frame 0 (station change) 1.19 u 0°
passaging 5→6 frame 0 (station change) 1.191 u 0°
passaging 5→6 frame 1050 (station) 0.215 u 0°
passaging 6→7 frame 0 (station change) 0.631 u 0°
passaging 7→8 frame 0 (station change) 0.675 u 0°
passaging 8→9 frame 0 (station change) 1.684 u 0°
passaging 9→10 frame 0 (station change) 0.951 u 0°
passaging 11→12 frame 0 (station change) 0.34 u 0°
passaging 12→13 frame 0 (station change) 0.343 u 0°
passaging 13→14 frame 0 (station change) 1.293 u 0°
pcr 2→3 frame 0 (station change) 1.775 u 0°
pcr 3→4 frame 0 (station change) 1.782 u 0°
pcr 4→5 frame 0 (station change) 0.355 u 0°
pcr 5→6 frame 0 (station change) 0.355 u 0°
pcr 7→8 frame 0 (station change) 0.5 u 0°
transformation 1→2 frame 0 (station change) 0.3 u 0°
transformation 2→3 frame 0 (station change) 0.3 u 0°
transformation 3→4 frame 0 (station change) 0.277 u 0°
transformation 4→5 frame 0 (station change) 0.277 u 0°
transformation 4→5 frame 1020 (station) 0.215 u 0°
transformation 5→6 frame 0 (station change) 0.3 u 0°
transformation 7→8 frame 0 (station change) 0.426 u 0°
transformation 8→9 frame 0 (station change) 0.432 u 0°
western 1→2 frame 0 (station change) 0.504 u 0°
western 2→3 frame 0 (station change) 0.5 u 0°
western 18→19 frame 1020 (station) 0.218 u 0°
```

## 50 generated, seed 1 (113 jumps, 110 stations)

```
gen-1 1→2 frame 0 (station change) 0.355 u 0°
gen-1 5→6 frame 0 (station change) 1.239 u 0°
gen-2 2→3 frame 0 (station change) 1.84 u 0°
gen-2 2→3 frame 1020 (station) 0.218 u 0°
gen-2 3→4 frame 1020 (station) 0.227 u 0°
gen-2 4→5 frame 0 (station change) 1.783 u 0°
gen-2 5→6 frame 0 (station change) 0.3 u 0°
gen-2 6→7 frame 0 (station change) 0.3 u 0°
gen-3 1→2 frame 0 (station change) 1.782 u 0°
gen-3 3→4 frame 0 (station change) 1.782 u 0°
gen-3 5→6 frame 0 (station change) 1.782 u 0°
gen-3 7→8 frame 0 (station change) 1.783 u 0°
gen-3 9→10 frame 1020 (station) 0.211 u 0°
gen-3 10→11 frame 0 (station change) 1.36 u 0°
gen-5 5→6 frame 0 (station change) 0.3 u 0°
gen-5 6→7 frame 0 (station change) 0.3 u 0°
gen-6 5→6 frame 0 (station change) 1.293 u 0°
gen-9 2→3 frame 0 (station change) 0.5 u 0°
gen-9 3→4 frame 0 (station change) 0.5 u 0°
gen-9 6→7 frame 0 (station change) 0.496 u 0°
gen-9 7→8 frame 0 (station change) 0.5 u 0°
gen-9 8→9 frame 0 (station change) 0.5 u 0°
gen-9 9→10 frame 0 (station change) 0.5 u 0°
gen-10 2→3 frame 0 (station change) 0.29 u 0°
gen-10 3→4 frame 0 (station change) 0.293 u 0°
gen-10 4→5 frame 0 (station change) 0.287 u 0°
gen-10 5→6 frame 0 (station change) 0.293 u 0°
gen-11 1→2 frame 0 (station change) 0.3 u 0°
gen-11 4→5 frame 0 (station change) 1.239 u 0°
gen-12 5→6 frame 0 (station change) 1.785 u 0°
gen-12 6→7 frame 0 (station change) 1.783 u 0°
gen-12 8→9 frame 0 (station change) 1.782 u 0°
gen-12 9→10 frame 0 (station change) 1.783 u 0°
gen-14 2→3 frame 0 (station change) 1.774 u 0°
gen-14 2→3 frame 1020 (station) 0.226 u 0°
gen-14 3→4 frame 0 (station change) 1.783 u 0°
gen-14 4→5 frame 0 (station change) 1.782 u 0°
gen-14 5→6 frame 0 (station change) 1.781 u 0°
gen-15 1→2 frame 0 (station change) 1.782 u 0°
gen-15 2→3 frame 0 (station change) 1.782 u 0°
gen-15 3→4 frame 0 (station change) 1.782 u 0°
gen-15 4→5 frame 0 (station change) 1.782 u 0°
gen-15 6→7 frame 1020 (station) 0.223 u 0°
gen-15 7→8 frame 0 (station change) 1.783 u 0°
gen-15 8→9 frame 0 (station change) 0.3 u 0°
gen-15 10→11 frame 0 (station change) 0.3 u 0°
gen-17 1→2 frame 0 (station change) 0.951 u 0°
gen-17 2→3 frame 0 (station change) 2.601 u 0°
gen-17 2→3 frame 1020 (station) 0.226 u 0°
gen-17 3→4 frame 0 (station change) 1.783 u 0°
gen-17 4→5 frame 0 (station change) 0.237 u 0°
gen-17 5→6 frame 0 (station change) 0.237 u 0°
gen-17 7→8 frame 0 (station change) 0.3 u 0°
gen-17 8→9 frame 0 (station change) 0.3 u 0°
gen-18 5→6 frame 0 (station change) 1.293 u 0°
gen-21 1→2 frame 0 (station change) 0.5 u 0°
gen-21 2→3 frame 0 (station change) 0.509 u 0°
gen-22 1→2 frame 0 (station change) 0.295 u 0°
gen-22 2→3 frame 0 (station change) 0.293 u 0°
gen-22 5→6 frame 0 (station change) 0.293 u 0°
gen-22 6→7 frame 0 (station change) 0.285 u 0°
gen-22 9→10 frame 0 (station change) 0.3 u 0°
gen-23 1→2 frame 0 (station change) 0.3 u 0°
gen-23 3→4 frame 0 (station change) 1.521 u 0°
gen-24 1→2 frame 0 (station change) 0.355 u 0°
gen-24 4→5 frame 0 (station change) 0.3 u 0°
gen-24 5→6 frame 0 (station change) 0.478 u 0°
gen-24 7→8 frame 0 (station change) 0.355 u 0°
gen-24 9→10 frame 0 (station change) 1.776 u 0°
gen-24 10→11 frame 0 (station change) 1.937 u 0°
gen-24 11→12 frame 0 (station change) 0.3 u 0°
gen-26 1→2 frame 0 (station change) 0.3 u 0°
gen-26 2→3 frame 0 (station change) 1.781 u 0°
gen-26 3→4 frame 0 (station change) 1.781 u 0°
gen-27 0→1 frame 750 (station) 0.226 u 0°
gen-27 1→2 frame 0 (station change) 1.781 u 0°
gen-27 3→4 frame 0 (station change) 1.239 u 0°
gen-33 3→4 frame 0 (station change) 0.492 u 0°
gen-34 1→2 frame 0 (station change) 0.303 u 0°
gen-34 7→8 frame 0 (station change) 0.293 u 0°
gen-34 8→9 frame 0 (station change) 0.299 u 0°
gen-35 1→2 frame 0 (station change) 1.239 u 0°
gen-36 1→2 frame 0 (station change) 0.237 u 0°
gen-36 2→3 frame 0 (station change) 0.237 u 0°
gen-36 3→4 frame 0 (station change) 0.3 u 0°
gen-36 5→6 frame 0 (station change) 1.937 u 0°
gen-36 6→7 frame 0 (station change) 1.783 u 0°
gen-37 1→2 frame 0 (station change) 1.883 u 0°
gen-37 3→4 frame 0 (station change) 1.239 u 0°
gen-38 1→2 frame 0 (station change) 1.782 u 0°
gen-38 2→3 frame 0 (station change) 0.3 u 0°
gen-38 3→4 frame 0 (station change) 0.3 u 0°
gen-39 1→2 frame 0 (station change) 1.782 u 0°
gen-39 2→3 frame 0 (station change) 1.782 u 0°
gen-39 3→4 frame 0 (station change) 1.782 u 0°
gen-39 4→5 frame 0 (station change) 0.3 u 0°
gen-39 5→6 frame 0 (station change) 0.3 u 0°
gen-40 2→3 frame 0 (station change) 0.547 u 0°
gen-40 3→4 frame 0 (station change) 0.539 u 0°
gen-40 8→9 frame 0 (station change) 0.543 u 0°
gen-40 9→10 frame 0 (station change) 0.539 u 0°
gen-45 1→2 frame 0 (station change) 0.5 u 0°
gen-45 3→4 frame 0 (station change) 0.5 u 0°
gen-46 4→5 frame 0 (station change) 0.293 u 0°
gen-48 3→4 frame 0 (station change) 0.3 u 0°
gen-48 4→5 frame 0 (station change) 0.3 u 0°
gen-48 5→6 frame 0 (station change) 0.3 u 0°
gen-48 6→7 frame 0 (station change) 0.3 u 0°
gen-48 7→8 frame 0 (station change) 0.355 u 0°
gen-48 8→9 frame 0 (station change) 1.645 u 0°
gen-48 9→10 frame 0 (station change) 1.646 u 0°
gen-49 2→3 frame 0 (station change) 0.3 u 0°
gen-49 3→4 frame 0 (station change) 0.3 u 0°
```
