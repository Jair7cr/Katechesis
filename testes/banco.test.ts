/**
 * Testes do banco: login, sessão, bloqueio, troca de senha, vínculos e ISOLAMENTO entre paróquias.
 * Rodam contra um Postgres real, com o mesmo papel (katechesis_api) que a API usa em produção.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { conectar, criarBancoDeTeste, transacao } from './apoio/banco';
import { criarAdminMestre } from '../db/scripts/criar-admin-mestre.mjs';

type Banco = Awaited<ReturnType<typeof criarBancoDeTeste>>;
let banco: Banco;
let dono: pg.Client;
let api: pg.Client;

// CPFs válidos gerados para teste (não pertencem a ninguém).
const CPF_ADMIN = '52998224725';
const CPF_COORD = '11144477735';
const CPF_CATEQ = '12345678909';
const SENHA_NOVA = 'Catequese2026nova';

async function entrar(identificador: string, senha: string, lembrar = false) {
  const { rows } = await api.query('select app.entrar($1, $2, $3, $4) as r', [identificador, senha, lembrar, 'teste']);
  return rows[0].r as { ok: boolean; motivo?: string; token?: string; chaveAparelho?: string; trocaSenhaPendente?: boolean };
}

/** Executa comandos dentro do contexto de uma sessão (como a API faz a cada requisição). */
async function comSessao(token: string, comandos: { text: string; params?: unknown[] }[]) {
  const r = await transacao(api, [{ text: 'select app.iniciar($1) as ctx', params: [token] }, ...comandos]);
  return { ctx: (r[0][0] as any).ctx, linhas: r.slice(1) as any[][] };
}

async function trocarSenha(token: string, atual: string, nova = SENHA_NOVA) {
  const { linhas } = await comSessao(token, [{ text: 'select app.alterar_minha_senha($1, $2) as r', params: [atual, nova] }]);
  return linhas[0][0].r;
}

let tokenAdmin: string;
let p1: string, p2: string, diocese: string;
let senhaCoord: string;

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  dono = await conectar(banco.urlDono);
  api = await conectar(banco.urlApi);
});

afterAll(async () => {
  await api?.end();
  await dono?.end();
  await banco?.encerrar();
});

describe('Administrador mestre e senha provisória', () => {
  it('cria o admin, exige troca da senha e só então libera a administração', async () => {
    const { senhaProvisoria } = await criarAdminMestre({ url: banco.urlDono, nome: 'Admin Teste', cpf: CPF_ADMIN });
    expect(senhaProvisoria).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);

    const r = await entrar('529.982.247-25', senhaProvisoria!);
    expect(r.ok).toBe(true);
    expect(r.trocaSenhaPendente).toBe(true);

    // Com a troca pendente, nenhuma regra abre: nem a lista de dioceses.
    await expect(comSessao(r.token!, [{ text: `insert into diocese (nome) values ('X')` }])).rejects.toThrow();
    const antes = await comSessao(r.token!, [{ text: 'select app.plataforma_atual() as p' }]);
    expect(antes.linhas[0][0].p).toBeNull();

    expect(await trocarSenha(r.token!, senhaProvisoria!, 'curta')).toMatchObject({ ok: false, motivo: 'SENHA_FRACA' });
    expect(await trocarSenha(r.token!, senhaProvisoria!)).toMatchObject({ ok: true });

    const depois = await comSessao(r.token!, [{ text: 'select app.plataforma_atual() as p' }]);
    expect(depois.linhas[0][0].p).toBe('ADMIN_MESTRE');
    expect(depois.ctx.trocaSenhaPendente).toBe(false);
    tokenAdmin = r.token!;
  });

  it('cria diocese, duas paróquias e o coordenador com senha provisória', async () => {
    const { linhas } = await comSessao(tokenAdmin, [
      { text: `insert into diocese (nome, uf) values ('Diocese de Teste', 'PE') returning id` }
    ]);
    diocese = linhas[0][0].id;
    const r = await comSessao(tokenAdmin, [
      { text: `insert into paroquia (nome, diocese_id) values ('Paróquia A', $1) returning id`, params: [diocese] },
      { text: `insert into paroquia (nome, diocese_id) values ('Paróquia B', $1) returning id`, params: [diocese] }
    ]);
    p1 = r.linhas[0][0].id;
    p2 = r.linhas[1][0].id;

    const v = await comSessao(tokenAdmin, [{
      text: `select app.vincular_pessoa($1, null, 'COORDENADOR_PAROQUIAL', 'Maria Coordenadora', $2, 'maria@exemplo.org') as r`,
      params: [p1, CPF_COORD]
    }]);
    senhaCoord = v.linhas[0][0].r.senhaProvisoria;
    expect(senhaCoord).toHaveLength(12);

    // Mesmo CPF em outra paróquia: reaproveita a conta e NÃO gera nova senha.
    const v2 = await comSessao(tokenAdmin, [{
      text: `select app.vincular_pessoa($1, null, 'COORDENADOR_PAROQUIAL', 'Maria Coordenadora', $2) as r`,
      params: [p2, CPF_COORD]
    }]);
    expect(v2.linhas[0][0].r.contaId).toBe(v.linhas[0][0].r.contaId);
    expect(v2.linhas[0][0].r.senhaProvisoria).toBeNull();
  });

  it('recusa CPF inválido e papel incompatível com o escopo', async () => {
    await expect(comSessao(tokenAdmin, [{
      text: `select app.vincular_pessoa($1, null, 'CATEQUISTA_AUXILIAR', 'Fulano', '11111111111')`, params: [p1]
    }])).rejects.toThrow(/CPF_INVALIDO/);
    await expect(comSessao(tokenAdmin, [{
      text: `select app.vincular_pessoa(null, $1, 'CATEQUISTA_AUXILIAR', 'Fulano', $2)`, params: [diocese, CPF_CATEQ]
    }])).rejects.toThrow(/PAPEL_INVALIDO_PARA_ESCOPO/);
  });
});

