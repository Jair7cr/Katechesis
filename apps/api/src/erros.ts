import { mensagemDeErro } from '@katechesis/compartilhado';
import { lerErroDoBanco } from './banco';

export class ErroApi extends Error {
  constructor(public status: number, public codigo: string, mensagem?: string, public campos?: Record<string, string>) {
    super(mensagem ?? mensagemDeErro(codigo));
  }
}

const CODIGOS_DO_BANCO: Record<string, number> = {
  SESSAO_INVALIDA: 401,
  PERMISSAO_NEGADA: 403,
  VINCULO_INVALIDO: 400,
  CPF_INVALIDO: 400,
  PAPEL_INVALIDO_PARA_ESCOPO: 400,
  ESCOPO_INVALIDO: 400,
  PAROQUIA_NAO_ENCONTRADA: 404,
  DIOCESE_NAO_ENCONTRADA: 404,
  CONTA_NAO_ENCONTRADA: 404
};

/** Converte qualquer erro em resposta da API. Erros inesperados nunca expõem detalhes ao navegador. */
export function traduzirErro(erro: unknown): ErroApi {
  if (erro instanceof ErroApi) return erro;
  const { codigoPg, mensagem } = lerErroDoBanco(erro);
  const codigoNosso = Object.keys(CODIGOS_DO_BANCO).find(c => mensagem.includes(c));
  if (codigoNosso) return new ErroApi(CODIGOS_DO_BANCO[codigoNosso], codigoNosso);
  if (codigoPg === '42501') return new ErroApi(403, 'PERMISSAO_NEGADA');      // RLS / privilégio
  if (codigoPg === '23505') return new ErroApi(409, 'DUPLICADO');
  if (codigoPg === '23514' || codigoPg === '22P02' || codigoPg === '23502') return new ErroApi(400, 'DADOS_INVALIDOS');
  if (codigoPg === '23503') return new ErroApi(400, 'DADOS_INVALIDOS');
  return new ErroApi(500, 'ERRO_INTERNO');
}
