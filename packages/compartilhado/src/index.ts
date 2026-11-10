/**
 * Regras e textos usados igualmente pela API e pelo app.
 * Regra que vale nos dois lados mora aqui, num lugar só (no catequese-nsps, Constants.gs fazia esse papel).
 */

// ---------------------------------------------------------------------------
// CPF e código de acesso
// ---------------------------------------------------------------------------
export function limparCpf(valor: string): string {
  return String(valor ?? '').replace(/\D/g, '');
}

export function cpfValido(valor: string): boolean {
  const d = limparCpf(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export function formatarCpf(valor: string): string {
  const d = limparCpf(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** Código de acesso de quem não tem CPF: KAT + 8 símbolos (sem 0/O/1/I). Exibido como KAT-XXXX-XXXX. */
export function normalizarCodigo(valor: string): string {
  return String(valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}
export function codigoValido(valor: string): boolean {
  return /^KAT[A-HJ-NP-Z2-9]{8}$/.test(normalizarCodigo(valor));
}
export function formatarCodigo(valor: string): string {
  const n = normalizarCodigo(valor);
  return n.length === 11 ? `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}` : n;
}

/** O que a pessoa digitou no campo de login: CPF (11 dígitos) ou código de acesso. */
export function identificadorValido(valor: string): boolean {
  const so = String(valor ?? '').replace(/[\s.\-]/g, '');
  return /^\d{11}$/.test(so) ? cpfValido(so) : codigoValido(so);
}

// ---------------------------------------------------------------------------
// Senha — mesma política do catequese-nsps, com o limite de 72 bytes do bcrypt
// ---------------------------------------------------------------------------
const SENHAS_FRACAS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', 'senha123', 'senha1234',
  'password', 'password1', 'qwertyui', 'mudar123', 'catequese', 'catequese123', 'katechesis', 'katechesis1'
]);

export function validarSenha(senha: string, cpf?: string | null): string | null {
  if (typeof senha !== 'string' || senha.length < 8) return 'A senha deve ter ao menos 8 caracteres.';
  if (new TextEncoder().encode(senha).length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return 'A senha deve ter letras e números.';
  if (/^(.)\1+$/.test(senha)) return 'A senha não pode repetir o mesmo caractere.';
  if (SENHAS_FRACAS.has(senha.toLowerCase())) return 'Esta senha é muito comum. Escolha outra.';
  const d = limparCpf(cpf ?? '');
  for (let i = 0; d.length >= 6 && i + 6 <= d.length; i++) {
    if (senha.includes(d.slice(i, i + 6))) return 'A senha não pode conter dígitos do seu CPF.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Papéis
// ---------------------------------------------------------------------------
export const PAPEIS = [
  'COORDENADOR_DIOCESANO',
  'RESPONSAVEL_FINANCEIRO',
  'COORDENADOR_PAROQUIAL',
  'CATEQUISTA_RESPONSAVEL',
  'CATEQUISTA_AUXILIAR',
  'RESPONSAVEL_FAMILIAR',
  'CATEQUIZANDO'
] as const;
export type Papel = (typeof PAPEIS)[number];

export const PAPEIS_DIOCESE: readonly Papel[] = ['COORDENADOR_DIOCESANO', 'RESPONSAVEL_FINANCEIRO'];
export const PAPEIS_PAROQUIA: readonly Papel[] = PAPEIS.filter(p => p !== 'COORDENADOR_DIOCESANO');

export type PapelPlataforma = 'ADMIN_MESTRE' | 'COLABORADOR';

export const ROTULO_PAPEL: Record<Papel | PapelPlataforma, string> = {
  ADMIN_MESTRE: 'Administrador mestre',
  COLABORADOR: 'Colaborador da plataforma',
  COORDENADOR_DIOCESANO: 'Coordenação diocesana',
  RESPONSAVEL_FINANCEIRO: 'Responsável financeiro',
  COORDENADOR_PAROQUIAL: 'Coordenação paroquial',
  CATEQUISTA_RESPONSAVEL: 'Catequista responsável',
  CATEQUISTA_AUXILIAR: 'Catequista auxiliar',
  RESPONSAVEL_FAMILIAR: 'Responsável familiar',
  CATEQUIZANDO: 'Catequizando'
};

// ---------------------------------------------------------------------------
// Contexto da sessão (o que GET /api/sessao devolve)
// ---------------------------------------------------------------------------
export interface Vinculo {
  id: string;
  paroquiaId: string | null;
  dioceseId: string | null;
  nome: string;
  tipo: 'PAROQUIA' | 'DIOCESE';
  corIdentidade: string | null;
  corDestaque: string | null;
  papeis: Papel[];
}

export interface Contexto {
  contaId: string;
  nome: string;
  trocaSenhaPendente: boolean;
  plataforma: PapelPlataforma | null;
  vinculoAtivoId: string | null;
  vinculos: Vinculo[];
}

// ---------------------------------------------------------------------------
// Cores e UF
// ---------------------------------------------------------------------------
export const corValida = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
  'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

// ---------------------------------------------------------------------------
// Erros: código devolvido pela API -> mensagem para a pessoa
// ---------------------------------------------------------------------------
export const MENSAGENS_ERRO: Record<string, string> = {
  CREDENCIAIS: 'CPF, código ou senha inválidos.',
  BLOQUEADA: 'Conta bloqueada por excesso de tentativas. Tente de novo em 15 minutos ou fale com a coordenação.',
  MUITAS_TENTATIVAS: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  APARELHO_INVALIDO: 'Este aparelho precisa entrar de novo com CPF e senha.',
  SESSAO_INVALIDA: 'Sua sessão expirou. Entre novamente.',
  TROCA_SENHA_PENDENTE: 'Troque sua senha provisória para continuar.',
  SENHA_ATUAL_INCORRETA: 'A senha atual está incorreta.',
  SENHA_FRACA: 'A nova senha não atende às regras.',
  SENHA_IGUAL: 'A nova senha deve ser diferente da atual.',
  PERMISSAO_NEGADA: 'Você não tem permissão para esta ação.',
  VINCULO_INVALIDO: 'Vínculo não encontrado.',
  CPF_INVALIDO: 'CPF inválido.',
  PAPEL_INVALIDO_PARA_ESCOPO: 'Este papel não se aplica a esse lugar.',
  PAROQUIA_NAO_ENCONTRADA: 'Paróquia não encontrada.',
  DIOCESE_NAO_ENCONTRADA: 'Diocese não encontrada.',
  CONTA_NAO_ENCONTRADA: 'Conta não encontrada.',
  NAO_ENCONTRADO: 'Registro não encontrado.',
  DADOS_INVALIDOS: 'Confira os dados informados.',
  DUPLICADO: 'Já existe um registro com esses dados.',
  SEM_VINCULO: 'Escolha a paróquia em que você quer atuar.',
  SEM_CONEXAO: 'Sem conexão com o servidor. Verifique a internet.',
  ERRO_INTERNO: 'Algo deu errado do nosso lado. Tente novamente em instantes.'
};

export function mensagemDeErro(codigo: string | undefined): string {
  return (codigo && MENSAGENS_ERRO[codigo]) || MENSAGENS_ERRO.ERRO_INTERNO;
}
