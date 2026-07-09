#!/usr/bin/env node
import { createCli } from './cli.js';

createCli().parseAsync().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
