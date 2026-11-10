import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Church, Plus, Users } from 'lucide-react';
import { UFS } from '@katechesis/compartilhado';
import { Aviso, CabecalhoPagina, Campo, Carregando, Confirmar, Janela, Selecao, SenhaUmaVez } from '../../componentes/basicos';
import { AdicionarPessoa, ListaPessoas, type Pessoa } from '../../componentes/Pessoas';
import { api, ErroDaApi } from '../../api';

interface Paroquia {
  id: string; nome: string; cidade: string | null; uf: string | null; situacao: string;
  dioceseId: string | null; dioceseNome: string | null; corIdentidade: string; corDestaque: string; pessoas: number;
}
interface Diocese { id: string; nome: string }

export function Paroquias() {
  const [lista, setLista] = useState<Paroquia[] | null>(null);
  const [dioceses, setDioceses] = useState<Diocese[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Paroquia | 'nova' | null>(null);
  const [pessoasDe, setPessoasDe] = useState<Paroquia | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([api<Paroquia[]>('GET', '/plataforma/paroquias'), api<Diocese[]>('GET', '/plataforma/dioceses')]);
      setLista(p); setDioceses(d);
    } catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <>
      <CabecalhoPagina titulo="Paróquias" subtitulo="Cada paróquia tem seus dados isolados das demais."
        acoes={<button className="botao botao-primario" onClick={() => setEditando('nova')}><Plus size={18} /> Nova paróquia</button>} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <section className="cartao">
        {!lista ? <Carregando /> : lista.length === 0 ? (
          <div className="estado-vazio"><Church size={36} aria-hidden="true" /><p>Nenhuma paróquia cadastrada. Comece pela primeira.</p></div>
        ) : (
          <ul className="lista">
            {lista.map(p => (
              <li key={p.id}>
                <span className="amostra-cor" style={{ background: p.corIdentidade }} aria-hidden="true" />
                <div className="principal">
                  <strong>{p.nome}</strong>
                  <div className="secundario">
                    {[p.cidade, p.uf].filter(Boolean).join(' / ') || 'Sem cidade'} · {p.dioceseNome ?? 'Sem diocese'} · {p.pessoas} pessoa(s)
                  </div>
                </div>
                {p.situacao !== 'ATIVA' && <span className="selo selo-atencao">Inativa</span>}
                <button className="botao botao-secundario" onClick={() => setPessoasDe(p)}><Users size={18} /> Pessoas</button>
                <button className="botao botao-texto" onClick={() => setEditando(p)}>Editar</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editando && <FormularioParoquia paroquia={editando === 'nova' ? null : editando} dioceses={dioceses}
        aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); void carregar(); }} />}
      {pessoasDe && <PessoasDaParoquia paroquia={pessoasDe} aoFechar={() => { setPessoasDe(null); void carregar(); }} />}
    </>
  );
}

