#!/usr/bin/env node
import { runCli } from '../src/index.js';

runCli(process.argv).catch((err) => {
  console.error('Fatal Error:', err.message || err);
  process.exit(1);
});
