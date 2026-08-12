#!/usr/bin/env node
/**
 * Register a local Clerk webhook endpoint via the Clerk Backend API + Svix.
 *
 * Usage:
 *   node scripts/setup-clerk-webhook.mjs [--tunnel-url https://....loca.lt]
 *
 * Requires CLERK_SECRET_KEY in repo-root .env. Starts localtunnel on :8080 when
 * --tunnel-url is omitted and no TUNNEL_URL env var is set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Svix } from 'svix';
import { loadRootEnv, repoRoot } from './load-root-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadRootEnv({ override: true });

const EVENTS = [
  'organization.created',
  'organization.updated',
  'organizationMembership.created',
  'organizationMembership.updated',
  'organizationMembership.deleted',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let tunnelUrl = process.env.TUNNEL_URL?.replace(/\/$/, '');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tunnel-url' && args[i + 1]) {
      tunnelUrl = args[++i].replace(/\/$/, '');
    }
  }
  return tunnelUrl;
}

async function clerkFetch(path, init = {}) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('CLERK_SECRET_KEY is missing from .env');
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`Clerk API ${path} failed (${res.status}): ${text}`);
  }
  return body;
}

async function ensureSvixApp() {
  try {
    return await clerkFetch('/webhooks/svix', { method: 'POST', body: '{}' });
  } catch (err) {
    const message = String(err);
    if (message.includes('svix_app_exists') || message.includes('Only one Svix app')) return null;
    throw err;
  }
}

async function svixDashboardUrl() {
  return clerkFetch('/webhooks/svix_url', { method: 'POST', body: '{}' });
}

function parseSvixPortal(portalUrl) {
  const hash = portalUrl.split('#key=')[1];
  if (!hash) throw new Error('Svix portal URL did not include a #key payload.');
  const decoded = JSON.parse(Buffer.from(hash, 'base64url').toString('utf8'));
  const region = decoded.region === 'eu' ? 'https://api.eu.svix.com' : 'https://api.svix.com';
  return {
    appId: decoded.appId,
    token: decoded.oneTimeToken,
    serverUrl: region,
  };
}

async function upsertSvixEndpoint(portalUrl, webhookUrl) {
  const { appId, token, serverUrl } = parseSvixPortal(portalUrl);
  const svix = new Svix(token, { serverUrl });
  try {
    const existing = await svix.endpoint.list(appId, { limit: 50 });
    const found = existing.data.find((ep) => ep.url === webhookUrl);
    if (found) {
      const secret = await svix.endpoint.getSecret(appId, found.id);
      return { endpointId: found.id, secret: secret.key };
    }
    const created = await svix.endpoint.create(appId, {
      url: webhookUrl,
      description: 'LedgerPilot local dev',
      filterTypes: EVENTS,
    });
    const secret = await svix.endpoint.getSecret(appId, created.id);
    return { endpointId: created.id, secret: secret.key };
  } catch (err) {
    console.warn('Could not create the Svix endpoint via API:', err.message ?? err);
    return null;
  }
}

function upsertEnv(key, value) {
  const envPath = path.join(repoRoot, '.env');
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  fs.writeFileSync(envPath, `${next.join('\n').replace(/\n*$/, '')}\n`);
}

async function startLocaltunnel() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'localtunnel', '--port', '8080'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) reject(new Error('Timed out waiting for localtunnel URL'));
    }, 30_000);

    child.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/https?:\/\/[^\s]+/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ url: match[0].replace(/\/$/, ''), child });
      }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!resolved) reject(new Error(`localtunnel exited with code ${code}`));
    });
  });
}

async function main() {
  let tunnelUrl = parseArgs();
  let tunnelProc = null;

  if (!tunnelUrl) {
    console.log('Starting localtunnel on port 8080…');
    const tunnel = await startLocaltunnel();
    tunnelUrl = tunnel.url;
    tunnelProc = tunnel.child;
  }

  const webhookUrl = `${tunnelUrl}/api/webhooks/clerk`;
  console.log(`Webhook URL: ${webhookUrl}`);

  await ensureSvixApp();
  const dashboard = await svixDashboardUrl();
  const portal = dashboard?.url ?? dashboard?.svix_url ?? dashboard?.dashboard_url;
  if (!portal) {
    console.log('Svix response:', JSON.stringify(dashboard, null, 2));
    throw new Error('Could not obtain Svix dashboard URL from Clerk.');
  }

  upsertEnv('CLERK_JWT_ISSUER', 'https://simple-mackerel-36.clerk.accounts.dev');

  const created = await upsertSvixEndpoint(portal, webhookUrl);
  if (created) {
    upsertEnv('CLERK_WEBHOOK_SECRET', created.secret);
    console.log('\nClerk webhook configured:');
    console.log(`- Endpoint: ${webhookUrl}`);
    console.log(`- Svix endpoint id: ${created.endpointId}`);
    console.log('- Updated CLERK_WEBHOOK_SECRET and CLERK_JWT_ISSUER in .env');
  } else {
    console.log('\nAdd the endpoint manually in the Svix portal:');
    console.log(`1. Open: ${portal}`);
    console.log('2. Add endpoint → paste this URL:');
    console.log(`   ${webhookUrl}`);
    console.log('3. Subscribe to events:');
    for (const event of EVENTS) console.log(`   - ${event}`);
    console.log('4. Copy the endpoint Signing secret → set CLERK_WEBHOOK_SECRET in .env');
    console.log('\nUpdated CLERK_JWT_ISSUER in .env automatically.');
  }

  console.log('\nRestart the API to load secrets:');
  console.log('  pnpm --filter @ledgerpilot/api dev');

  if (tunnelProc) {
    console.log('\nlocaltunnel is running in the background of this script.');
    console.log('Leave this terminal open while testing webhooks.');
    process.on('SIGINT', () => {
      tunnelProc.kill();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
