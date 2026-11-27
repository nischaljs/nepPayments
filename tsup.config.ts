import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    khalti: 'src/khalti.ts',
    esewa: 'src/esewa.ts',
    connectips: 'src/connectips.ts',
    hamropay: 'src/hamropay.ts',
    nepalpay: 'src/nepalpay.ts',
    fonepay: 'src/fonepay.ts',
    bankcard: 'src/bankcard.ts',
    compat: 'src/compat/index.ts',
    testing: 'src/testing/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  // Shared chunks, so PaymentError is one class across subpaths in both formats.
  splitting: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  sourcemap: false,
  treeshake: true
});
