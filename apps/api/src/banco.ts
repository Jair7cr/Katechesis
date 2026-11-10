/**
 * Acesso ao banco. A API só conversa com o Postgres por aqui.
 *
 * Em produção: driver HTTP do Neon (uma requisição por transação, sem conexão aberta — bom para o Workers).
 * Nos testes: um adaptador com `pg` implementa a mesma interface (testes/apoio/banco-pg.ts).
 *
 * Toda transação de um usuário logado começa com `app.iniciar(token)`, que valida a sessão
 * e fixa o contexto para as regras de isolamento (RLS) do banco.
 */
import { neon } from '@neondatabase/serverless';

export interface Comando {
  text: string;
  params?: unknown[];
}

export interface Banco {
  /** Executa os comandos numa única transação e devolve as linhas de cada um, na mesma ordem. */
  transacao(comandos: Comando[]): Promise<Record<string, any>[][]>;
}

export function bancoNeon(url: string): Banco {
  const sql = neon(url);
  return {
    async transacao(comandos) {
      const resultado = await sql.transaction(comandos.map(c => sql.query(c.text, c.params ?? [])));
      return resultado as Record<string, any>[][];
    }
  };
}

/** Erro vindo do banco, com o código do Postgres e a mensagem (nossas funções usam mensagens-código, como SESSAO_INVALIDA). */
export function lerErroDoBanco(erro: unknown): { codigoPg?: string; mensagem: string } {
  const e = erro as { code?: string; message?: string; sourceError?: { code?: string; message?: string } };
  return { codigoPg: e?.code ?? e?.sourceError?.code, mensagem: String(e?.message ?? e?.sourceError?.message ?? '') };
}
