import { useEffect, useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { formatarCodigo, formatarCpf, identificadorValido } from '@katechesis/compartilhado';
import { Aviso, Campo } from '../componentes/basicos';
import { useSessao } from '../sessao';
import { ErroDaApi } from '../api';

/** Formata enquanto digita: só números vira CPF; começando com letras vira código de acesso. */
function formatarIdentificador(valor: string) {
  return /^[\d.\-\s]*$/.test(valor) ? formatarCpf(valor) : formatarCodigo(valor).slice(0, 13);
}

export function Entrar() {
  const { entrar, mensagemSaida } = useSessao();
  const [identificador, setIdentificador] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCampo, setErroCampo] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { document.title = 'Entrar · Katechesis'; }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!identificadorValido(identificador)) {
      setErroCampo('Informe um CPF válido ou o código de acesso (KAT-XXXX-XXXX).');
      return;
    }
    setErroCampo(undefined);
    setEnviando(true);
    try {
      await entrar(identificador, senha, lembrar);
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.message : 'Não foi possível entrar.');
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-entrada">
      <section className="entrada-identidade" aria-hidden="true">
        <img src="/icones/favicon.svg" alt="" width={56} height={56} style={{ borderRadius: 12 }} />
        <div>
          <h1>Katechesis</h1>
          <div className="fio-destaque" />
          <p>Organização da catequese para paróquias e dioceses: turmas, encontros, presença e famílias no mesmo lugar.</p>
        </div>
        <small style={{ color: 'var(--cor-menu-rotulo)' }}>Seus dados são protegidos conforme a LGPD.</small>
      </section>

      <section className="entrada-formulario">
        <form onSubmit={enviar} noValidate>
          <div className="marca-compacta">
            <img src="/icones/favicon.svg" alt="" />
            <strong>Katechesis</strong>
          </div>
          <h2>Entrar</h2>
          <p style={{ color: 'var(--cor-texto-suave)', marginBottom: 'var(--esp-5)' }}>Use seu CPF ou o código de acesso entregue pela paróquia.</p>
          {mensagemSaida && !erro && <Aviso tipo="info">{mensagemSaida}</Aviso>}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Campo rotulo="CPF ou código de acesso" value={identificador} autoComplete="username" inputMode="text"
            onChange={e => setIdentificador(formatarIdentificador(e.target.value))} erro={erroCampo}
            placeholder="000.000.000-00" required autoFocus />
          <Campo rotulo="Senha" type="password" value={senha} autoComplete="current-password"
            onChange={e => setSenha(e.target.value)} required />
          <label className="caixa-marcar" style={{ marginTop: 'var(--esp-3)' }}>
            <input type="checkbox" checked={lembrar} onChange={e => setLembrar(e.target.checked)} />
            Manter conectado neste aparelho
          </label>
          <p className="campo-ajuda">Use só no seu próprio celular ou computador.</p>
          <button className="botao botao-primario botao-largo" style={{ marginTop: 'var(--esp-5)' }} disabled={enviando || !senha}>
            <LogIn size={18} /> {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="campo-ajuda" style={{ marginTop: 'var(--esp-4)', textAlign: 'center' }}>
            Esqueceu a senha? Peça uma senha provisória à coordenação da sua paróquia.
          </p>
        </form>
      </section>
    </div>
  );
}
