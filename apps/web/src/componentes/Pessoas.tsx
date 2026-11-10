import { useState, type FormEvent } from 'react';
import { KeyRound, UserPlus, Users } from 'lucide-react';
import { PAPEIS_PAROQUIA, ROTULO_PAPEL, cpfValido, formatarCpf, type Papel } from '@katechesis/compartilhado';
import { Aviso, Campo, Janela, Selecao, SenhaUmaVez } from './basicos';
import { api, ErroDaApi } from '../api';

export interface Pessoa {
  contaId: string; nome: string; cpfFinal: string | null; trocaSenhaPendente: boolean; ultimoLogin: string | null; papeis: Papel[];
}

function quando(iso: string | null) {
  if (!iso) return 'Nunca entrou';
  return 'Último acesso em ' + new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Lista de pessoas de uma paróquia. Nunca mostra o CPF completo. `aoRedefinir` só para quem pode redefinir senha. */
export function ListaPessoas({ pessoas, aoRedefinir }: { pessoas: Pessoa[]; aoRedefinir?: (p: Pessoa) => void }) {
  if (!pessoas.length) {
    return <div className="estado-vazio"><Users size={36} aria-hidden="true" /><p>Ninguém vinculado ainda.</p></div>;
  }
  return (
    <ul className="lista">
      {pessoas.map(p => (
        <li key={p.contaId}>
          <div className="principal">
            <strong>{p.nome}</strong>
            <div className="secundario">CPF final {p.cpfFinal ?? '—'} · {quando(p.ultimoLogin)}</div>
          </div>
          {p.papeis.map(papel => <span key={papel} className="selo">{ROTULO_PAPEL[papel]}</span>)}
          {p.trocaSenhaPendente && <span className="selo selo-atencao">Senha provisória</span>}
          {aoRedefinir && (
            <button className="botao botao-texto" onClick={() => aoRedefinir(p)} title="Gerar nova senha provisória">
              <KeyRound size={18} aria-hidden="true" /> <span>Nova senha</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Formulário para dar um papel a uma pessoa (cria a conta pelo CPF, se ainda não existir). */
export function AdicionarPessoa({ caminho, papeis = PAPEIS_PAROQUIA, papelInicial = 'COORDENADOR_PAROQUIAL', aoFechar, aoSalvar }: {
  caminho: string; papeis?: readonly Papel[]; papelInicial?: Papel; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<string>(papelInicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [senha, setSenha] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!cpfValido(cpf)) { setErros({ cpf: 'CPF inválido.' }); return; }
    setEnviando(true); setErro(null); setErros({});
    try {
      const r = await api<{ senhaProvisoria: string | null }>('POST', caminho, { nome, cpf, email, papel });
      if (r.senhaProvisoria) setSenha(r.senhaProvisoria);
      else { setAviso('Esta pessoa já tinha conta no Katechesis. O papel foi adicionado e a senha dela não mudou.'); }
    } catch (f) {
      if (f instanceof ErroDaApi) { setErro(f.message); setErros(f.campos ?? {}); } else setErro('Não foi possível salvar.');
    } finally { setEnviando(false); }
  }

  if (senha) return <SenhaUmaVez nome={nome} senha={senha} aoFechar={aoSalvar} />;

  return (
    <Janela titulo="Adicionar pessoa" aoFechar={aoFechar}>
      {aviso ? (
        <>
          <Aviso tipo="sucesso">{aviso}</Aviso>
          <div className="acoes"><button className="botao botao-primario" onClick={aoSalvar}>Concluir</button></div>
        </>
      ) : (
        <form onSubmit={enviar} noValidate>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Campo rotulo="Nome completo" value={nome} onChange={e => setNome(e.target.value)} erro={erros.nome} maxLength={150} required />
          <Campo rotulo="CPF" value={cpf} inputMode="numeric" onChange={e => setCpf(formatarCpf(e.target.value))}
            erro={erros.cpf} placeholder="000.000.000-00" ajuda="Será o login da pessoa." required />
          <Campo rotulo="E-mail (opcional)" type="email" value={email} onChange={e => setEmail(e.target.value)}
            erro={erros.email} ajuda="Usado no futuro para recuperar a senha." />
          <div style={{ marginTop: 'var(--esp-4)' }}>
            <Selecao rotulo="Papel" valor={papel} aoMudar={setPapel} erro={erros.papel}
              opcoes={papeis.map(p => ({ valor: p, rotulo: ROTULO_PAPEL[p] }))} />
          </div>
          <div className="acoes">
            <button type="button" className="botao botao-secundario" onClick={aoFechar}>Cancelar</button>
            <button className="botao botao-primario" disabled={enviando || nome.trim().length < 2}>
              <UserPlus size={18} /> {enviando ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>
        </form>
      )}
    </Janela>
  );
}
