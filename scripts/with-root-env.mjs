#!/usr/bin/env node
/**
 * Run a command with repo-root .env loaded, overriding shell placeholders.
 *
 * Usage: node scripts/with-root-env.mjs <command> [args...]
 */
import { spawn } from 'node:child_process';
import { loadRootEnv } from './load-root-env.mjs';

loadRootEnv({ override: true });

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node scripts/with-root-env.mjs <command> [args...]');
  process.exit(1);
}

const child = spawn(cmd, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
