/**
 * Ponto de entrada no Cloudflare Workers.
 * Só as rotas /api/* chegam aqui (ver wrangler.toml); o app web é servido direto como arquivos estáticos.
 */
import { criarApp } from './app';
import { bancoNeon } from './banco';

export interface Env {
  DATABASE_URL: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const app = criarApp(c => bancoNeon((c.env as Env).DATABASE_URL));

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);
  }
} satisfies ExportedHandler<Env>;
