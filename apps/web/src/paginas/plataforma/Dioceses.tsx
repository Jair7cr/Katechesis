import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, Plus } from 'lucide-react';
import { UFS } from '@katechesis/compartilhado';
import { Aviso, CabecalhoPagina, Campo, Carregando, Janela, Selecao } from '../../componentes/basicos';
import { api, ErroDaApi } from '../../api';

interface Diocese { id: string; nome: string; cidade: string | null; uf: string | null; situacao: string; paroquias: number }

export function Dioceses() {
  const [lista, setLista] = useState<Diocese[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Diocese | 'nova' | null>(null);

  const carregar = useCallback(async () => {
    try { setLista(await api<Diocese[]>('GET', '/plataforma/dioceses')); }
    catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <>
      <CabecalhoPagina titulo="Dioceses" subtitulo="Dioceses que usam ou vão usar o Katechesis."
        acoes={<button className="botao botao-primario" onClick={() => setEditando('nova')}><Plus size={18} /> Nova diocese</button>} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <section className="cartao">
        {!lista ? <Carregando /> : lista.length === 0 ? (
          <div className="estado-vazio"><Building2 size={36} aria-hidden="true" /><p>Nenhuma diocese cadastrada.</p></div>
        ) : (
          <ul className="lista">
            {lista.map(d => (
              <li key={d.id}>
                <div className="principal">
                  <strong>{d.nome}</strong>
                  <div className="secundario">{[d.cidade, d.uf].filter(Boolean).join(' / ') || 'Sem cidade'} · {d.paroquias} paróquia(s)</div>
                </div>
                {d.situacao !== 'ATIVA' && <span className="selo selo-atencao">Inativa</span>}
                <button className="botao botao-secundario" onClick={() => setEditando(d)}>Editar</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editando && <FormularioDiocese diocese={editando === 'nova' ? null : editando}
        aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); void carregar(); }} />}
    </>
  );
}

function FormularioDiocese({ diocese, aoFechar, aoSalvar }: { diocese: Diocese | null; aoFechar: () => void; aoSalvar: () => void }) {
  const [nome, setNome] = useState(diocese?.nome ?? '');
  const [cidade, setCidade] = useState(diocese?.cidade ?? '');
  const [uf, setUf] = useState(diocese?.uf ?? '');
  const [ativa, setAtiva] = useState((diocese?.situacao ?? 'ATIVA') === 'ATIVA');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setErro(null); setErros({});
    const corpo = { nome, cidade: cidade || null, uf: uf || null, ...(diocese ? { situacao: ativa ? 'ATIVA' : 'INATIVA' } : {}) };
    try {
      if (diocese) await api('PATCH', `/plataforma/dioceses/${diocese.id}`, corpo);
      else await api('POST', '/plataforma/dioceses', corpo);
      aoSalvar();
    } catch (f) {
      if (f instanceof ErroDaApi) { setErro(f.message); setErros(f.campos ?? {}); } else setErro('Não foi possível salvar.');
    } finally { setEnviando(false); }
  }

  return (
    <Janela titulo={diocese ? 'Editar diocese' : 'Nova diocese'} aoFechar={aoFechar}>
      <form onSubmit={enviar} noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Campo rotulo="Nome" value={nome} onChange={e => setNome(e.target.value)} erro={erros.nome} required maxLength={150} />
        <div className="grade-campos" style={{ marginTop: 'var(--esp-4)' }}>
          <Campo rotulo="Cidade" value={cidade} onChange={e => setCidade(e.target.value)} erro={erros.cidade} maxLength={100} />
          <Selecao rotulo="UF" valor={uf} aoMudar={setUf} erro={erros.uf}
            opcoes={[{ valor: '', rotulo: '—' }, ...UFS.map(u => ({ valor: u, rotulo: u }))]} />
        </div>
        {diocese && (
          <label className="caixa-marcar" style={{ marginTop: 'var(--esp-3)' }}>
            <input type="checkbox" checked={ativa} onChange={e => setAtiva(e.target.checked)} /> Diocese ativa
          </label>
        )}
        <div className="acoes">
          <button type="button" className="botao botao-secundario" onClick={aoFechar}>Cancelar</button>
          <button className="botao botao-primario" disabled={enviando || nome.trim().length < 2}>{enviando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Janela>
  );
}
