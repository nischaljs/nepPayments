// Packs the package, installs the tarball in a temp project, and imports every entry as ESM and CJS.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const entries = ['', '/khalti', '/esewa', '/connectips', '/hamropay', '/compat', '/testing'];

test('packed package installs and imports as ESM and CJS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nepal-payments-pack-'));
  try {
    const out = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', dir], { cwd: root, encoding: 'utf8' });
    const [info] = JSON.parse(out);
    const files = info.files.map(f => f.path);
    assert.ok(files.includes('dist/index.mjs') && files.includes('dist/index.js') && files.includes('dist/index.d.ts'));
    assert.ok(files.includes('AGENTS.md') && files.includes('llms.txt') && files.includes('skills/nepal-payments/SKILL.md'));
    assert.ok(!files.some(f => f.startsWith('src/') || f.startsWith('test/')), 'no source or tests in the tarball');

    const app = path.join(dir, 'app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'package.json'), '{"name":"app","private":true}');
    execFileSync('npm', ['install', '--offline', '--no-audit', '--no-fund', path.join(dir, info.filename)], { cwd: app, stdio: 'ignore' });
    const pkg = JSON.parse(fs.readFileSync(path.join(app, 'node_modules/nepal-payments/package.json'), 'utf8'));
    assert.deepEqual(pkg.dependencies ?? {}, {});

    const cjs = entries.map(e => `const m${e.replace(/\W/g, '_')} = require('nepal-payments${e}'); if (!Object.keys(m${e.replace(/\W/g, '_')}).length) throw new Error('${e}');`).join('\n');
    fs.writeFileSync(path.join(app, 'a.cjs'), `${cjs}\nconst { createPayments, rupees } = require('nepal-payments');\nconst p = createPayments({ mode: 'mock', khalti: {} });\np.khalti.initiate({ amount: rupees(10), orderId: 'o', orderName: 'n', returnUrl: 'https://a.example', websiteUrl: 'https://a.example' }).then(s => console.log(s.kind));\n`);
    assert.equal(execFileSync('node', ['a.cjs'], { cwd: app, encoding: 'utf8' }).trim(), 'redirect');

    const esm = entries.map((e, i) => `import * as m${i} from 'nepal-payments${e}'; if (!Object.keys(m${i}).length) throw new Error('${e}');`).join('\n');
    fs.writeFileSync(path.join(app, 'a.mjs'), `${esm}\nimport { createPayments, rupees, PaymentError } from 'nepal-payments';\nimport { PaymentError as P2 } from 'nepal-payments/esewa';\nif (PaymentError !== P2) throw new Error('two classes');\nconst p = createPayments({ mode: 'mock', esewa: {} });\nconst s = await p.esewa.initiate({ amount: rupees(10), orderId: 'o', successUrl: 'https://a.example', failureUrl: 'https://a.example' });\nconsole.log(s.kind);\n`);
    assert.equal(execFileSync('node', ['a.mjs'], { cwd: app, encoding: 'utf8' }).trim(), 'form');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
