import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Menu as IconeMenu } from 'lucide-react';
import { ROTULO_PAPEL } from '@katechesis/compartilhado';
import { useSessao } from '../sessao';
import { itensVisiveis, ITENS_MENU } from '../menu';

/** Moldura do sistema logado: menu lateral (computador), gaveta e barra inferior (celular), topo com seletor de vínculo. */
export function Casca({ children }: { children: ReactNode }) {
  const { contexto, vinculoAtivo, temPapel, ehAdminMestre } = useSessao();
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();
  const itens = itensVisiveis(temPapel, ehAdminMestre);
  const grupos = Array.from(new Set(itens.map(i => i.grupo)));
  const atalhos = itens.filter(i => i.atalho).slice(0, 4);
  const tituloAtual = ITENS_MENU.find(i => i.caminho === local.pathname)?.rotulo ?? 'Katechesis';

  useEffect(() => setMenuAberto(false), [local.pathname]);
  useEffect(() => {
    if (!menuAberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAberto(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [menuAberto]);

  return (
    <div className={`casca${menuAberto ? ' menu-aberto' : ''}`}>
      <a href="#conteudo" className="so-leitor">Ir para o conteúdo</a>
      <aside className="menu-lateral" aria-label="Menu principal">
        <div className="menu-marca">
          <img src="/icones/favicon.svg" alt="" />
          <div>
            <strong>Katechesis</strong>
            <span>{vinculoAtivo?.nome ?? (ehAdminMestre ? 'Administração da plataforma' : '')}</span>
          </div>
        </div>
        <nav className="menu-navegacao">
          {grupos.map(g => (
            <div key={g} role="group" aria-label={g}>
              {g !== 'Início' && <p className="menu-rotulo">{g}</p>}
              {itens.filter(i => i.grupo === g).map(i => (
                <NavLink key={i.caminho} to={i.caminho} end className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}>
                  <i.icone size={18} aria-hidden="true" /> {i.rotulo}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="menu-rodape">{contexto?.nome}</div>
      </aside>
      <div className="fundo-menu" onClick={() => setMenuAberto(false)} aria-hidden="true" />

      <header className="topo">
        <button className="botao botao-texto botao-menu" onClick={() => setMenuAberto(v => !v)}
          aria-expanded={menuAberto} aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}>
          <IconeMenu size={22} />
        </button>
        <span className="titulo">{tituloAtual}</span>
        <SeletorVinculo />
      </header>

      <main id="conteudo" className="conteudo" tabIndex={-1}>{children}</main>

      <nav className="nav-inferior" aria-label="Atalhos" style={{ ['--colunas' as string]: atalhos.length }}>
        {atalhos.map(i => (
          <NavLink key={i.caminho} to={i.caminho} end className={({ isActive }) => (isActive ? 'ativo' : '')}>
            <i.icone size={20} aria-hidden="true" /> <span>{i.curto ?? i.rotulo}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SeletorVinculo() {
  const { contexto, vinculoAtivo, escolherVinculo } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  if (!contexto || contexto.vinculos.length === 0) return null;
  const papeis = vinculoAtivo?.papeis.map(p => ROTULO_PAPEL[p]).join(', ');

  return (
    <div className="seletor-vinculo" ref={ref}>
      <button className="botao botao-secundario" onClick={() => setAberto(v => !v)} aria-expanded={aberto} aria-haspopup="true"
        title={papeis}>
        <span className="faixa" aria-hidden="true" />
        <span className="nome">{vinculoAtivo?.nome ?? 'Escolher paróquia'}</span>
        {contexto.vinculos.length > 1 && <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {aberto && (
        <div className="menu-suspenso" role="menu">
          {erro && <p className="campo-erro">{erro}</p>}
          {contexto.vinculos.map(v => (
            <button key={v.id} role="menuitem" aria-current={v.id === vinculoAtivo?.id}
              onClick={async () => {
                try { await escolherVinculo(v.id); setAberto(false); } catch (e) { setErro((e as Error).message); }
              }}>
              <strong>{v.nome}</strong>
              <small>{v.papeis.map(p => ROTULO_PAPEL[p]).join(', ')}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