describe('Login: bloqueio e limite', () => {
  it('CPF inexistente e senha errada dão a mesma resposta', async () => {
    expect(await entrar('98765432100', 'qualquer1')).toMatchObject({ ok: false, motivo: 'CREDENCIAIS' });
    expect(await entrar(CPF_COORD, 'errada123')).toMatchObject({ ok: false, motivo: 'CREDENCIAIS' });
  });

  it('5 senhas erradas bloqueiam por 15 minutos; depois, uma nova tentativa', async () => {
    for (let i = 0; i < 4; i++) await entrar(CPF_COORD, 'errada123');
    expect(await entrar(CPF_COORD, senhaCoord)).toMatchObject({ ok: false, motivo: 'BLOQUEADA' });
    const { rows } = await dono.query('select bloqueada_ate > now() + interval \'14 minutes\' as ok from conta where cpf = $1', [CPF_COORD]);
    expect(rows[0].ok).toBe(true);

    // Passado o prazo, a conta ganha UMA tentativa: errar trava de novo.
    await dono.query(`update conta set bloqueada_ate = now() - interval '1 minute' where cpf = $1`, [CPF_COORD]);
    await dono.query('delete from limite_tentativa');
    expect(await entrar(CPF_COORD, 'errada123')).toMatchObject({ ok: false, motivo: 'CREDENCIAIS' });
    expect(await entrar(CPF_COORD, senhaCoord)).toMatchObject({ ok: false, motivo: 'BLOQUEADA' });

    await dono.query(`update conta set bloqueada_ate = null, tentativas = 0 where cpf = $1`, [CPF_COORD]);
    await dono.query('delete from limite_tentativa');
  });

  it('mais de 10 tentativas com o mesmo CPF digitado são barradas antes de olhar a senha', async () => {
    for (let i = 0; i < 10; i++) await entrar('98765432100', 'x1234567');
    expect(await entrar('98765432100', 'x1234567')).toMatchObject({ ok: false, motivo: 'MUITAS_TENTATIVAS' });
    await dono.query('delete from limite_tentativa');
  });

  it('o log nunca guarda o CPF completo', async () => {
    const { rows } = await dono.query(`select detalhes::text as d from log_evento where detalhes is not null`);
    for (const r of rows) {
      expect(r.d).not.toContain(CPF_COORD);
      expect(r.d).not.toContain('98765432100');
    }
  });
});

