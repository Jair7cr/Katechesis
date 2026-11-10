import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { validarSenha } from '@katechesis/compartilhado';
import { Aviso, Campo } from '../componentes/basicos';
import { api, ErroDaApi } from '../api';

/**
 * Troca de senha. Usada em dois lugares: obrigatória no primeiro acesso (senha provisória)
 * e em "Minha conta".
 */
export function FormularioSenha({ obrigatoria, aoConcluir }: { obrigatoria?: boolean; aoConcluir: () => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    const problemas: Record<string, string> = {};
    const politica = validarSenha(nova);
    if (politica) problemas.nova = politica;
    if (nova !== confirmacao) problemas.confirmacao = 'As senhas não conferem.';
    setErros(problemas);
    if (Object.keys(problemas).length) return;
    setEnviando(true);
    try {
      await api('POST', '/sessao/senha', { atual, nova });
      setAtual(''); setNova(''); setConfirmacao('');
      setOk(true);
      aoConcluir();
    } catch (falha) {
      if (falha instanceof ErroDaApi) {
        setErro(falha.message);
        if (falha.campos) setErros(falha.campos);
      } else setErro('Não foi possível trocar a senha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && !obrigatoria && <Aviso tipo="sucesso">Senha alterada. Seus outros aparelhos precisarão entrar de novo.</Aviso>}
      <div style={{ marginTop: erro || ok ? 'var(--esp-4)' : 0 }}>
        <Campo rotulo={obrigatoria ? 'Senha provisória' : 'Senha atual'} type="password" autoComplete="current-password"
          value={atual} onChange={e => setAtual(e.target.value)} erro={erros.atual} required />
        <Campo rotulo="Nova senha" type="password" autoComplete="new-password" value={nova}
          onChange={e => setNova(e.target.value)} erro={erros.nova}
          ajuda="Ao menos 8 caracteres, com letras e números. Não use partes do seu CPF." required />
        <Campo rotulo="Repita a nova senha" type="password" autoComplete="new-password" value={confirmacao}
          onChange={e => setConfirmacao(e.target.value)} erro={erros.confirmacao} required />
      </div>
      <div className="acoes">
        <button className="botao botao-primario" disabled={enviando || !atual || !nova}>
          <KeyRound size={18} /> {enviando ? 'Salvando…' : 'Trocar senha'}
        </button>
      </div>
    </form>
  );
}
