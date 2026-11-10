import { Link } from 'react-router-dom';
import { CalendarDays, Church, ClipboardCheck, HeartHandshake, Palette, Sparkles, Users } from 'lucide-react';
import { ROTULO_PAPEL } from '@katechesis/compartilhado';
import { CabecalhoPagina } from '../componentes/basicos';
import { useSessao } from '../sessao';

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Tela inicial por papel. Nesta fase mostra o que já existe e o que vem nas próximas fases. */
export function Inicio() {
  const { contexto, vinculoAtivo, ehAdminMestre, temPapel } = useSessao();
  const primeiroNome = contexto?.nome.split(' ')[0] ?? '';
  const papeis = vinculoAtivo?.papeis.map(p => ROTULO_PAPEL[p]).join(' · ');

  return (
    <>
      <CabecalhoPagina titulo={`${saudacao()}, ${primeiroNome}`}
        subtitulo={vinculoAtivo ? `${vinculoAtivo.nome} · ${papeis}` : ehAdminMestre ? 'Administração da plataforma' : undefined} />

      {ehAdminMestre && (
        <section className="cartao" aria-labelledby="plataforma">
          <h2 id="plataforma">Administração da plataforma</h2>
          <p className="secundario" style={{ color: 'var(--cor-texto-suave)', margin: '4px 0 var(--esp-4)' }}>
            Cadastre dioceses e paróquias e convide quem vai coordenar cada uma.
          </p>
          <div className="grade-cartoes">
            <Atalho para="/plataforma/paroquias" icone={Church} titulo="Paróquias" texto="Criar paróquias e convidar coordenadores." />
            <Atalho para="/plataforma/dioceses" icone={Sparkles} titulo="Dioceses" texto="Organizar as paróquias por diocese." />
          </div>
        </section>
      )}

      {temPapel('COORDENADOR_PAROQUIAL') && (
        <section className="cartao" aria-labelledby="coord">
          <h2 id="coord">Sua paróquia</h2>
          <div className="grade-cartoes" style={{ marginTop: 'var(--esp-4)' }}>
            <Atalho para="/paroquia/pessoas" icone={Users} titulo="Pessoas e acessos" texto="Quem tem acesso à paróquia e com qual papel." />
            <Atalho para="/paroquia/configuracao" icone={Palette} titulo="Configuração" texto="Nome, cidade e cores da paróquia." />
          </div>
        </section>
      )}

      {vinculoAtivo && (
        <section className="cartao" aria-labelledby="proximos">
          <h2 id="proximos">Chegando nas próximas fases</h2>
          <div className="grade-cartoes" style={{ marginTop: 'var(--esp-4)' }}>
            <EmBreve icone={Users} titulo="Pessoas e turmas" texto="Catequistas, famílias, catequizandos e matrícula." />
            <EmBreve icone={CalendarDays} titulo="Calendário e encontros" texto="Calendário litúrgico e preparo dos encontros." />
            <EmBreve icone={ClipboardCheck} titulo="Presença" texto="Chamada no celular, mesmo sem internet." />
            <EmBreve icone={HeartHandshake} titulo="Portal da Família" texto="Encontros, frequência e comunicados para as famílias." />
          </div>
        </section>
      )}

      {!vinculoAtivo && !ehAdminMestre && (
        <section className="cartao estado-vazio">
          <Church size={36} aria-hidden="true" />
          <p>Sua conta ainda não está ligada a nenhuma paróquia. Fale com a coordenação.</p>
        </section>
      )}
    </>
  );
}

function Atalho({ para, icone: Icone, titulo, texto }: { para: string; icone: typeof Users; titulo: string; texto: string }) {
  return (
    <Link to={para} className="cartao cartao-atalho">
      <span className="icone"><Icone size={20} aria-hidden="true" /></span>
      <h3>{titulo}</h3>
      <p className="secundario" style={{ color: 'var(--cor-texto-suave)', fontSize: '0.875rem' }}>{texto}</p>
    </Link>
  );
}

function EmBreve({ icone: Icone, titulo, texto }: { icone: typeof Users; titulo: string; texto: string }) {
  return (
    <div className="cartao cartao-atalho cartao-em-breve">
      <span className="icone"><Icone size={20} aria-hidden="true" /></span>
      <h3>{titulo} <span className="selo selo-neutro">Em breve</span></h3>
      <p style={{ color: 'var(--cor-texto-suave)', fontSize: '0.875rem' }}>{texto}</p>
    </div>
  );
}
