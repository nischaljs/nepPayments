// Renders docs/media/demo.gif: a typed terminal session whose output is real.
// Each command runs in a temp app (the packed package, mock mode, no network)
// and its real output is drawn into SVG frames, which rsvg-convert and ffmpeg
// turn into a GIF. Run it through scripts/demo/record.sh.
//
//   node scripts/demo/render.mjs <app dir> <tarball> <out.gif>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [app, tarball, out] = process.argv.slice(2);
if (!app || !tarball || !out) throw new Error('usage: render.mjs <app dir> <tarball> <out.gif>');

const COLS = 92;
const ROWS = 31;
const FONT = 15;
const CW = FONT * 0.6; // JetBrains Mono advance width
const LH = 20;
const PAD = 22;
const BAR = 34;
const W = Math.round(PAD * 2 + COLS * CW);
const H = BAR + PAD * 2 + ROWS * LH;
const C = { bg: '#1e1e2e', bar: '#181825', fg: '#cdd6f4', dim: '#7f849c', green: '#a6e3a1', red: '#f38ba8', blue: '#89b4fa', yellow: '#f9e2af', mauve: '#cba6f7' };

// No real gateway, no production: mock mode needs both.
const env = { ...process.env };
delete env.NODE_ENV;
const run = (cmd, args) => execFileSync(cmd, args, { cwd: app, env, encoding: 'utf8' });

// What the viewer sees, and what really runs to make its output.
const steps = [
  { shown: 'npm install nepal-payments', output: () => run('npm', ['install', '--offline', '--no-audit', '--no-fund', tarball]), paint: () => C.fg },
  { shown: 'cat pay.mjs', output: () => fs.readFileSync(path.join(app, 'pay.mjs'), 'utf8'), paint: line => (line.trim().startsWith('//') ? C.dim : C.fg), at: 'once' },
  {
    shown: 'node pay.mjs',
    output: () => run('node', ['pay.mjs']),
    paint: line => (line.includes('MISMATCH') ? C.red : line.includes('paid = true') ? C.green : C.fg),
    lineDelay: 0.7
  }
];

// The screen: a list of lines, each a list of [text, color] runs.
let lines = [[]];
const frames = [];
const push = seconds => frames.push({ svg: draw(), seconds });
const prompt = () => lines[lines.length - 1].push(['$ ', C.blue]);
const newline = () => {
  lines.push([]);
  if (lines.length > ROWS) lines = lines.slice(lines.length - ROWS);
};
const writeLine = (text, color) => {
  for (let i = 0; i < Math.max(1, text.length); i += COLS) {
    lines[lines.length - 1].push([text.slice(i, i + COLS), color]);
    newline();
  }
};

prompt();
push(0.8);
for (const step of steps) {
  const text = step.output().replace(/\s+$/, '');
  for (let i = 0; i < step.shown.length; i += 2) {
    lines[lines.length - 1].push([step.shown.slice(i, i + 2), C.fg]);
    push(0.07);
  }
  push(0.5);
  newline();
  const outLines = text.split('\n');
  for (const line of outLines) {
    writeLine(line, step.paint(line));
    if (step.lineDelay) push(step.lineDelay);
  }
  if (!step.lineDelay) push(step.at === 'once' ? 3.5 : 1.2);
  prompt();
  push(0.6);
}
frames[frames.length - 1].seconds = 5;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function draw() {
  const rows = lines
    .map((runs, r) => {
      let col = 0;
      const y = BAR + PAD + r * LH + FONT;
      return runs
        .map(([t, color]) => {
          const x = PAD + col * CW;
          col += t.length;
          return t.trim() ? `<text x="${x.toFixed(1)}" y="${y}" fill="${color}" xml:space="preserve">${esc(t)}</text>` : '';
        })
        .join('');
    })
    .join('\n');
  const last = lines[lines.length - 1];
  const cursorCol = last.reduce((n, [t]) => n + t.length, 0);
  const cursor = `<rect x="${(PAD + cursorCol * CW).toFixed(1)}" y="${BAR + PAD + (lines.length - 1) * LH + 3}" width="${CW.toFixed(1)}" height="${LH - 2}" fill="${C.fg}" opacity="0.7"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="JetBrainsMonoNL Nerd Font Mono, JetBrains Mono, monospace" font-size="${FONT}">
<rect width="${W}" height="${H}" rx="10" fill="${C.bg}"/>
<path d="M0 10 a10 10 0 0 1 10 -10 H${W - 10} a10 10 0 0 1 10 10 V${BAR} H0 z" fill="${C.bar}"/>
<circle cx="20" cy="17" r="6" fill="#f38ba8"/><circle cx="40" cy="17" r="6" fill="#f9e2af"/><circle cx="60" cy="17" r="6" fill="#a6e3a1"/>
<text x="${W / 2}" y="22" fill="${C.dim}" font-size="13" text-anchor="middle">nepal-payments · mock mode</text>
${rows}
${cursor}
</svg>`;
}

// SVG frames -> PNG -> one GIF with each frame's own duration.
const work = fs.mkdtempSync(path.join(path.dirname(app), 'frames-'));
const list = [];
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(4, '0')}`;
  fs.writeFileSync(path.join(work, `${name}.svg`), f.svg);
  execFileSync('rsvg-convert', ['-o', path.join(work, `${name}.png`), path.join(work, `${name}.svg`)]);
  list.push(`file '${name}.png'`, `duration ${f.seconds}`);
});
list.push(`file 'f${String(frames.length - 1).padStart(4, '0')}.png'`);
fs.writeFileSync(path.join(work, 'list.txt'), list.join('\n') + '\n');
execFileSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', 'split[a][b];[a]palettegen=max_colors=48:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', path.resolve(out)],
  { cwd: work }
);
console.log(`${frames.length} frames -> ${out}`);
