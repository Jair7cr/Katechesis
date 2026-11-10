/**
 * API do Katechesis (Cloudflare Workers + Hono).
 *
 * Regras de ouro:
 *  - Toda decisão de acesso é conferida no BANCO (funções e RLS). A API valida formato,
 *    traduz erros e organiza as rotas; ela nunca é a única barreira.
 *  - Nenhum CPF completo, senha ou token vai para o log.
 *  - Respostas: { dados } em caso de sucesso; { erro: { codigo, mensagem, campos? } } em caso de erro.
 */
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  PAPEIS_DIOCESE, PAPEIS_PAROQUIA, UFS, cpfValido, corValida, identificadorValido, validarSenha,
  type Contexto
} from '@katechesis/compartilhado';
import type { Banco, Comando } from './banco';
import { ErroApi, traduzirErro } from './erros';

export const VERSAO = '0.2.0';

type Variaveis = { banco: Banco; token?: string; requestId: string; inicio: number };
type Ctx = Context<{ Variables: Variaveis }>;

export function criarApp(obterBanco: (c: Context) => Banco) {
  const app = new Hono<{ Variables: Variaveis }>().basePath('/api');

  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));
  app.use('*', bodyLimit({ maxSize: 64 * 1024, onError: c => c.json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Envio grande demais.' } }, 413) }));
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('inicio', Date.now());
    c.set('banco', obterBanco(c));
    c.header('Cache-Control', 'no-store');
    const auth = c.req.header('Authorization');
    if (auth?.startsWith('Bearer ')) c.set('token', auth.slice(7).trim());
    await next();
    c.header('X-Request-Id', c.get('requestId'));
  });

  app.onError((erro, c) => {
    const e = traduzirErro(erro);
    if (e.status >= 500) console.error(JSON.stringify({ requestId: c.get('requestId'), rota: c.req.path, erro: String((erro as Error)?.message ?? erro).slice(0, 300) }));
    if (e.status === 403 || e.status >= 500) registrarEmSegundoPlano(c as Ctx, e.status === 403 ? 'ACESSO_NEGADO' : 'ERRO_API', e.status === 403 ? 'NEGADO' : 'ERRO', e.codigo);
    return c.json({ erro: { codigo: e.codigo, mensagem: e.message, ...(e.campos ? { campos: e.campos } : {}) } }, e.status as 400);
  });

  app.notFound(c => c.json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Rota não encontrada.' } }, 404));

  // ------------------------------------------------------------------ saúde
  app.get('/saude', c => c.json({ dados: { ok: true, versao: VERSAO } }));

  // ------------------------------------------------------------------ sessão
  app.post('/sessao/entrar', async c => {
    const corpo = validar(c, await lerJson(c), z.object({
      identificador: z.string().max(40).refine(identificadorValido, 'Informe um CPF válido ou o código de acesso.'),
      senha: z.string().min(1, 'Informe a senha.').max(128),
      lembrar: z.boolean().optional()
    }));
    const [[{ r }]] = await c.get('banco').transacao([{
      text: 'select app.entrar($1, $2, $3, $4) as r',
      params: [corpo.identificador, corpo.senha, corpo.lembrar ?? false, c.get('requestId')]
    }]);
    if (!r.ok) throw new ErroApi(r.motivo === 'MUITAS_TENTATIVAS' ? 429 : 401, r.motivo);
    return c.json({ dados: { token: r.token, chaveAparelho: r.chaveAparelho ?? null, trocaSenhaPendente: r.trocaSenhaPendente } });
  });

  app.post('/sessao/renovar', async c => {
    const corpo = validar(c, await lerJson(c), z.object({ chaveAparelho: z.string().regex(/^[0-9a-f]{64}$/) }));
    const [[{ r }]] = await c.get('banco').transacao([{
      text: 'select app.renovar_por_aparelho($1, $2) as r', params: [corpo.chaveAparelho, c.get('requestId')]
    }]);
    if (!r.ok) throw new ErroApi(401, 'APARELHO_INVALIDO');
    return c.json({ dados: { token: r.token, trocaSenhaPendente: false } });
  });

  app.get('/sessao', async c => {
    const { ctx } = await comSessao(c, [], { permitirTrocaPendente: true });
    return c.json({ dados: ctx });
  });

  app.post('/sessao/sair', async c => {
    const corpo = validar(c, await lerJson(c, true), z.object({ chaveAparelho: z.string().regex(/^[0-9a-f]{64}$/).optional() }));
    await comSessao(c, [{ text: 'select app.sair($1)', params: [corpo.chaveAparelho ?? null] }], { permitirTrocaPendente: true });
    return c.json({ dados: { ok: true } });
  });

  app.put('/sessao/vinculo', async c => {
    const corpo = validar(c, await lerJson(c), z.object({ vinculoId: z.string().uuid() }));
    const { linhas } = await comSessao(c, [{ text: 'select app.escolher_vinculo($1) as ctx', params: [corpo.vinculoId] }]);
    return c.json({ dados: linhas[0][0].ctx as Contexto });
  });

  app.post('/sessao/senha', async c => {
    const corpo = validar(c, await lerJson(c), z.object({ atual: z.string().min(1).max(128), nova: z.string().max(128) }));
    const problema = validarSenha(corpo.nova);
    if (problema) throw new ErroApi(400, 'SENHA_FRACA', problema, { nova: problema });
    const { linhas } = await comSessao(c, [{ text: 'select app.alterar_minha_senha($1, $2) as r', params: [corpo.atual, corpo.nova] }],
      { permitirTrocaPendente: true });
    const r = linhas[0][0].r;
    if (!r.ok) {
      const status = r.motivo === 'SENHA_ATUAL_INCORRETA' || r.motivo === 'BLOQUEADA' ? 403 : 400;
      throw new ErroApi(status, r.motivo, undefined, r.motivo === 'SENHA_ATUAL_INCORRETA' ? { atual: 'Senha atual incorreta.' } : undefined);
    }
    return c.json({ dados: { ok: true } });
  });

  // ------------------------------------------------------------------ plataforma (Administrador mestre)
  const esquemaDiocese = z.object({
    nome: z.string().trim().min(2).max(150),
    cidade: z.string().trim().max(100).nullish(),
    uf: z.enum(UFS).nullish()
  });

  app.get('/plataforma/dioceses', async c => {
    const { linhas } = await comSessao(c, [
      { text: 'select app.exigir_admin_mestre()' },
      { text: `select d.id, d.nome, d.cidade, d.uf, d.situacao,
                      (select count(*)::int from paroquia p where p.diocese_id = d.id) as paroquias
                 from diocese d order by d.nome` }
    ]);
    return c.json({ dados: linhas[1] });
  });

  app.post('/plataforma/dioceses', async c => {
    const d = validar(c, await lerJson(c), esquemaDiocese);
    const { linhas } = await comSessao(c, [
      { text: 'select app.exigir_admin_mestre()' },
      { text: 'insert into diocese (nome, cidade, uf) values ($1, $2, $3) returning id', params: [d.nome, d.cidade ?? null, d.uf ?? null] },
      evento(c, 'DIOCESE_CRIADA', { nome: d.nome })
    ]);
    return c.json({ dados: linhas[1][0] }, 201);
  });

  app.patch('/plataforma/dioceses/:id', async c => {
    const id = uuid(c.req.param('id'));
    const d = validar(c, await lerJson(c), esquemaDiocese.partial().extend({ situacao: z.enum(['ATIVA', 'INATIVA']).optional() }));
    const { linhas } = await comSessao(c, [
      { text: 'select app.exigir_admin_mestre()' },
      atualizar('diocese', id, { nome: d.nome, cidade: d.cidade, uf: d.uf, situacao: d.situacao }),
      evento(c, 'DIOCESE_ALTERADA', { id, campos: Object.keys(d) })
    ]);
    if (!linhas[1].length) throw new ErroApi(404, 'DIOCESE_NAO_ENCONTRADA');
    return c.json({ dados: linhas[1][0] });
  });

  const esquemaParoquia = z.object({
    nome: z.string().trim().min(2).max(150),
    dioceseId: z.string().uuid().nullish(),
    cidade: z.string().trim().max(100).nullish(),
    uf: z.enum(UFS).nullish(),
    corIdentidade: z.string().refine(corValida, 'Cor inválida.').optional(),
    corDestaque: z.string().refine(corValida, 'Cor inválida.').optional()
  });

  app.get('/plataforma/paroquias', async c => {
    const { linhas } = await comSessao(c, [
      { text: 'select app.exigir_admin_mestre()' },
      { text: `select p.id, p.nome, p.cidade, p.uf, p.situacao, p.diocese_id as "dioceseId", d.nome as "dioceseNome",
                      p.cor_identidade as "corIdentidade", p.cor_destaque as "corDestaque",
                      (select count(*)::int from vinculo v where v.paroquia_id = p.id and v.situacao = 'ATIVO') as pessoas
                 from paroquia p left join diocese d on d.id = p.diocese_id
                order by p.nome` }
    ]);
    return c.json({ dados: linhas[1] });
  });

  app.post('/plataforma/paroquias', async c => {
    const p = validar(c, await lerJson(c), esquemaParoquia);
    const { linhas } = await comSessao(c, [
      { text: 'select app.exigir_admin_mestre()' },
      {
        text: `insert into paroquia (nome, diocese_id, cidade, uf, cor_identidade, cor_destaque)
               values ($1, $2, $3, $4, coalesce($5, '#7B1E3A'), coalesce($6, '#B8913F')) returning id`,
        params: [p.nome, p.dioceseId ?? null, p.cidade ?? null, p.uf ?? null, p.corIdentidade ?? null, p.corDestaque ?? null]
      },
      evento(c, 'PAROQUIA_CRIADA', { nome: p.nome })
    ]);
    return c.json({ dados: linhas[1][0] }, 201);
  });

  app.patch('/plataforma/paroquias/:id', async c => {
    const id = uuid(c.req.param('id'));
    const p = validar(c, await lerJson(c), esquemaParoquia.partial().extend({ situacao: z.enum(['ATIVA', 'INATIVA']).optional() }));
    const { linhas } = await comSessao(c, [
      { text: 'select app.exigir_admin_mestre()' },
      atualizar('paroquia', id, {
        nome: p.nome, diocese_id: p.dioceseId, cidade: p.cidade, uf: p.uf,
        cor_identidade: p.corIdentidade, cor_destaque: p.corDestaque, situacao: p.situacao
      }),
      evento(c, 'PAROQUIA_ALTERADA', { id, campos: Object.keys(p) })
    ]);
    if (!linhas[1].length) throw new ErroApi(404, 'PAROQUIA_NAO_ENCONTRADA');
    return c.json({ dados: linhas[1][0] });
  });

  app.get('/plataforma/paroquias/:id/pessoas', async c => {
    const id = uuid(c.req.param('id'));
    const { linhas } = await comSessao(c, [
      { text: 'select app.exigir_admin_mestre()' },
      { text: 'select app.pessoas_da_paroquia($1) as r', params: [id] }
    ]);
    return c.json({ dados: linhas[1][0].r ?? [] });
  });

  const esquemaPessoa = z.object({
    nome: z.string().trim().min(2).max(150),
    cpf: z.string().refine(cpfValido, 'CPF inválido.'),
    email: z.string().trim().email('E-mail inválido.').max(254).nullish().or(z.literal('')),
    papel: z.string()
  });

  app.post('/plataforma/paroquias/:id/pessoas', async c => {
    const id = uuid(c.req.param('id'));
    const p = validar(c, await lerJson(c), esquemaPessoa.extend({ papel: z.enum(PAPEIS_PAROQUIA as [string, ...string[]]) }));
    const { linhas } = await comSessao(c, [{
      text: `select app.vincular_pessoa($1, null, $2::papel, $3, $4, $5) as r`,
      params: [id, p.papel, p.nome, p.cpf, p.email || null]
    }]);
    return c.json({ dados: linhas[0][0].r }, 201);
  });

  app.post('/plataforma/dioceses/:id/pessoas', async c => {
    const id = uuid(c.req.param('id'));
    const p = validar(c, await lerJson(c), esquemaPessoa.extend({ papel: z.enum(PAPEIS_DIOCESE as [string, ...string[]]) }));
    const { linhas } = await comSessao(c, [{
      text: `select app.vincular_pessoa(null, $1, $2::papel, $3, $4, $5) as r`,
      params: [id, p.papel, p.nome, p.cpf, p.email || null]
    }]);
    return c.json({ dados: linhas[0][0].r }, 201);
  });

  app.post('/plataforma/contas/:id/redefinir-senha', async c => {
    const id = uuid(c.req.param('id'));
    const { linhas } = await comSessao(c, [{ text: 'select app.redefinir_senha($1) as r', params: [id] }]);
    return c.json({ dados: linhas[0][0].r });
  });

  // ------------------------------------------------------------------ paróquia atual
  app.get('/paroquia', async c => {
    const { ctx, linhas } = await comSessao(c, [{
      text: `select p.id, p.nome, p.cidade, p.uf, p.cor_identidade as "corIdentidade", p.cor_destaque as "corDestaque",
                    d.nome as "dioceseNome"
               from paroquia p left join diocese d on d.id = p.diocese_id
              where p.id = app.paroquia_atual()`
    }], { exigirVinculo: true });
    if (!linhas[0].length) throw new ErroApi(404, 'PAROQUIA_NAO_ENCONTRADA');
    return c.json({ dados: { ...linhas[0][0], papeis: vinculoAtivo(ctx)?.papeis ?? [] } });
  });

  app.patch('/paroquia', async c => {
    const p = validar(c, await lerJson(c), z.object({
      nome: z.string().trim().min(2).max(150).optional(),
      cidade: z.string().trim().max(100).nullish(),
      uf: z.enum(UFS).nullish(),
      corIdentidade: z.string().refine(corValida, 'Cor inválida.').optional(),
      corDestaque: z.string().refine(corValida, 'Cor inválida.').optional()
    }));
    const { linhas } = await comSessao(c, [
      atualizar('paroquia', null, { nome: p.nome, cidade: p.cidade, uf: p.uf, cor_identidade: p.corIdentidade, cor_destaque: p.corDestaque }),
      evento(c, 'PAROQUIA_CONFIGURADA', { campos: Object.keys(p) })
    ], { exigirVinculo: true });
    if (!linhas[0].length) throw new ErroApi(403, 'PERMISSAO_NEGADA');
    return c.json({ dados: linhas[0][0] });
  });

  app.get('/paroquia/pessoas', async c => {
    const { linhas } = await comSessao(c, [{ text: 'select app.pessoas_da_paroquia(app.paroquia_atual()) as r' }], { exigirVinculo: true });
    if (linhas[0][0].r === null) throw new ErroApi(403, 'PERMISSAO_NEGADA');
    return c.json({ dados: linhas[0][0].r });
  });

  return app;
}

// =============================================================================
// Apoio
// =============================================================================
async function comSessao(c: Ctx, comandos: Comando[], opcoes: { permitirTrocaPendente?: boolean; exigirVinculo?: boolean } = {}) {
  const token = c.get('token');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) throw new ErroApi(401, 'SESSAO_INVALIDA');
  const resultado = await c.get('banco').transacao([{ text: 'select app.iniciar($1) as ctx', params: [token] }, ...comandos]);
  const ctx = resultado[0][0].ctx as Contexto;
  // O banco já não abre dados com a senha provisória; aqui a resposta fica clara para o app.
  if (ctx.trocaSenhaPendente && !opcoes.permitirTrocaPendente) throw new ErroApi(403, 'TROCA_SENHA_PENDENTE');
  if (opcoes.exigirVinculo && !vinculoAtivo(ctx)?.paroquiaId) throw new ErroApi(409, 'SEM_VINCULO');
  return { ctx, linhas: resultado.slice(1) };
}

