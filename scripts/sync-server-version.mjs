#!/usr/bin/env node
/**
 * Sincroniza la versión de server.json (MCP Registry), que npm no toca, con la
 * versión que semantic-release acaba de calcular. Se ejecuta en la fase
 * `prepare`, antes de que @semantic-release/git commitee los assets.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];

if (!version) {
  console.error('Uso: node scripts/sync-server-version.mjs <version>');
  process.exit(1);
}

// server.json: la versión aparece en la raíz y en cada entrada de packages.
const server = JSON.parse(readFileSync('server.json', 'utf8'));

server.version = version;
if (Array.isArray(server.packages)) {
  for (const pkg of server.packages) {
    pkg.version = version;
  }
}

writeFileSync('server.json', `${JSON.stringify(server, null, 2)}\n`);

console.log(`server.json sincronizado a la versión ${version}`);
