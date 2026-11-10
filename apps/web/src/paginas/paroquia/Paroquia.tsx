import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { UFS } from '@katechesis/compartilhado';
import { Aviso, CabecalhoPagina, Campo, Carregando, Selecao } from '../../componentes/basicos';
import { ListaPessoas, type Pessoa } from '../../componentes/Pessoas';
import { api, ErroDaApi } from '../../api';
import { useSessao } from '../../sessao';
import { aplicarTema } from '../../tema';

interface DadosParoquia { id: string; nome: string; cidade: string | null; uf: string | null; corIdentidade: string; corDestaque: string; dioceseNome: string | null }

export function PessoasDaMinhaParoquia() {
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { vinculoAtivo } = useSessao();
  useEffect(() => {
    setPessoas(null);
    api<Pessoa[]>('GET', '/paroquia/pessoas').then(setPessoas).catch(e => setErro((e as Error).message));
  }, [vinculoAtivo?.id]);
  return (
    <>
      <CabecalhoPagina titulo="Pessoas e acessos" subtitulo="Quem tem acesso à paróquia e com qual papel." />
      <Aviso tipo="info">O cadastro de catequistas, famílias e catequizandos chega na fase de Pessoas e grupos.</Aviso>
      <section className="cartao" style={{ marginTop: 'var(--esp-4)' }}>
        {erro ? <Aviso tipo="erro">{erro}</Aviso> : !pessoas ? <Carregando /> : <ListaPessoas pessoas={pessoas} />}
      </section>
    </>
  );
}

export function ConfiguracaoParoquia() {
  const { vinculoAtivo, recarregar } = useSessao();
  const [dados, setDados] = useState<DadosParoquia | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setDados(null);
    api<DadosParoquia>('GET', '/paroquia').then(setDados).catch(e => setErro((e as Error).message));
  }, [vinculoAtivo?.id]);

  // Prévia: a cor muda na tela enquanto escolhe.
  useEffect(() => { if (dados) aplicarTema(dados.corIdentidade, dados.corDestaque); }, [dados?.corIdentidade, dados?.corDestaque]);
  useEffect(() => () => aplicarTema(vinculoAtivo?.corIdentidade, vinculoAtivo?.corDestaque), [vinculoAtivo]);

  if (!dados) return erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando />;
  const mudar = (campo: keyof DadosParoquia) => (v: string) => setDados({ ...dados, [campo]: v });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!dados) return;
    setEnviando(true); setErro(null); setErros({}); setOk(false);
    try {
      await api('PATCH', '/paroquia', {
        nome: dados.nome, cidade: dados.cidade || null, uf: dados.uf || null,
        corIdentidade: dados.corIdentidade, corDestaque: dados.corDestaque
      });
      setOk(true);
      await recarregar();
    } catch (f) {
      if (f instanceof ErroDaApi) { setErro(f.message); setErros(f.campos ?? {}); } else setErro('Não foi possível salvar.');
    } finally { setEnviando(false); }
  }

  return (
    <>
      <CabecalhoPagina titulo="Configuração da paróquia" subtitulo={dados.dioceseNome ?? undefined} />
      <form className="cartao" onSubmit={enviar} noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {ok && <Aviso tipo="sucesso">Configuração salva.</Aviso>}
        <Campo rotulo="Nome da paróquia" value={dados.nome} onChange={e => mudar('nome')(e.target.value)} erro={erros.nome} maxLength={150} />
        <div className="grade-campos" style={{ marginTop: 'var(--esp-4)' }}>
          <Campo rotulo="Cidade" value={dados.cidade ?? ''} onChange={e => mudar('cidade')(e.target.value)} erro={erros.cidade} maxLength={100} />
          <Selecao rotulo="UF" valor={dados.uf ?? ''} aoMudar={mudar('uf')} opcoes={[{ valor: '', rotulo: '—' }, ...UFS.map(u => ({ valor: u, rotulo: u }))]} />
        </div>
        <h2 style={{ marginTop: 'var(--esp-5)' }}>Identidade visual</h2>
        <p className="campo-ajuda">A cor de identidade pinta a faixa do menu e a marca; a de destaque, os fios. Botões continuam no azul, para manter a leitura.</p>
        <div className="grade-campos" style={{ marginTop: 'var(--esp-3)' }}>
          <Campo rotulo="Cor de identidade" type="color" value={dados.corIdentidade} onChange={e => mudar('corIdentidade')(e.target.value)} erro={erros.corIdentidade} />
          <Campo rotulo="Cor de destaque" type="color" value={dados.corDestaque} onChange={e => mudar('corDestaque')(e.target.value)} erro={erros.corDestaque} />
        </div>
        <div className="acoes">
          <button className="botao botao-primario" disabled={enviando}><Save size={18} /> {enviando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </>
  );
}
