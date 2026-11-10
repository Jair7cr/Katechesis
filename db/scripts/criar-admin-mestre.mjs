#!/usr/bin/env node
/**
 * Cria a conta do Administrador mestre (ou, se o CPF já tiver conta, dá a ela esse papel)
 * e gera uma senha provisória, que precisa ser trocada no primeiro acesso.
 *
 * Uso (pelo GitHub Actions, workflow "Criar administrador mestre"):
 *   DATABASE_URL_DONO=... ADMIN_NOME="..." ADMIN_CPF="..." node db/scripts/criar-admin-mestre.mjs
 *
 * Roda com o papel dono do banco: a API não tem permissão para isso.
 */
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function criarAdminMestre({ url = process.env.DATABASE_URL_DONO, nome = process.env.ADMIN_NOME, cpf = process.env.ADMIN_CPF } = {}) {
  if (!url) throw new Error('Defina DATABASE_URL_DONO.');
  const digitos = String(cpf || '').replace(/\D/g, '');
  if (!nome || String(nome).trim().length < 2) throw new Error('Informe o nome (ADMIN_NOME).');
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const { rows: [{ valido }] } = await cliente.query('select app.cpf_valido($1) as valido', [digitos]);
    if (!valido) throw new Error('CPF inválido.');
    await cliente.query('begin');
    const existente = await cliente.query('select id from conta where cpf = $1', [digitos]);
    let senha = null;
    if (existente.rowCount) {
      await cliente.query(`update conta set papel_plataforma = 'ADMIN_MESTRE', situacao = 'ATIVA' where id = $1`, [existente.rows[0].id]);
    } else {
      senha = (await cliente.query('select app.aleatorio(12) as s')).rows[0].s;
      await cliente.query(
        `insert into conta (nome, cpf, senha_hash, troca_senha_pendente, papel_plataforma)
         values ($1, $2, app.hash_senha($3), true, 'ADMIN_MESTRE')`, [String(nome).trim(), digitos, senha]);
    }
    await cliente.query(`insert into log_evento (evento, resultado, detalhes) values ('ADMIN_MESTRE_DEFINIDO', 'SUCESSO', $1)`,
      [{ contaNova: senha !== null, final: digitos.slice(-2) }]);
    await cliente.query('commit');
    return { senhaProvisoria: senha };
  } catch (erro) {
    await cliente.query('rollback').catch(() => {});
    throw erro;
  } finally {
    await cliente.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  criarAdminMestre().then(({ senhaProvisoria }) => {
    if (senhaProvisoria) {
      console.log('Conta criada. Senha provisória (troque no primeiro acesso):');
      console.log(senhaProvisoria);
    } else {
      console.log('A conta já existia e agora é Administrador mestre. A senha não mudou.');
    }
  }).catch(erro => { console.error(erro.message); process.exit(1); });
}
