/**
 * Estado da sessão no app: quem está logado, em qual vínculo atua e quais papéis tem ali.
 * O app só usa isso para MOSTRAR o que cabe a cada perfil; quem decide o acesso é o servidor.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Contexto, Papel, Vinculo } from '@katechesis/compartilhado';
import { api, armazenamento, definirAoPerderSessao } from './api';
import { aplicarTema } from './tema';

interface ValorSessao {
  carregando: boolean;
  contexto: Contexto | null;
  vinculoAtivo: Vinculo | null;
  mensagemSaida: string | null;
  entrar(identificador: string, senha: string, lembrar: boolean): Promise<void>;
  sair(): Promise<void>;
  recarregar(): Promise<void>;
  escolherVinculo(id: string): Promise<void>;
  temPapel(...papeis: Papel[]): boolean;
  ehAdminMestre: boolean;
}

const SessaoContexto = createContext<ValorSessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagemSaida, setMensagemSaida] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!armazenamento.token() && !armazenamento.chaveAparelho()) {
      setContexto(null);
      setCarregando(false);
      return;
    }
    try {
      setContexto(await api<Contexto>('GET', '/sessao'));
    } catch {
      setContexto(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    definirAoPerderSessao(() => {
      setContexto(null);
      setMensagemSaida('Sua sessão expirou. Entre novamente.');
    });
    void recarregar();
  }, [recarregar]);

  const vinculoAtivo = useMemo(
    () => contexto?.vinculos.find(v => v.id === contexto.vinculoAtivoId) ?? null,
    [contexto]
  );

  useEffect(() => aplicarTema(vinculoAtivo?.corIdentidade, vinculoAtivo?.corDestaque), [vinculoAtivo]);

  const valor: ValorSessao = {
    carregando,
    contexto,
    vinculoAtivo,
    mensagemSaida,
    async entrar(identificador, senha, lembrar) {
      const r = await api<{ token: string; chaveAparelho: string | null }>('POST', '/sessao/entrar', { identificador, senha, lembrar });
      armazenamento.guardar(r.token, lembrar, r.chaveAparelho);
      setMensagemSaida(null);
      setContexto(await api<Contexto>('GET', '/sessao'));
    },
    async sair() {
      try { await api('POST', '/sessao/sair', { chaveAparelho: armazenamento.chaveAparelho() ?? undefined }); } catch { /* sai mesmo assim */ }
      armazenamento.limpar();
      setContexto(null);
      setMensagemSaida(null);
    },
    recarregar,
    async escolherVinculo(id) {
      setContexto(await api<Contexto>('PUT', '/sessao/vinculo', { vinculoId: id }));
    },
    temPapel: (...papeis) => !!vinculoAtivo && papeis.some(p => vinculoAtivo.papeis.includes(p)),
    ehAdminMestre: contexto?.plataforma === 'ADMIN_MESTRE'
  };

  return <SessaoContexto.Provider value={valor}>{children}</SessaoContexto.Provider>;
}

export function useSessao() {
  const v = useContext(SessaoContexto);
  if (!v) throw new Error('useSessao fora do ProvedorSessao');
  return v;
}
