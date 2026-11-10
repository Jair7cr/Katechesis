#!/usr/bin/env node
/**
 * Monta a conexão do papel katechesis_api a partir da conexão do dono (mesmo servidor e banco).
 * Uso: node db/scripts/url-api.mjs "<url do dono>" "<senha da api>"
 */
const [, , urlDono, senha] = process.argv;
if (!urlDono || !senha) { console.error('Uso: url-api.mjs <url do dono> <senha>'); process.exit(1); }
const u = new URL(urlDono);
u.username = 'katechesis_api';
u.password = senha;
if (!u.searchParams.has('sslmode')) u.searchParams.set('sslmode', 'require');
u.searchParams.delete('channel_binding');
process.stdout.write(u.toString());
