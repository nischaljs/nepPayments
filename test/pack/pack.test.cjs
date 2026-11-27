// Packs the package, installs the tarball in a temp project, and imports every entry as ESM and CJS.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const entries = ['', '/khalti', '/esewa', '/connectips', '/hamropay', '/nepalpay', '/fonepay', '/bankcard', '/compat', '/testing'];

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

    const installed = path.join(app, 'node_modules/nepal-payments');
    // Exercise the copied server setup the same way an installed-package user would.
    const template = fs.readFileSync(path.join(installed, '.env.example'), 'utf8');
    const init = path.join(installed, pkg.bin['nepal-payments-init']);
    execFileSync('node', [init], { cwd: app });
    assert.equal(fs.readFileSync(path.join(app, '.env'), 'utf8'), template);
    fs.appendFileSync(path.join(app, '.env'), '\n# existing merchant settings\n');
    fs.appendFileSync(path.join(app, 'payments.mjs'), '\n// existing server integration\n');
    execFileSync('node', [init], { cwd: app });
    assert.match(fs.readFileSync(path.join(app, '.env'), 'utf8'), /existing merchant settings/);
    assert.match(fs.readFileSync(path.join(app, 'payments.mjs'), 'utf8'), /existing server integration/);
    const exampleEnv = Object.fromEntries([...template.matchAll(/^([A-Z_]+)=(.*)$/gm)].map(m => [m[1], m[2]]));
    const names = ['khalti', 'esewa', 'connectips', 'hamropay', 'nepalpay', 'fonepay', 'bankcard'];
    const inspect = "import { payments } from './payments.mjs'; console.log(Object.keys(payments).join(','))";
    const load = env => execFileSync('node', ['--input-type=module', '-e', inspect], {
      cwd: app, encoding: 'utf8', env: { ...process.env, ...env }
    }).trim();
    assert.equal(load(exampleEnv), 'khalti');
    const merchant = Object.fromEntries(Object.keys(exampleEnv).map(k => [k, 'test']));
    Object.assign(merchant, {
      PAYMENT_GATEWAYS: names.join(','), CIPS_MERCHANT_ID: '123', NQR_CATEGORY: '5411',
      CIPS_PRIVATE_KEY_PATH: '', NQR_PRIVATE_KEY_PATH: '', CIPS_PFX_PASSWORD: 'test-only', NQR_PFX_PASSWORD: 'test-only',
      CIPS_PFX_PATH: path.join(root, 'test/fixtures/test-aes.pfx'), NQR_PFX_PATH: path.join(root, 'test/fixtures/test-aes.pfx'),
      CIPS_BASE_URL: '', HAMROPAY_API_BASE: 'https://api.example', HAMROPAY_GATEWAY_BASE: 'https://checkout.example',
      NQR_GENERATE_URL: 'https://qr.example/generate', NQR_REPORT_URL: 'https://qr.example/report'
    });
    for (const mode of ['sandbox', 'live']) {
      assert.deepEqual(load({ ...merchant, PAYMENT_MODE: mode }).split(',').sort(), [...names].sort());
    }

    const readme = fs.readFileSync(path.join(installed, 'README.md'), 'utf8');
    const firstPayment = /Save this as `checkout\.mjs`[\s\S]*?```js\n([\s\S]*?)\n```/.exec(readme);
    assert.ok(firstPayment, 'README includes the runnable first payment');
    fs.writeFileSync(path.join(app, 'checkout.mjs'), firstPayment[1]);
    assert.equal(execFileSync('node', ['checkout.mjs'], { cwd: app, encoding: 'utf8' }).trim(), 'paid 10000');

    for (const [method, outcome] of [['nepalpay', 'paid'], ['fonepay', 'pending'], ['bankcard', 'failed']]) {
      const output = execFileSync(path.join(app, 'node_modules', '.bin', 'nepal-payments-demo'), [method, outcome], { cwd: app, encoding: 'utf8' });
      assert.ok(output.includes('Server verified: ' + outcome));
    }

    const demo = path.join(installed, 'examples/checkout.mjs');
    assert.ok(fs.existsSync(demo));
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major > 22 || (major === 22 && minor >= 13)) {
      const output = execFileSync('node', [demo], { cwd: app, encoding: 'utf8' });
      assert.match(output, /Two webhook deliveries. One verified download granted/);
      assert.match(output, /second paid attempt without a notification/);
    }

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
