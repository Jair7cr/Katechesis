/**
 * Servidor local para testar o sistema inteiro sem Cloudflare: API (Hono) + app construído (apps/web/dist),
 * ligado a um Postgres local. Uso: PORTA=8788 DATABASE_URL_API=... npx tsx testes/apoio/servidor-local.ts
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { criarApp } from '../../apps/api/src/app';
import { bancoPg } from './banco-pg';

const banco = bancoPg(process.env.DATABASE_URL_API!);
const api = criarApp(() => banco);
const raiz = new Hono();
raiz.route('/', api);
raiz.use('/*', serveStatic({ root: './apps/web/dist' }));
raiz.get('*', serveStatic({ path: './apps/web/dist/index.html' }));
serve({ fetch: raiz.fetch, port: Number(process.env.PORTA ?? 8788) });
console.log('Katechesis local em http://localhost:' + (process.env.PORTA ?? 8788));
