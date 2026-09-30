// palette.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the look (LOOK) and the colour palette (COL), station spacing. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */



  var LOOK = {
    // CINEMATIC is the one and only look (the isometric alt-view was removed).
    cinematic:{
      // BRIGHT REAL LAB under fluorescent panels: high ambient + hemi for even, fairly FLAT
      // fill; a soft near-white key for gentle soft shadows only — NO dark surroundings, NO
      // teal rim. Colour comes from the scattered saturated props, not from a grade.
      // bright room, but NOT a white flood: the near-white fog + heavy flat fill was
      // laying a milky veil over everything and washing the props to pastel. Fog is now a
      // faint touch, the flood is roughly halved, and the key stays strong for form/shading
      // so the saturated props actually read as saturated.
      // Was massively OVER-LIT and flat → every real colour blew to pale pastel (a navy stand
      // rendered baby-blue) with no shadow. Cut the flat fill hard, keep ONE strong key →
      // real shadow-to-highlight range = contrast, and true saturated colour.
      // Stage 24 — dark epoxy bench, dramatic light. The station is a SUBJECT: one strong
      // warm key from the side, deep dark cool fills, a cool rim on the glass, edges falling
      // into shadow (warm near-black fog). Exposure stays 0.78 (guardrail — never ACES).
      fog:{ color:0x120f0b, density:0.0034 }, exposure:0.78,
      amb:{ color:0xd6d9de, int:0.035 }, hemi:{ sky:0xc4ccd8, ground:0x241f18, int:0.045 },
      key:{ color:0xfff1de, int:1.62 }, fill:{ color:0xc2cee2, int:0.08, pos:[-8,4,9] },
      aux:{ color:0xdfe0da, int:0.05, pos:[-3,11,-6] },
      // rim/edge light — from behind the subject, cool; against the dark bench a bright rim
      // on a vessel's shoulder is the single most valuable highlight in the frame. Kept
      // modest so it catches edges without flooding (and greying) the bench.
      rim:{ color:0xe3ecff, int:0.9, pos:[-6,5.5,-8] }
    }
  };

  /* production-line geometry */
  var SPACING = 8.4;                 // distance between stations along +X
  var BLOCK_TOP = 0.45;              // cold-block plate height

  /* The palette. `COL` is the LIVE palette structural materials are built from once;
     travelling-sample liquids read it live every frame. (The isometric alt-palette that
     used to swap in on a view switch was removed with the isometric view.) */
  var COL_CINE = {
    lysis:  0x02b6a0,   // saturated teal   (RLT + β-ME)
    etoh:   0x1f8bf2,   // clear blue       (70% ethanol)
    wash:   0x5061db,   // periwinkle-blue  (RW1 / RPE)
    dnase:  0xf2a208,   // rich amber       (DNase I)
    rna:    0x12c46c,   // vivid RNA green  (eluate / RNA)
    water:  0x53b4ef,   // clear sky blue   (RNase-free water)
    pellet: 0xe07f1f,   // neutrophil pellet (warm amber)
    glass:  0xdce6ec,
    steel:  0x9aa4b0,
    accent: 0x1fb8a2
  };
  var COL = {};
  (function(s){ for(var k in s) COL[k]=s[k]; })(COL_CINE);   // COL is the cinematic palette

export { LOOK, SPACING, BLOCK_TOP, COL_CINE, COL }