function FormularioParoquia({ paroquia, dioceses, aoFechar, aoSalvar }: {
  paroquia: Paroquia | null; dioceses: Diocese[]; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [nome, setNome] = useState(paroquia?.nome ?? '');
  const [dioceseId, setDioceseId] = useState(paroquia?.dioceseId ?? '');
  const [cidade, setCidade] = useState(paroquia?.cidade ?? '');
  const [uf, setUf] = useState(paroquia?.uf ?? '');
  const [corIdentidade, setCorIdentidade] = useState(paroquia?.corIdentidade ?? '#7B1E3A');
  const [corDestaque, setCorDestaque] = useState(paroquia?.corDestaque ?? '#B8913F');
  const [ativa, setAtiva] = useState((paroquia?.situacao ?? 'ATIVA') === 'ATIVA');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setErro(null); setErros({});
    const corpo = {
      nome, dioceseId: dioceseId || null, cidade: cidade || null, uf: uf || null, corIdentidade, corDestaque,
      ...(paroquia ? { situacao: ativa ? 'ATIVA' : 'INATIVA' } : {})
    };
    try {
      if (paroquia) await api('PATCH', `/plataforma/paroquias/${paroquia.id}`, corpo);
      else await api('POST', '/plataforma/paroquias', corpo);
      aoSalvar();
    } catch (f) {
      if (f instanceof ErroDaApi) { setErro(f.message); setErros(f.campos ?? {}); } else setErro('Não foi possível salvar.');
    } finally { setEnviando(false); }
  }

  return (
    <Janela titulo={paroquia ? 'Editar paróquia' : 'Nova paróquia'} aoFechar={aoFechar}>
      <form onSubmit={enviar} noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Campo rotulo="Nome" value={nome} onChange={e => setNome(e.target.value)} erro={erros.nome} maxLength={150} required />
        <div style={{ marginTop: 'var(--esp-4)' }}>
          <Selecao rotulo="Diocese" valor={dioceseId} aoMudar={setDioceseId} erro={erros.dioceseId}
            opcoes={[{ valor: '', rotulo: 'Sem diocese' }, ...dioceses.map(d => ({ valor: d.id, rotulo: d.nome }))]} />
        </div>
        <div className="grade-campos" style={{ marginTop: 'var(--esp-4)' }}>
          <Campo rotulo="Cidade" value={cidade} onChange={e => setCidade(e.target.value)} erro={erros.cidade} maxLength={100} />
          <Selecao rotulo="UF" valor={uf} aoMudar={setUf} erro={erros.uf}
            opcoes={[{ valor: '', rotulo: '—' }, ...UFS.map(u => ({ valor: u, rotulo: u }))]} />
          <Campo rotulo="Cor de identidade" type="color" value={corIdentidade} onChange={e => setCorIdentidade(e.target.value)} />
          <Campo rotulo="Cor de destaque" type="color" value={corDestaque} onChange={e => setCorDestaque(e.target.value)} />
        </div>
        {paroquia && (
          <label className="caixa-marcar" style={{ marginTop: 'var(--esp-3)' }}>
            <input type="checkbox" checked={ativa} onChange={e => setAtiva(e.target.checked)} /> Paróquia ativa
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

function PessoasDaParoquia({ paroquia, aoFechar }: { paroquia: Paroquia; aoFechar: () => void }) {
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [redefinida, setRedefinida] = useState<{ nome: string; senha: string } | null>(null);
  const [confirmando, setConfirmando] = useState<Pessoa | null>(null);

  const carregar = useCallback(async () => {
    try { setPessoas(await api<Pessoa[]>('GET', `/plataforma/paroquias/${paroquia.id}/pessoas`)); }
    catch (e) { setErro((e as Error).message); }
  }, [paroquia.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function redefinir(p: Pessoa) {
    setConfirmando(null);
    try {
      const r = await api<{ senhaProvisoria: string }>('POST', `/plataforma/contas/${p.contaId}/redefinir-senha`);
      setRedefinida({ nome: p.nome, senha: r.senhaProvisoria });
      void carregar();
    } catch (e) { setErro((e as Error).message); }
  }

  if (adicionando) {
    return <AdicionarPessoa caminho={`/plataforma/paroquias/${paroquia.id}/pessoas`} aoFechar={() => setAdicionando(false)}
      aoSalvar={() => { setAdicionando(false); void carregar(); }} />;
  }
  if (redefinida) return <SenhaUmaVez nome={redefinida.nome} senha={redefinida.senha} aoFechar={() => setRedefinida(null)} />;
  if (confirmando) {
    return <Confirmar titulo="Gerar nova senha provisória" rotuloConfirmar="Gerar senha" perigo
      texto={<>A senha atual de <strong>{confirmando.nome}</strong> deixa de valer e ela precisará trocar a nova no próximo acesso.</>}
      aoConfirmar={() => void redefinir(confirmando)} aoCancelar={() => setConfirmando(null)} />;
  }

  return (
    <Janela titulo={`Pessoas · ${paroquia.nome}`} aoFechar={aoFechar}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!pessoas ? <Carregando /> : <ListaPessoas pessoas={pessoas} aoRedefinir={setConfirmando} />}
      <div className="acoes">
        <button className="botao botao-primario" onClick={() => setAdicionando(true)}><Plus size={18} /> Adicionar pessoa</button>
      </div>
    </Janela>
  );
}
