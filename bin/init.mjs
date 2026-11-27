#!/usr/bin/env node
import { constants, copyFileSync } from 'node:fs';

for (const [source, destination] of [['../.env.example', '.env'], ['../examples/payments.mjs', 'payments.mjs']]) {
  try {
    copyFileSync(new URL(source, import.meta.url), destination, constants.COPYFILE_EXCL);
    console.log('Created ' + destination);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log('Kept existing ' + destination);
  }
}
console.log('Set PAYMENT_MODE and PAYMENT_GATEWAYS in your server environment. See .env.example in the package for each gateway’s keys.');
