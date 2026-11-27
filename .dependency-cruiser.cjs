/** Socket rules 1 and 2 in ARCHITECTURE.md. */
module.exports = {
  forbidden: [
    {
      name: 'core-never-imports-gateways',
      comment: 'The socket knows no plug. A gateway is added without touching src/core.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(gateways|compat|testing)/' }
    },
    {
      name: 'gateway-imports-only-core-index',
      comment: 'A plug imports the socket through src/core/index.ts only, never a core file directly.',
      severity: 'error',
      from: { path: '^src/gateways/([^/]+)/' },
      to: { path: '^src/core/', pathNot: '^src/core/index\\.ts$' }
    },
    {
      name: 'gateways-never-import-each-other',
      comment: 'Each plug stands alone.',
      severity: 'error',
      from: { path: '^src/gateways/([^/]+)/' },
      to: { path: '^src/gateways/', pathNot: '^src/gateways/$1/' }
    },
    {
      name: 'gateway-imports-nothing-else',
      comment: 'No compat, testing or entry file inside a plug.',
      severity: 'error',
      from: { path: '^src/gateways/' },
      to: { path: '^src/(compat|testing)/|^src/[^/]+\\.ts$' }
    },
    {
      name: 'no-runtime-dependencies',
      comment: 'The package ships with zero runtime dependencies.',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'npm-unknown'], dependencyTypesNot: ['type-only'] }
    },
    {
      name: 'no-circular',
      comment: 'Type-only cycles are erased at build time and allowed.',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } }
    }
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(dist|test|node_modules)/' }
  }
};