function vinculoAtivo(ctx: Contexto) {
  return ctx.vinculos.find(v => v.id === ctx.vinculoAtivoId) ?? null;
}

function evento(c: Ctx, nome: string, detalhes: Record<string, unknown>): Comando {
  return {
    text: 'select app.registrar_evento($1, $2, $3, $4, $5, $6::jsonb)',
    params: [nome, 'SUCESSO', `${c.req.method} ${c.req.routePath}`, c.get('requestId'), Date.now() - c.get('inicio'), JSON.stringify(detalhes)]
  };
}

/** UPDATE só com os campos enviados. Nomes de colunas vêm do código, nunca da requisição. */
function atualizar(tabela: 'diocese' | 'paroquia', id: string | null, campos: Record<string, unknown>): Comando {
  const definidos = Object.entries(campos).filter(([, v]) => v !== undefined);
  if (!definidos.length) throw new ErroApi(400, 'DADOS_INVALIDOS', 'Nada para alterar.');
  const params: unknown[] = definidos.map(([, v]) => (v === '' ? null : v));
  const sets = definidos.map(([coluna], i) => `${coluna} = $${i + 1}`).join(', ');
  const onde = id ? `id = $${params.length + 1}` : 'id = app.paroquia_atual()';
  if (id) params.push(id);
  return { text: `update ${tabela} set ${sets} where ${onde} returning id`, params };
}

