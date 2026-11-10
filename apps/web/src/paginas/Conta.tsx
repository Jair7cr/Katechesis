import { LogOut } from 'lucide-react';
import { ROTULO_PAPEL } from '@katechesis/compartilhado';
import { CabecalhoPagina } from '../componentes/basicos';
import { useSessao } from '../sessao';
import { FormularioSenha } from './TrocarSenha';

export function Conta() {
  const { contexto, sair, ehAdminMestre } = useSessao();
  if (!contexto) return null;
  return (
    <>
      <CabecalhoPagina titulo="Minha conta" subtitulo={contexto.nome} />
      <section className="cartao" aria-labelledby="vinculos">
        <h2 id="vinculos">Onde você atua</h2>
        <ul className="lista" style={{ marginTop: 'var(--esp-3)' }}>
          {ehAdminMestre && <li><span className="principal">Plataforma Katechesis</span><span className="selo">{ROTULO_PAPEL.ADMIN_MESTRE}</span></li>}
          {contexto.vinculos.map(v => (
            <li key={v.id}>
              <span className="principal">{v.nome}</span>
              {v.papeis.map(p => <span key={p} className="selo">{ROTULO_PAPEL[p]}</span>)}
            </li>
          ))}
          {!ehAdminMestre && contexto.vinculos.length === 0 && <li className="secundario">Nenhum vínculo ativo.</li>}
        </ul>
      </section>
      <section className="cartao" aria-labelledby="senha">
        <h2 id="senha" style={{ marginBottom: 'var(--esp-4)' }}>Trocar senha</h2>
        <FormularioSenha aoConcluir={() => {}} />
      </section>
      <section className="cartao">
        <div className="cartao-cabecalho" style={{ marginBottom: 0 }}>
          <div>
            <h2>Sair</h2>
            <p style={{ color: 'var(--cor-texto-suave)' }}>Encerra a sessão e desliga este aparelho, se ele estiver lembrado.</p>
          </div>
          <button className="botao botao-perigo" onClick={() => void sair()}><LogOut size={18} /> Sair</button>
        </div>
      </section>
    </>
  );
}
