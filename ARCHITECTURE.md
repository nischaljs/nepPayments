# Architecture

The package is a socket and plugs.

- **Socket** (`src/core/`): everything that is the same for every gateway. HTTP over `fetch` with timeouts, redaction of secrets, HMAC and RSA signing, the PFX reader, the `Paisa` money type, the config checks, `PaymentError`, mock mode, and the checks `verify` makes.
- **Plugs** (`src/gateways/<name>/`): one folder per gateway. A plug declares its config schema, its endpoints and how to talk to the gateway. It does not check amounts, catch errors or redact: the socket does that for every plug.
- **Entries** (`src/index.ts`, `src/<name>.ts`, `src/compat/`, `src/testing/`): `createPayments`, the subpath entries, the 2.x `NepPayments` class and the fakes.

## Socket rules

| # | Rule | Enforced by |
|---|------|-------------|
| 1 | Core never imports a gateway, compat or testing. | dependency-cruiser `core-never-imports-gateways` |
| 2 | A gateway imports the core only through `src/core/index.ts`, and never another gateway. | `gateway-imports-only-core-index`, `gateways-never-import-each-other` |
| 3 | No runtime dependencies. Node 18 built-ins and `fetch` only. | `no-runtime-dependencies`, package.json |
| 4 | Every error that leaves a client is a `PaymentError`, cleaned by the client's redactor. A plug's unexpected error becomes `INVALID_RESPONSE`. | `connect()` in `src/core/socket.ts` |
| 5 | Every status is a returned value. Only input, config, signature, mismatch and network problems throw. | `Plug` types, tests |
| 6 | `verify` takes `expectedAmount` in paisa and `expectedOrderId`, and the socket compares them with what the gateway reports. A paid result with no amount is `INVALID_RESPONSE`. | `connect()`, tests |
| 7 | A plug lists every secret in `secrets(config)`. They never appear in an error, a result's `raw`, `String()`, `JSON.stringify` or `util.inspect`. | Redactor, tests |
| 8 | Mock mode needs no keys and makes no network call, for every plug. | `connect()`, tests |
| 9 | Amounts are integer paisa everywhere in the public API. A plug converts to the gateway's unit itself. | `Paisa` brand |

## Add a gateway in 5 steps

1. Make `src/gateways/<name>/plug.ts` exporting a `Plug` (see `src/core/socket.ts`): `name`, `schema`, `endpoints` (`live: null` if the gateway does not publish live hosts), `secrets`, `reportsOrderId`, `startKind`, `initiate`, `verify`, and if the gateway has them `parseCallback`, `status`, `refund`. Import only from `../../core`.
2. Add `src/gateways/<name>/index.ts` with `create<Name>(config)` that calls `connect(plug, config, options)`, and add the name to `GatewayName` in `src/core/types.ts`.
3. Add the gateway to `Configs`, `Clients` and `MAKERS` in `src/index.ts`, and add `src/<name>.ts` (two lines, like `src/khalti.ts`), the entry in `tsup.config.ts`, and the subpath in `package.json` `exports` and `typesVersions`.
4. Add `fake<Name>()` to `src/testing/index.ts` and tests in `test/` for initiate shape, signatures against the gateway's own examples, callbacks, every status, mismatches and secrets.
5. Write `docs/<name>.md`, add a line to `llms.txt`, `AGENTS.md` and `skills/nepal-payments/SKILL.md`, then run `npm run check`.
