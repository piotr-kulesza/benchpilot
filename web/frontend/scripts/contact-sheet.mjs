// contact-sheet.mjs — tile a shot set into a few captioned PNG sheets.
//
// Why: a vision model (or you) can audit 60 renders in one image far better than
// in 60 separate files, and the caption carries the GROUND TRUTH next to the
// render — the registry's stated correct pose, or the step's parsed action and
// container. Judging is then "does the picture match the words", not "is this
// pretty".
//
//   node scripts/contact-sheet.mjs                 # set=current, all groups
//   node scripts/contact-sheet.mjs current models  # one group
//   node scripts/contact-sheet.mjs baseline        # the committed reference
//
// Optionally diff two sets side by side (same tile order, A above B):
//   node scripts/contact-sheet.mjs --diff baseline current
//
// No new dependencies: builds an HTML page and screenshots it with the
// puppeteer-core already used by the other scripts.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ROOT = process.env.OUT || path.join(process.cwd(), 'dev-shots')
const SHEETS = path.join(ROOT, 'sheets')
const COLS = Number(process.env.COLS || 4)
const PER_SHEET = Number(process.env.PER_SHEET || 24) // keeps each PNG readable

const argv = process.argv.slice(2)
const diffIdx = argv.indexOf('--diff')
const DIFF = diffIdx >= 0 ? [argv[diffIdx + 1], argv[diffIdx + 2]] : null
const SET = DIFF ? DIFF[1] : argv[0] || 'current'
const ONLY = DIFF ? argv[diffIdx + 3] : argv[1]

fs.mkdirSync(SHEETS, { recursive: true })

const groupsIn = (set) => {
  const base = path.join(ROOT, set)
  if (!fs.existsSync(base)) return []
  return fs.readdirSync(base).filter((g) => fs.existsSync(path.join(base, g, 'manifest.json')))
}

const readManifest = (set, group) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, set, group, 'manifest.json'), 'utf8'))

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const fileUrl = (set, group, file) => 'file://' + path.join(ROOT, set, group, file)

const CSS = `
  * { box-sizing: border-box }
  body { margin:0; background:#12161b; color:#e7ecf2; font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif }
  header { padding:18px 22px 6px; font-size:16px; font-weight:600; letter-spacing:.2px }
  header span { font-weight:400; color:#8b97a5 }
  .grid { display:grid; grid-template-columns:repeat(${COLS},1fr); gap:14px; padding:14px 22px 26px }
  figure { margin:0; background:#1a2027; border:1px solid #2a323c; border-radius:9px; overflow:hidden }
  .pair { display:grid; grid-template-rows:1fr 1fr; gap:2px; background:#2a323c }
  img { width:100%; display:block; background:#0d1116 }
  figcaption { padding:8px 10px 10px }
  .t { font-weight:600; color:#cfe3ff; margin-bottom:3px }
  .c { color:#8b97a5; font-size:11.5px }
  .lbl { position:relative }
  .lbl::after { content:attr(data-set); position:absolute; top:4px; left:6px; background:rgba(0,0,0,.6);
    color:#9fd3c7; font-size:10px; padding:1px 5px; border-radius:4px }
`

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1600,1200'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 })

const written = []

for (const group of (ONLY ? [ONLY] : groupsIn(SET))) {
  const manifest = readManifest(SET, group)
  const entries = manifest.entries || []
  const pages = Math.ceil(entries.length / PER_SHEET)

  for (let pi = 0; pi < pages; pi++) {
    const slice = entries.slice(pi * PER_SHEET, (pi + 1) * PER_SHEET)
    const tiles = slice.map((e) => {
      const img = DIFF
        ? `<div class="pair">
             <div class="lbl" data-set="${esc(DIFF[0])}"><img src="${fileUrl(DIFF[0], group, e.file)}"></div>
             <div class="lbl" data-set="${esc(DIFF[1])}"><img src="${fileUrl(DIFF[1], group, e.file)}"></div>
           </div>`
        : `<img src="${fileUrl(SET, group, e.file)}">`
      return `<figure>${img}<figcaption><div class="t">${esc(e.title)}</div><div class="c">${esc(e.caption)}</div></figcaption></figure>`
    }).join('')

    const title = DIFF ? `${group} — ${DIFF[0]} vs ${DIFF[1]}` : `${group} — ${SET}`
    const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <header>benchpilot · ${esc(title)} <span>· sheet ${pi + 1}/${pages} · ${slice.length} of ${entries.length}</span></header>
      <div class="grid">${tiles}</div>`

    const tmp = path.join(SHEETS, `.sheet.html`)
    fs.writeFileSync(tmp, html)
    await page.goto('file://' + tmp, { waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 250))

    const name = DIFF
      ? `diff__${DIFF[0]}-${DIFF[1]}__${group}${pages > 1 ? `__${pi + 1}` : ''}.png`
      : `${SET}__${group}${pages > 1 ? `__${pi + 1}` : ''}.png`
    const out = path.join(SHEETS, name)
    await page.screenshot({ path: out, fullPage: true })
    fs.rmSync(tmp, { force: true })
    written.push(out)
    console.log('  sheet', name)
  }
}

await browser.close()
if (!written.length) {
  console.log(`nothing to tile — run: node scripts/shots.mjs --set ${SET}`)
} else {
  console.log(`\ndone → ${SHEETS}`)
  console.log('hand these sheets to the model together with docs/scene-review.md')
}
