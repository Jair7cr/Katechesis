/** Implementa a interface Banco da API com `pg`, para testar a API contra um Postgres local. */
import pg from 'pg';
import type { Banco } from '../../apps/api/src/banco';

export function bancoPg(url: string): Banco & { encerrar(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: 3 });
  return {
    async transacao(comandos) {
      const cliente = await pool.connect();
      try {
        await cliente.query('begin');
        const saida = [];
        for (const c of comandos) saida.push((await cliente.query(c.text, c.params ?? [])).rows);
        await cliente.query('commit');
        return saida;
      } catch (e) {
        await cliente.query('rollback');
        throw e;
      } finally {
        cliente.release();
      }
    },
    encerrar: () => pool.end()
  };
}