describe('Vínculos e isolamento entre paróquias', () => {
  let tokenCoord: string;

  it('coordenador troca a senha e escolhe entre os dois vínculos', async () => {
    const r = await entrar(CPF_COORD, senhaCoord);
    expect(r.ok).toBe(true);
    expect(await trocarSenha(r.token!, senhaCoord)).toMatchObject({ ok: true });
    tokenCoord = r.token!;

    const { ctx } = await comSessao(tokenCoord, []);
    expect(ctx.vinculos).toHaveLength(2);
    expect(ctx.vinculoAtivoId).toBeNull(); // dois vínculos: precisa escolher
    const vA = ctx.vinculos.find((v: any) => v.paroquiaId === p1);
    const escolha = await comSessao(tokenCoord, [{ text: 'select app.escolher_vinculo($1) as c', params: [vA.id] }]);
    expect(escolha.linhas[0][0].c.vinculoAtivoId).toBe(vA.id);
  });

  it('na Paróquia A, enxerga só a Paróquia A', async () => {
    const { linhas } = await comSessao(tokenCoord, [
      { text: 'select id from paroquia' },
      { text: 'select id from paroquia where id = $1', params: [p2] }
    ]);
    expect(linhas[0].map((l: any) => l.id)).toEqual([p1]);
    expect(linhas[1]).toHaveLength(0);
  });

  it('não altera a Paróquia B e não muda a diocese da própria paróquia', async () => {
    const { linhas } = await comSessao(tokenCoord, [
      { text: `update paroquia set cor_identidade = '#000000' where id = $1 returning id`, params: [p2] },
      { text: `update paroquia set cor_identidade = '#123456' where id = $1 returning id`, params: [p1] }
    ]);
    expect(linhas[0]).toHaveLength(0); // B: nada alterado
    expect(linhas[1]).toHaveLength(1); // A: cor alterada
    await expect(comSessao(tokenCoord, [
      { text: `update paroquia set diocese_id = null where id = $1`, params: [p1] }
    ])).rejects.toThrow(/PERMISSAO_NEGADA/);
  });

  it('a troca de vínculo muda o que é visível', async () => {
    const { ctx } = await comSessao(tokenCoord, []);
    const vB = ctx.vinculos.find((v: any) => v.paroquiaId === p2);
    const { linhas } = await comSessao(tokenCoord, [
      { text: 'select app.escolher_vinculo($1)', params: [vB.id] },
      { text: 'select id from paroquia' }
    ]);
    expect(linhas[1].map((l: any) => l.id)).toEqual([p2]);
  });

  it('não lê pessoas de outra paróquia nem cria vínculos (só o Administrador mestre)', async () => {
    const { linhas } = await comSessao(tokenCoord, [
      { text: 'select app.pessoas_da_paroquia($1) as r', params: [p1] }  // vínculo ativo agora é B
    ]);
    expect(linhas[0][0].r).toBeNull();
    await expect(comSessao(tokenCoord, [{
      text: `select app.vincular_pessoa($1, null, 'CATEQUISTA_AUXILIAR', 'Fulano', $2)`, params: [p2, CPF_CATEQ]
    }])).rejects.toThrow(/PERMISSAO_NEGADA/);
  });

  it('a API nunca lê o hash da senha, as sessões nem as funções internas', async () => {
    await expect(comSessao(tokenCoord, [{ text: 'select senha_hash from conta' }])).rejects.toThrow(/permission denied/);
    await expect(comSessao(tokenCoord, [{ text: 'select count(*) from sessao' }])).rejects.toThrow(/permission denied/);
    await expect(comSessao(tokenCoord, [{ text: 'select count(*) from aparelho_lembrado' }])).rejects.toThrow(/permission denied/);
    await expect(api.query(`select app.hash_senha('x')`)).rejects.toThrow(/permission denied/);
    await expect(api.query(`select app.aleatorio(5)`)).rejects.toThrow(/permission denied/);
  });

  it('um token inventado não abre nada, nem forjando a configuração da sessão', async () => {
    await expect(comSessao('ab'.repeat(32), [])).rejects.toThrow(/SESSAO_INVALIDA/);
    const r = await transacao(api, [
      { text: `select set_config('app.sessao', $1, true)`, params: ['cd'.repeat(32)] },
      { text: 'select count(*)::int as n from paroquia' },
      { text: 'select count(*)::int as n from conta' }
    ]);
    expect((r[1][0] as any).n).toBe(0);
    expect((r[2][0] as any).n).toBe(0);
  });
});

