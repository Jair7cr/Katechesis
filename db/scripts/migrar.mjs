#!/usr/bin/env node
/**
 * Aplica as migrações de db/migracoes, em ordem, uma única vez cada.
 *
 * Variáveis de ambiente:
 *   DATABASE_URL_DONO   conexão com o papel dono do banco (no Neon: neondb_owner)
 *   API_DB_SENHA        (opcional) senha do papel katechesis_api; quando informada,
 *                       o papel é criado ou tem a senha atualizada.
 *
 * Cada migração roda numa transação. Se uma falhar, nada dela fica gravado e o script para.
 * Uma migração já aplicada nunca é alterada: mudanças entram como um arquivo novo.
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migracoes');

export async function migrar({ url = process.env.DATABASE_URL_DONO, senhaApi = process.env.API_DB_SENHA, log = console.log } = {}) {
  if (!url) throw new Error('Defina DATABASE_URL_DONO.');
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    await cliente.query(`create table if not exists migracao_aplicada (
      nome text primary key, resumo text not null, aplicada_em timestamptz not null default now())`);

    // Papel da API: sem ignorar RLS, sem herdar privilégios.
    const existe = (await cliente.query(`select 1 from pg_roles where rolname = 'katechesis_api'`)).rowCount > 0;
    if (!existe) {
      if (!senhaApi) throw new Error('O papel katechesis_api ainda não existe. Rode o workflow "Primeira configuração" (ou defina API_DB_SENHA).');
      await cliente.query(`create role katechesis_api login nobypassrls noinherit password ${literal(senhaApi)}`);
      log('Papel katechesis_api criado.');
    } else if (senhaApi) {
      await cliente.query(`alter role katechesis_api with login password ${literal(senhaApi)}`);
      log('Senha do papel katechesis_api atualizada.');
    }
    // Garantia: se este papel ignorasse RLS, o isolamento entre paróquias deixaria de valer.
    const { rows: [papelApi] } = await cliente.query(
      `select rolbypassrls, rolsuper from pg_roles where rolname = 'katechesis_api'`);
    if (papelApi.rolbypassrls || papelApi.rolsuper) {
      throw new Error('O papel katechesis_api não pode ignorar RLS nem ser superusuário. Crie-o pelo script, não pelo painel do Neon.');
    }

    const aplicadas = new Map((await cliente.query('select nome, resumo from migracao_aplicada')).rows.map(r => [r.nome, r.resumo]));
    const arquivos = (await readdir(pasta)).filter(n => /^\d{4}_.+\.sql$/.test(n)).sort();
    for (const nome of arquivos) {
      const sql = await readFile(path.join(pasta, nome), 'utf8');
      const resumo = createHash('sha256').update(sql).digest('hex');
      if (aplicadas.has(nome)) {
        if (aplicadas.get(nome) !== resumo) throw new Error(`A migração ${nome} foi alterada depois de aplicada. Crie um arquivo novo em vez de editar.`);
        continue;
      }
      log(`Aplicando ${nome}...`);
      await cliente.query('begin');
      try {
        await cliente.query(sql);
        await cliente.query('insert into migracao_aplicada (nome, resumo) values ($1, $2)', [nome, resumo]);
        await cliente.query('commit');
      } catch (erro) {
        await cliente.query('rollback');
        throw new Error(`Falha em ${nome}: ${erro.message}`);
      }
    }
    log('Banco atualizado.');
  } finally {
    await cliente.end();
  }
}

function literal(texto) {
  return `'${String(texto).replace(/'/g, "''")}'`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrar().catch(erro => { console.error(erro.message); process.exit(1); });
}
