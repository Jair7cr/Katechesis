import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Church, LogOut } from 'lucide-react';
import { ROTULO_PAPEL } from '@katechesis/compartilhado';
import { ProvedorSessao, useSessao } from './sessao';
import { Casca } from './componentes/Casca';
import { Aviso, Carregando } from './componentes/basicos';
import { Entrar } from './paginas/Entrar';
import { FormularioSenha } from './paginas/TrocarSenha';
import { Inicio } from './paginas/Inicio';
import { Conta } from './paginas/Conta';
import { Dioceses } from './paginas/plataforma/Dioceses';
import { Paroquias } from './paginas/plataforma/Paroquias';
import { ConfiguracaoParoquia, PessoasDaMinhaParoquia } from './paginas/paroquia/Paroquia';

export function App() {
  return (
    <ProvedorSessao>
      <BrowserRouter>
        <Portao />
      </BrowserRouter>
    </ProvedorSessao>
  );
}

/** Decide o que mostrar: entrar, trocar senha provisória, escolher paróquia ou o sistema. */
function Portao() {
  const { carregando, contexto, vinculoAtivo, ehAdminMestre } = useSessao();
  if (carregando) return <Carregando texto="Abrindo o Katechesis…" />;
  if (!contexto) return <Entrar />;
  if (contexto.trocaSenhaPendente) return <TrocaObrigatoria />;
  if (!vinculoAtivo && contexto.vinculos.length > 1 && !ehAdminMestre) return <EscolherVinculo />;
  return (
    <Casca>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/conta" element={<Conta />} />
        <Route path="/plataforma/dioceses" element={<SoAdmin><Dioceses /></SoAdmin>} />
        <Route path="/plataforma/paroquias" element={<SoAdmin><Paroquias /></SoAdmin>} />
        <Route path="/paroquia/pessoas" element={<SoCoordenacao><PessoasDaMinhaParoquia /></SoCoordenacao>} />
        <Route path="/paroquia/configuracao" element={<SoCoordenacao><ConfiguracaoParoquia /></SoCoordenacao>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Casca>
  );
}

function SoAdmin({ children }: { children: ReactNode }) {
  const { ehAdminMestre } = useSessao();
  return ehAdminMestre ? <>{children}</> : <SemAcesso />;
}
function SoCoordenacao({ children }: { children: ReactNode }) {
  const { temPapel } = useSessao();
  return temPapel('COORDENADOR_PAROQUIAL') ? <>{children}</> : <SemAcesso />;
}
function SemAcesso() {
  return <Aviso tipo="atencao">Esta área não está disponível para o seu papel nesta paróquia.</Aviso>;
}

function TelaSimples({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="tela-entrada" style={{ gridTemplateColumns: '1fr' }}>
      <section className="entrada-formulario">
        <div className="caixa">
          <div className="marca-compacta" style={{ display: 'flex' }}>
            <img src="/icones/favicon.svg" alt="" />
            <strong>Katechesis</strong>
          </div>
          <h2>{titulo}</h2>
          {children}
        </div>
      </section>
    </div>
  );
}

function TrocaObrigatoria() {
  const { recarregar, sair, contexto } = useSessao();
  return (
    <TelaSimples titulo="Crie sua senha">
      <p style={{ color: 'var(--cor-texto-suave)', marginBottom: 'var(--esp-4)' }}>
        Olá, {contexto?.nome.split(' ')[0]}. Você entrou com uma senha provisória. Escolha uma senha só sua para continuar.
      </p>
      <FormularioSenha obrigatoria aoConcluir={() => void recarregar()} />
      <button className="botao botao-texto" style={{ marginTop: 'var(--esp-3)' }} onClick={() => void sair()}>
        <LogOut size={18} /> Sair
      </button>
    </TelaSimples>
  );
}

function EscolherVinculo() {
  const { contexto, escolherVinculo, sair } = useSessao();
  return (
    <TelaSimples titulo="Onde você vai atuar agora?">
      <p style={{ color: 'var(--cor-texto-suave)', marginBottom: 'var(--esp-4)' }}>Você pode trocar depois, pelo topo da tela.</p>
      <ul className="lista">
        {contexto?.vinculos.map(v => (
          <li key={v.id}>
            <button className="botao botao-secundario botao-largo" style={{ justifyContent: 'flex-start', height: 'auto', padding: 'var(--esp-3) var(--esp-4)' }}
              onClick={() => void escolherVinculo(v.id)}>
              <Church size={20} aria-hidden="true" />
              <span style={{ textAlign: 'left', whiteSpace: 'normal' }}>
                <strong style={{ display: 'block' }}>{v.nome}</strong>
                <small style={{ color: 'var(--cor-texto-suave)', fontWeight: 400 }}>{v.papeis.map(p => ROTULO_PAPEL[p]).join(', ')}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="botao botao-texto" style={{ marginTop: 'var(--esp-3)' }} onClick={() => void sair()}><LogOut size={18} /> Sair</button>
    </TelaSimples>
  );
}
