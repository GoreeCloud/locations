#!/usr/bin/env node
/**
 * Operator-side, read-only preflight for GoreeCloud Locations Compose.
 * Does not print or transmit secrets, access the network, or claim a secure deployment.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const placeholder = /REPLACE|CHANGEME|YOUR[_-]?SECRET|SAMPLE[_-]?SECRET|EXAMPLE[_-]?PASSWORD|^test[_-]?only/i;
function validSecret(value, { uriSafe = false } = {}) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 512 ||
      placeholder.test(value) || new Set(value).size < 8) return false;
  return !uriSafe || /^[A-Za-z0-9_-]+$/.test(value);
}

export function checkConfiguration(env) {
  const errors = [];
  if (!validSecret(env.POSTGRES_PASSWORD,{uriSafe:true})) {
    errors.push('POSTGRES_PASSWORD must be a unique URL-safe random value of at least 32 characters');
  }
  if (!validSecret(env.BOOTSTRAP_TOKEN)) {
    errors.push('BOOTSTRAP_TOKEN must be a separate random value of at least 32 characters');
  }
  if (env.POSTGRES_PASSWORD && env.BOOTSTRAP_TOKEN &&
      env.POSTGRES_PASSWORD === env.BOOTSTRAP_TOKEN) {
    errors.push('The database and bootstrap secrets must be independent');
  }

  const portText = String(env.PORT ?? '8080');
  if (!/^[0-9]{1,5}$/.test(portText) ||
      Number(portText)<1 || Number(portText)>65535) {
    errors.push('PORT must be a TCP port from 1 through 65535');
  }
  if (env.WEB_ORIGIN) {
    try {
      const origin = new URL(env.WEB_ORIGIN);
      const isLoopback = ['localhost','127.0.0.1','[::1]','::1'].includes(origin.hostname);
      const allowed = origin.protocol === 'https:' ||
        (env.NODE_ENV !== 'production' && origin.protocol === 'http:' && isLoopback);
      if (!allowed || origin.username || origin.password || origin.search || origin.hash ||
          origin.pathname !== '/' || env.WEB_ORIGIN !== origin.origin) throw new Error();
    } catch {
      errors.push('WEB_ORIGIN must be an exact HTTPS origin, or HTTP loopback for development only');
    }
  }
  return errors;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const errors = checkConfiguration(process.env);
  if (errors.length) {
    for (const issue of errors) console.error('Configuration: ' + issue);
    console.error('No containers were started and no secret values were printed.');
    process.exitCode = 1;
  } else {
    console.log('Configuration preflight passed. TLS, backups, permission checks and deployment acceptance remain separate.');
  }
}