describe('Sessão', () => {
  it('cai após 30 minutos sem uso e após 12 horas', async () => {
    const r = await entrar(CPF_COORD, SENHA_NOVA);
    await dono.query(`update sessao set ultimo_uso = now() - interval '31 minutes' where token_resumo = digest($1, 'sha256')`, [r.token]);
    await expect(comSessao(r.token!, [])).rejects.toThrow(/SESSAO_INVALIDA/);

    const r2 = await entrar(CPF_COORD, SENHA_NOVA);
    await dono.query(`update sessao set expira_em = now() - interval '1 second' where token_resumo = digest($1, 'sha256')`, [r2.token]);
    await expect(comSessao(r2.token!, [])).rejects.toThrow(/SESSAO_INVALIDA/);
  });

  it('trocar a senha derruba as outras sessões e mantém a atual', async () => {
    const a = await entrar(CPF_COORD, SENHA_NOVA);
    const b = await entrar(CPF_COORD, SENHA_NOVA);
    expect(await trocarSenha(a.token!, SENHA_NOVA, 'OutraSenha2026x')).toMatchObject({ ok: true });
    await expect(comSessao(b.token!, [])).rejects.toThrow(/SESSAO_INVALIDA/);
    await expect(comSessao(a.token!, [])).resolves.toBeTruthy();
  });

  it('sair encerra a sessão', async () => {
    const a = await entrar(CPF_COORD, 'OutraSenha2026x');
    await comSessao(a.token!, [{ text: 'select app.sair(null)' }]);
    await expect(comSessao(a.token!, [])).rejects.toThrow(/SESSAO_INVALIDA/);
  });
});

describe('Aparelho lembrado e código de acesso', () => {
  it('só catequista mantém o aparelho conectado, e a troca de senha cancela a chave', async () => {
    const v = await comSessao(tokenAdmin, [{
      text: `select app.vincular_pessoa($1, null, 'CATEQUISTA_RESPONSAVEL', 'João Catequista', $2) as r`, params: [p1, CPF_CATEQ]
    }]);
    const senha = v.linhas[0][0].r.senhaProvisoria;
    const primeira = await entrar(CPF_CATEQ, senha, true);
    expect(primeira.chaveAparelho).toBeNull(); // com senha provisória, não lembra
    await trocarSenha(primeira.token!, senha);

    const r = await entrar(CPF_CATEQ, SENHA_NOVA, true);
    expect(r.chaveAparelho).toMatch(/^[0-9a-f]{64}$/);
    const renovado = (await api.query('select app.renovar_por_aparelho($1) as r', [r.chaveAparelho])).rows[0].r;
    expect(renovado.ok).toBe(true);
    await expect(comSessao(renovado.token, [])).resolves.toBeTruthy();

    await trocarSenha(r.token!, SENHA_NOVA, 'Mudei2026senha');
    const depois = (await api.query('select app.renovar_por_aparelho($1) as r', [r.chaveAparelho])).rows[0].r;
    expect(depois.ok).toBe(false);

    // Coordenador (sem papel de catequista) não recebe chave.
    const c = await entrar(CPF_COORD, 'OutraSenha2026x', true);
    expect(c.chaveAparelho).toBeNull();
  });

  it('entra com código de acesso, com ou sem traços', async () => {
    await dono.query(`insert into conta (nome, codigo_acesso, senha_hash, troca_senha_pendente)
                      values ('Sem CPF', 'KATAB23CD45', app.hash_senha('Codigo2026ok'), false)`);
    expect(await entrar('kat-ab23-cd45', 'Codigo2026ok')).toMatchObject({ ok: true });
    expect(await entrar('KATAB23CD45', 'Codigo2026ok')).toMatchObject({ ok: true });
  });
});
