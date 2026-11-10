/**
 * Testes da API ponta a ponta (rotas HTTP -> banco real), como o app a usa.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Pg from 'pg';
import { criarApp } from '../apps/api/src/app';
import { criarBancoDeTeste } from './apoio/banco';
import { bancoPg } from './apoio/banco-pg';
import { criarAdminMestre } from '../db/scripts/criar-admin-mestre.mjs';

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;
let pg: ReturnType<typeof bancoPg>;
let app: ReturnType<typeof criarApp>;

async function chamar(metodo: string, caminho: string, corpo?: unknown, token?: string) {
  const r = await app.request('/api' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  return { status: r.status, corpo: await r.json() as any, headers: r.headers };
}

let admin: string;
let paroquiaA: string, paroquiaB: string;

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  pg = bancoPg(banco.urlApi);
  app = criarApp(() => pg);
  const { senhaProvisoria } = await criarAdminMestre({ url: banco.urlDono, nome: 'Admin', cpf: '52998224725' });
  const r = await chamar('POST', '/sessao/entrar', { identificador: '529.982.247-25', senha: senhaProvisoria });
  admin = r.corpo.dados.token;
  await chamar('POST', '/sessao/senha', { atual: senhaProvisoria, nova: 'Katechesis2026' }, admin);
});

afterAll(async () => {
  await pg?.encerrar();
  await banco?.encerrar();
});

describe('API', () => {
  it('responde saúde e cabeçalhos de segurança', async () => {
    const r = await chamar('GET', '/saude');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('valida a entrada antes de ir ao banco', async () => {
    const r = await chamar('POST', '/sessao/entrar', { identificador: '123', senha: 'x' });
    expect(r.status).toBe(400);
    expect(r.corpo.erro.campos.identificador).toBeTruthy();
  });

  it('senha errada: 401 com mensagem em português', async () => {
    const r = await chamar('POST', '/sessao/entrar', { identificador: '52998224725', senha: 'errada123' });
    expect(r.status).toBe(401);
    expect(r.corpo.erro.mensagem).toMatch(/inválidos/);
  });

  it('sem token: 401; token inventado: 401', async () => {
    expect((await chamar('GET', '/sessao')).status).toBe(401);
    expect((await chamar('GET', '/sessao', undefined, 'ab'.repeat(32))).status).toBe(401);
  });

  it('admin cria diocese, paróquias e coordenador', async () => {
    const d = await chamar('POST', '/plataforma/dioceses', { nome: 'Diocese Teste', uf: 'PE' }, admin);
    expect(d.status).toBe(201);
    const a = await chamar('POST', '/plataforma/paroquias', { nome: 'Paróquia A', dioceseId: d.corpo.dados.id }, admin);
    const b = await chamar('POST', '/plataforma/paroquias', { nome: 'Paróquia B', dioceseId: d.corpo.dados.id }, admin);
    paroquiaA = a.corpo.dados.id; paroquiaB = b.corpo.dados.id;

    const lista = await chamar('GET', '/plataforma/paroquias', undefined, admin);
    expect(lista.corpo.dados.map((p: any) => p.nome)).toEqual(['Paróquia A', 'Paróquia B']);

    const ruim = await chamar('POST', `/plataforma/paroquias/${paroquiaA}/pessoas`,
      { nome: 'X', cpf: '11111111111', papel: 'COORDENADOR_PAROQUIAL' }, admin);
    expect(ruim.status).toBe(400);
    const papelErrado = await chamar('POST', `/plataforma/paroquias/${paroquiaA}/pessoas`,
      { nome: 'X', cpf: '11144477735', papel: 'COORDENADOR_DIOCESANO' }, admin);
    expect(papelErrado.status).toBe(400);
  });

  it('coordenador: senha provisória, troca, e só vê a própria paróquia', async () => {
    const v = await chamar('POST', `/plataforma/paroquias/${paroquiaA}/pessoas`,
      { nome: 'Maria', cpf: '111.444.777-35', email: 'maria@exemplo.org', papel: 'COORDENADOR_PAROQUIAL' }, admin);
    expect(v.status).toBe(201);
    const senha = v.corpo.dados.senhaProvisoria;

    const e = await chamar('POST', '/sessao/entrar', { identificador: '11144477735', senha });
    const token = e.corpo.dados.token;
    expect(e.corpo.dados.trocaSenhaPendente).toBe(true);

    // Antes de trocar a senha: bloqueado com código claro.
    const bloqueado = await chamar('GET', '/paroquia', undefined, token);
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.corpo.erro.codigo).toBe('TROCA_SENHA_PENDENTE');

    const fraca = await chamar('POST', '/sessao/senha', { atual: senha, nova: '11144477735abc' }, token);
    expect(fraca.status).toBe(400);
    expect((await chamar('POST', '/sessao/senha', { atual: senha, nova: 'Maria2026segura' }, token)).status).toBe(200);

    const p = await chamar('GET', '/paroquia', undefined, token);
    expect(p.status).toBe(200);
    expect(p.corpo.dados.nome).toBe('Paróquia A');
    expect(p.corpo.dados.papeis).toEqual(['COORDENADOR_PAROQUIAL']);

    // Área do administrador: negada.
    expect((await chamar('GET', '/plataforma/paroquias', undefined, token)).status).toBe(403);
    expect((await chamar('PATCH', `/plataforma/paroquias/${paroquiaB}`, { nome: 'Invadida' }, token)).status).toBe(403);

    // Configura cores da própria paróquia.
    const cor = await chamar('PATCH', '/paroquia', { corIdentidade: '#1F3B66' }, token);
    expect(cor.status).toBe(200);
    const invalida = await chamar('PATCH', '/paroquia', { corIdentidade: 'azul' }, token);
    expect(invalida.status).toBe(400);

    const pessoas = await chamar('GET', '/paroquia/pessoas', undefined, token);
    expect(pessoas.corpo.dados).toHaveLength(1);
    expect(JSON.stringify(pessoas.corpo)).not.toContain('11144477735');
  });

  it('o acesso negado fica registrado no log', async () => {
    await new Promise(r => setTimeout(r, 300));
    const dono = new Pg.Client({ connectionString: banco.urlDono });
    await dono.connect();
    const { rows } = await dono.query(`select count(*)::int as n from log_evento where evento = 'ACESSO_NEGADO' and conta_id is not null`);
    await dono.end();
    expect(rows[0].n).toBeGreaterThanOrEqual(2);
  });
});