function registrarEmSegundoPlano(c: Ctx, evento: string, resultado: string, codigo: string) {
  const token = c.get('token');
  const comandos: Comando[] = [];
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    comandos.push({ text: `select set_config('app.sessao', encode(digest($1, 'sha256'), 'hex'), true)`, params: [token] });
  }
  comandos.push({
    text: 'select app.registrar_evento($1, $2, $3, $4, $5, $6::jsonb)',
    params: [evento, resultado, `${c.req.method} ${c.req.routePath}`, c.get('requestId'), Date.now() - c.get('inicio'), JSON.stringify({ codigo })]
  });
  const tarefa = c.get('banco').transacao(comandos).catch(() => {});
  try { c.executionCtx.waitUntil(tarefa); } catch { /* fora do Workers (testes): segue sem esperar */ }
}

async function lerJson(c: Ctx, opcional = false): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    if (opcional) return {};
    throw new ErroApi(400, 'DADOS_INVALIDOS', 'Envie os dados em JSON.');
  }
}

function validar<T>(_c: Ctx, dados: unknown, esquema: z.ZodType<T>): T {
  const r = esquema.safeParse(dados);
  if (r.success) return r.data;
  const campos: Record<string, string> = {};
  for (const problema of r.error.issues) campos[String(problema.path[0] ?? 'geral')] ??= problema.message;
  throw new ErroApi(400, 'DADOS_INVALIDOS', undefined, campos);
}

function uuid(valor: string) {
  if (!/^[0-9a-f-]{36}$/i.test(valor)) throw new ErroApi(404, 'NAO_ENCONTRADO');
  return valor;
}
