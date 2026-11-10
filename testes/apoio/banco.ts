/**
 * Banco de teste descartável: cria um banco novo, aplica as migrações como um dono
 * SEM superusuário (igual ao Neon) e devolve conexões como dono e como katechesis_api.
 *
 * PG_ADMIN_URL: conexão de superusuário do Postgres de teste (local ou serviço do CI).
 */
import pg from 'pg';
import { migrar } from '../../db/scripts/migrar.mjs';

const ADMIN_URL = process.env.PG_ADMIN_URL ?? 'postgres://postgres@localhost:5433/postgres?host=/tmp';
export const SENHA_API = 'senha-api-de-teste-123';

function urlCom(base: string, usuario: string, senha: string, banco: string) {
  const u = new URL(base);
  u.username = usuario;
  u.password = senha;
  u.pathname = '/' + banco;
  return u.toString();
}

export async function criarBancoDeTeste() {
  const nome = 'kat_t_' + Math.random().toString(36).slice(2, 10);
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'dono_teste') then
      create role dono_teste login createrole password 'dono_teste';
    end if; end $$`);
  await admin.query(`create database ${nome} owner dono_teste`);
  await admin.end();

  const urlDono = urlCom(ADMIN_URL, 'dono_teste', 'dono_teste', nome);
  const urlApi = urlCom(ADMIN_URL, 'katechesis_api', SENHA_API, nome);
  await migrar({ url: urlDono, senhaApi: SENHA_API, log: () => {} });

  return {
    nome, urlDono, urlApi,
    async encerrar() {
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${nome} with (force)`);
      await a.end();
    }
  };
}

export async function conectar(url: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Roda os comandos numa transação, como o driver HTTP do Neon faz. Devolve as linhas de cada um. */
export async function transacao(c: pg.Client, comandos: { text: string; params?: unknown[] }[]) {
  await c.query('begin');
  try {
    const saida: unknown[][] = [];
    for (const cmd of comandos) saida.push((await c.query(cmd.text, cmd.params ?? [])).rows);
    await c.query('commit');
    return saida;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}
