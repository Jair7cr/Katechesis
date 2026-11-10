/**
 * Cliente da API. Guarda o token da sessão:
 *  - na aba (sessionStorage), por padrão;
 *  - no aparelho (localStorage), quando a pessoa marca "Manter conectado".
 * Se a sessão vencer e houver chave de aparelho lembrado, renova sozinho uma vez e repete o pedido.
 */
import { mensagemDeErro } from '@katechesis/compartilhado';

const CHAVE_TOKEN = 'katechesis.token';
const CHAVE_APARELHO = 'katechesis.aparelho';

export class ErroDaApi extends Error {
  constructor(public status: number, public codigo: string, mensagem: string, public campos?: Record<string, string>) {
    super(mensagem);
  }
}

function ler(chave: string) {
  try { return sessionStorage.getItem(chave) ?? localStorage.getItem(chave); } catch { return null; }
}

export const armazenamento = {
  token: () => ler(CHAVE_TOKEN),
  chaveAparelho: () => { try { return localStorage.getItem(CHAVE_APARELHO); } catch { return null; } },
  guardar(token: string, noAparelho: boolean, chaveAparelho?: string | null) {
    try {
      sessionStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(CHAVE_TOKEN);
      (noAparelho ? localStorage : sessionStorage).setItem(CHAVE_TOKEN, token);
      if (chaveAparelho) localStorage.setItem(CHAVE_APARELHO, chaveAparelho);
    } catch { /* navegador sem armazenamento: a sessão vale só enquanto a página estiver aberta */ }
  },
  trocarToken(token: string) {
    try {
      if (localStorage.getItem(CHAVE_TOKEN)) localStorage.setItem(CHAVE_TOKEN, token);
      else sessionStorage.setItem(CHAVE_TOKEN, token);
    } catch { /* ignora */ }
  },
  limpar() {
    try {
      sessionStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(CHAVE_APARELHO);
    } catch { /* ignora */ }
  }
};

let aoPerderSessao: () => void = () => {};
export function definirAoPerderSessao(fn: () => void) { aoPerderSessao = fn; }

async function bruto(metodo: string, caminho: string, corpo?: unknown) {
  const token = armazenamento.token();
  try {
    return await fetch('/api' + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
  } catch {
    throw new ErroDaApi(0, 'SEM_CONEXAO', mensagemDeErro('SEM_CONEXAO'));
  }
}

async function renovarPeloAparelho(): Promise<boolean> {
  const chave = armazenamento.chaveAparelho();
  if (!chave) return false;
  const r = await fetch('/api/sessao/renovar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chaveAparelho: chave })
  }).catch(() => null);
  if (!r?.ok) { armazenamento.limpar(); return false; }
  const { dados } = await r.json();
  armazenamento.trocarToken(dados.token);
  return true;
}

export async function api<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  let resposta = await bruto(metodo, caminho, corpo);
  if (resposta.status === 401 && !caminho.startsWith('/sessao/entrar') && armazenamento.token()) {
    if (await renovarPeloAparelho()) resposta = await bruto(metodo, caminho, corpo);
  }
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = json?.erro ?? {};
    const codigo = erro.codigo ?? 'ERRO_INTERNO';
    if (resposta.status === 401 && codigo === 'SESSAO_INVALIDA') {
      armazenamento.limpar();
      aoPerderSessao();
    }
    throw new ErroDaApi(resposta.status, codigo, erro.mensagem ?? mensagemDeErro(codigo), erro.campos);
  }
  return json.dados as T;
}
