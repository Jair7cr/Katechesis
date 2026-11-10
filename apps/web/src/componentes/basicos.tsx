import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Info, X } from 'lucide-react';

export function CabecalhoPagina({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: string; acoes?: ReactNode }) {
  useEffect(() => { document.title = `${titulo} · Katechesis`; }, [titulo]);
  return (
    <header className="cabecalho-pagina">
      <div className="cartao-cabecalho" style={{ marginBottom: 0 }}>
        <div>
          <h1>{titulo}</h1>
          {subtitulo && <p>{subtitulo}</p>}
          <div className="fio-destaque" aria-hidden="true" />
        </div>
        {acoes}
      </div>
    </header>
  );
}

type TipoAviso = 'erro' | 'sucesso' | 'info' | 'atencao';
const ICONES = { erro: AlertTriangle, sucesso: CheckCircle2, info: Info, atencao: AlertTriangle };

export function Aviso({ tipo, children }: { tipo: TipoAviso; children: ReactNode }) {
  const Icone = ICONES[tipo];
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <Icone size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
  ajuda?: string;
  erro?: string;
}
export function Campo({ rotulo, ajuda, erro, ...resto }: PropsCampo) {
  const id = useId();
  const descricao = erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined;
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} aria-invalid={erro ? true : undefined} aria-describedby={descricao} {...resto} />
      {erro ? <span id={`${id}-erro`} className="campo-erro">{erro}</span>
        : ajuda ? <span id={`${id}-ajuda`} className="campo-ajuda">{ajuda}</span> : null}
    </div>
  );
}

export function Selecao({ rotulo, valor, aoMudar, opcoes, erro }: {
  rotulo: string; valor: string; aoMudar: (v: string) => void; opcoes: { valor: string; rotulo: string }[]; erro?: string;
}) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={e => aoMudar(e.target.value)} aria-invalid={erro ? true : undefined}>
        {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
      {erro && <span className="campo-erro">{erro}</span>}
    </div>
  );
}

/** Diálogo acessível: foco preso dentro, Esc fecha, foco volta para quem abriu. */
export function Janela({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const focaveis = () => ref.current?.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex]:not([tabindex="-1"])') ?? [];
    (focaveis()[1] ?? focaveis()[0])?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
      if (e.key !== 'Tab') return;
      const lista = Array.from(focaveis());
      if (!lista.length) return;
      const [primeiro, ultimo] = [lista[0], lista[lista.length - 1]];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('keydown', tecla); anterior?.focus(); };
  }, [aoFechar]);
  return (
    <div className="janela-fundo" onMouseDown={e => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="janela" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="janela-cabecalho">
          <h2 id={id}>{titulo}</h2>
          <button className="botao botao-texto" onClick={aoFechar} aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="janela-corpo">{children}</div>
      </div>
    </div>
  );
}

/** Senha provisória: aparece UMA vez, na tela de quem criou. */
export function SenhaUmaVez({ nome, senha, aoFechar }: { nome: string; senha: string; aoFechar: () => void }) {
  const [copiada, setCopiada] = useState(false);
  return (
    <Janela titulo="Senha provisória criada" aoFechar={aoFechar}>
      <p>Entregue esta senha a <strong>{nome}</strong>. Ela aparece só agora e precisa ser trocada no primeiro acesso.</p>
      <div className="senha-uma-vez" aria-label="Senha provisória">{senha}</div>
      <Aviso tipo="atencao">Não envie a senha pelo mesmo canal que o CPF. Prefira entregar pessoalmente.</Aviso>
      <div className="acoes">
        <button className="botao botao-secundario" onClick={async () => {
          try { await navigator.clipboard.writeText(senha); setCopiada(true); } catch { /* sem permissão */ }
        }}>
          <Copy size={18} /> {copiada ? 'Copiada' : 'Copiar'}
        </button>
        <button className="botao botao-primario" onClick={aoFechar}>Entendi</button>
      </div>
    </Janela>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando" role="status">{texto}</div>;
}

/** Confirmação própria (sem o confirm() do navegador, como no catequese-nsps). */
export function Confirmar({ titulo, texto, rotuloConfirmar, perigo, aoConfirmar, aoCancelar }: {
  titulo: string; texto: ReactNode; rotuloConfirmar: string; perigo?: boolean; aoConfirmar: () => void; aoCancelar: () => void;
}) {
  return (
    <Janela titulo={titulo} aoFechar={aoCancelar}>
      <p>{texto}</p>
      <div className="acoes">
        <button className="botao botao-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className={`botao ${perigo ? 'botao-perigo' : 'botao-primario'}`} onClick={aoConfirmar}>{rotuloConfirmar}</button>
      </div>
    </Janela>
  );
}
