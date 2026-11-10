-- =============================================================================
-- Katechesis — Fase 2 (Fundação) — migração 0001
-- Estrutura institucional, contas, vínculos, sessões, log e isolamento por paróquia.
--
-- Princípios (herdados do catequese-nsps e do plano):
--   * Uma conta por pessoa (CPF ou código de acesso); vários vínculos, cada um com seus papéis.
--   * A paróquia é a fronteira de isolamento. A API usa o papel de banco `katechesis_api`,
--     que NÃO ignora as regras de RLS. O contexto (quem está pedindo) é lido da SESSÃO gravada
--     no banco, nunca de valores enviados pela API: sem um token válido, nenhuma regra abre.
--   * Senhas com bcrypt (pgcrypto), calculado no banco — o Worker não gasta CPU com isso.
--   * Tokens e chaves só são guardados como resumo SHA-256.
-- =============================================================================

create extension if not exists pgcrypto;
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type papel as enum (
  'COORDENADOR_DIOCESANO',
  'RESPONSAVEL_FINANCEIRO',
  'COORDENADOR_PAROQUIAL',
  'CATEQUISTA_RESPONSAVEL',
  'CATEQUISTA_AUXILIAR',
  'RESPONSAVEL_FAMILIAR',
  'CATEQUIZANDO'
);

create type papel_plataforma as enum ('ADMIN_MESTRE', 'COLABORADOR');

-- ---------------------------------------------------------------------------
-- Estrutura institucional
-- ---------------------------------------------------------------------------
create table diocese (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (char_length(btrim(nome)) between 2 and 150),
  cidade        text check (cidade is null or char_length(cidade) <= 100),
  uf            char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
  situacao      text not null default 'ATIVA' check (situacao in ('ATIVA', 'INATIVA')),
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz,
  atualizado_por uuid
);

create table paroquia (
  id             uuid primary key default gen_random_uuid(),
  diocese_id     uuid references diocese(id),
  nome           text not null check (char_length(btrim(nome)) between 2 and 150),
  cidade         text check (cidade is null or char_length(cidade) <= 100),
  uf             char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
  -- Identidade visual da paróquia (no catequese-nsps: "Cor de identidade" e "Cor de destaque").
  -- Botões e links continuam no azul fixo do produto, para garantir contraste.
  cor_identidade text not null default '#7B1E3A' check (cor_identidade ~ '^#[0-9A-Fa-f]{6}$'),
  cor_destaque   text not null default '#B8913F' check (cor_destaque ~ '^#[0-9A-Fa-f]{6}$'),
  situacao       text not null default 'ATIVA' check (situacao in ('ATIVA', 'INATIVA')),
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  atualizado_em  timestamptz,
  atualizado_por uuid
);
create index paroquia_diocese_idx on paroquia (diocese_id);

-- ---------------------------------------------------------------------------
-- Contas e vínculos
-- ---------------------------------------------------------------------------
create table conta (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null check (char_length(btrim(nome)) between 2 and 150),
  -- Login: CPF (só dígitos) ou, para quem não tem CPF, código de acesso gerado pela paróquia.
  cpf                   char(11) unique check (cpf is null or cpf ~ '^[0-9]{11}$'),
  codigo_acesso         text unique check (codigo_acesso is null or codigo_acesso ~ '^KAT[A-Z2-9]{8}$'),
  email                 text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  senha_hash            text not null,
  troca_senha_pendente  boolean not null default true,
  senha_alterada_em     timestamptz not null default now(),  -- versão da senha: sessões antigas caem quando muda
  tentativas            integer not null default 0,
  bloqueada_ate         timestamptz,
  ultimo_login          timestamptz,
  papel_plataforma      papel_plataforma,
  situacao              text not null default 'ATIVA' check (situacao in ('ATIVA', 'INATIVA')),
  criado_em             timestamptz not null default now(),
  criado_por            uuid,
  atualizado_em         timestamptz,
  atualizado_por        uuid,
  constraint conta_tem_login check (cpf is not null or codigo_acesso is not null)
);

create table vinculo (
  id                   uuid primary key default gen_random_uuid(),
  conta_id             uuid not null references conta(id),
  paroquia_id          uuid references paroquia(id),
  diocese_id           uuid references diocese(id),
  situacao             text not null default 'ATIVO' check (situacao in ('ATIVO', 'ENCERRADO')),
  motivo_encerramento  text,
  inicio               timestamptz not null default now(),
  fim                  timestamptz,
  criado_por           uuid,
  constraint vinculo_um_escopo check (num_nonnulls(paroquia_id, diocese_id) = 1)
);
create unique index vinculo_paroquia_ativo_uq on vinculo (conta_id, paroquia_id) where situacao = 'ATIVO' and paroquia_id is not null;
create unique index vinculo_diocese_ativo_uq on vinculo (conta_id, diocese_id) where situacao = 'ATIVO' and diocese_id is not null;
create index vinculo_paroquia_idx on vinculo (paroquia_id);
create index vinculo_conta_idx on vinculo (conta_id);

create table vinculo_papel (
  vinculo_id  uuid not null references vinculo(id) on delete cascade,
  papel       papel not null,
  criado_em   timestamptz not null default now(),
  criado_por  uuid,
  primary key (vinculo_id, papel)
);

-- Papéis que fazem sentido em cada escopo.
create function app.papel_combina_com_escopo(p papel, eh_diocese boolean)
returns boolean language sql immutable as $$
  select case when eh_diocese
    then p in ('COORDENADOR_DIOCESANO', 'RESPONSAVEL_FINANCEIRO')
    else p <> 'COORDENADOR_DIOCESANO'
  end
$$;

create function app.vinculo_papel_valida() returns trigger language plpgsql as $$
declare v_eh_diocese boolean;
begin
  select diocese_id is not null into v_eh_diocese from vinculo where id = new.vinculo_id;
  if not app.papel_combina_com_escopo(new.papel, v_eh_diocese) then
    raise exception 'PAPEL_INVALIDO_PARA_ESCOPO' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger vinculo_papel_valida before insert or update on vinculo_papel
  for each row execute function app.vinculo_papel_valida();

-- ---------------------------------------------------------------------------
-- Sessões, aparelhos lembrados, limites e sincronização (só acessíveis por funções)
-- ---------------------------------------------------------------------------
create table sessao (
  id             uuid primary key default gen_random_uuid(),
  conta_id       uuid not null references conta(id),
  token_resumo   bytea not null unique,
  vinculo_id     uuid references vinculo(id),
  origem         text not null default 'SENHA' check (origem in ('SENHA', 'APARELHO')),
  senha_versao   timestamptz not null,
  criada_em      timestamptz not null default now(),
  ultimo_uso     timestamptz not null default now(),
  expira_em      timestamptz not null,           -- teto absoluto (12 h)
  encerrada_em   timestamptz
);
create index sessao_conta_idx on sessao (conta_id);

create table aparelho_lembrado (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references conta(id),
  chave_resumo  bytea not null unique,
  senha_versao  timestamptz not null,
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  ultimo_uso    timestamptz,
  cancelado_em  timestamptz
);
create index aparelho_conta_idx on aparelho_lembrado (conta_id);

create table limite_tentativa (
  chave        text primary key,
  contagem     integer not null,
  janela_fim   timestamptz not null
);

-- Chave contra envio duplicado (uso a partir da fase de presença offline).
create table operacao_sincronizacao (
  chave       text primary key check (char_length(chave) between 16 and 100),
  conta_id    uuid not null references conta(id),
  operacao    text not null,
  situacao    text not null check (situacao in ('EM_ANDAMENTO', 'CONCLUIDA', 'FALHOU')),
  resposta    jsonb,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Log de eventos (nunca guarda CPF completo nem senha)
-- ---------------------------------------------------------------------------
create table log_evento (
  id           bigint generated always as identity primary key,
  quando       timestamptz not null default now(),
  evento       text not null,
  conta_id     uuid,
  paroquia_id  uuid,
  papeis       text,
  operacao     text,
  resultado    text check (resultado is null or resultado in ('SUCESSO', 'NEGADO', 'FALHA', 'ERRO')),
  request_id   text,
  duracao_ms   integer,
  detalhes     jsonb
);
create index log_evento_quando_idx on log_evento (quando desc);
create index log_evento_paroquia_idx on log_evento (paroquia_id, quando desc);

-- =============================================================================
-- Constantes (num só lugar, como no Constants.gs do catequese-nsps)
-- =============================================================================
create function app.cfg(chave text) returns integer language sql immutable as $$
  select case chave
    when 'SESSAO_INATIVIDADE_MIN'   then 30      -- RN-002
    when 'SESSAO_TETO_HORAS'        then 12
    when 'APARELHO_DIAS'            then 30
    when 'APARELHOS_POR_CONTA'      then 5
    when 'TENTATIVAS_MAX'           then 5
    when 'BLOQUEIO_MIN'             then 15
    when 'LOGIN_JANELA_MAX'         then 10      -- tentativas por identificador digitado
    when 'LOGIN_JANELA_MIN'         then 10
    when 'BCRYPT_CUSTO'             then 10
    when 'ATUALIZA_USO_SEGUNDOS'    then 60
  end
$$;

-- =============================================================================
-- Utilitários
-- =============================================================================
create function app.resumo(t text) returns bytea language sql immutable as $$
  select digest(t, 'sha256')
$$;

create function app.cpf_valido(p text) returns boolean language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
  s int; r int; i int;
begin
  if char_length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

-- Texto aleatório no alfabeto sem 0/O/1/I (32 símbolos: 256 é múltiplo de 32, sem viés).
create function app.aleatorio(n int) returns text language plpgsql volatile as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := gen_random_bytes(n);
  saida text := '';
  i int;
begin
  for i in 0..n - 1 loop
    saida := saida || substr(alfabeto, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return saida;
end $$;

create function app.hash_senha(p text) returns text language sql volatile as $$
  select crypt(p, gen_salt('bf', app.cfg('BCRYPT_CUSTO')))
$$;

-- Política mínima repetida no banco (a política completa está em packages/compartilhado).
create function app.senha_aceitavel(p text) returns boolean language sql immutable as $$
  select p is not null and char_length(p) >= 8 and octet_length(p) <= 72
     and p ~ '[A-Za-zÀ-ÿ]' and p ~ '[0-9]'
$$;

-- Identificador digitado no login: 11 dígitos = CPF; senão, código de acesso normalizado.
create function app.normalizar_identificador(p text, out cpf text, out codigo text) language plpgsql immutable as $$
declare t text := upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  if t ~ '^[0-9]{11}$' then cpf := t;
  elsif t ~ '^KAT[A-Z2-9]{8}$' then codigo := t;
  end if;
end $$;

create function app.limite_atingido(p_chave text) returns boolean language sql stable as $$
  select exists (select 1 from limite_tentativa
                 where chave = p_chave and janela_fim > now() and contagem >= app.cfg('LOGIN_JANELA_MAX'))
$$;

create function app.limite_registrar(p_chave text) returns void language sql volatile as $$
  insert into limite_tentativa as l (chave, contagem, janela_fim)
  values (p_chave, 1, now() + make_interval(mins => app.cfg('LOGIN_JANELA_MIN')))
  on conflict (chave) do update set
    contagem   = case when l.janela_fim > now() then l.contagem + 1 else 1 end,
    janela_fim = case when l.janela_fim > now() then l.janela_fim else excluded.janela_fim end
$$;

-- =============================================================================
-- Contexto da requisição
-- A API chama app.iniciar(token) no começo de cada transação. Ela valida a sessão e
-- grava só o RESUMO do token numa configuração local da transação. Todas as funções
-- de contexto abaixo releem a sessão no banco a partir desse resumo — por isso,
-- quem não tem um token válido não consegue "se passar" por outra pessoa.
-- =============================================================================
create function app._sessao_atual()
returns table (sessao_id uuid, conta_id uuid, vinculo_id uuid, paroquia_id uuid, diocese_id uuid,
               plataforma papel_plataforma, troca_pendente boolean)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select s.id, c.id, v.id, v.paroquia_id, v.diocese_id, c.papel_plataforma, c.troca_senha_pendente
  from sessao s
  join conta c on c.id = s.conta_id and c.situacao = 'ATIVA' and c.senha_alterada_em = s.senha_versao
  left join vinculo v on v.id = s.vinculo_id and v.situacao = 'ATIVO' and v.conta_id = c.id
  where s.token_resumo = decode(nullif(current_setting('app.sessao', true), ''), 'hex')
    and s.encerrada_em is null
    and s.expira_em > now()
    and s.ultimo_uso > now() - make_interval(mins => app.cfg('SESSAO_INATIVIDADE_MIN'))
$$;

-- Enquanto a senha provisória não for trocada, o contexto não abre nenhum dado.
create function app.conta_atual() returns uuid language sql stable security definer set search_path = public, app, pg_temp as $$
  select conta_id from app._sessao_atual()
$$;
create function app.paroquia_atual() returns uuid language sql stable security definer set search_path = public, app, pg_temp as $$
  select paroquia_id from app._sessao_atual() where not troca_pendente
$$;
create function app.diocese_atual() returns uuid language sql stable security definer set search_path = public, app, pg_temp as $$
  select diocese_id from app._sessao_atual() where not troca_pendente
$$;
create function app.plataforma_atual() returns papel_plataforma language sql stable security definer set search_path = public, app, pg_temp as $$
  select plataforma from app._sessao_atual() where not troca_pendente
$$;
create function app.papeis_atuais() returns papel[] language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(array_agg(vp.papel order by vp.papel), '{}')
  from app._sessao_atual() s
  join vinculo_papel vp on vp.vinculo_id = s.vinculo_id
  where not s.troca_pendente
$$;
create function app.tem_papel(p papel) returns boolean language sql stable security definer set search_path = public, app, pg_temp as $$
  select p = any(app.papeis_atuais())
$$;
create function app.eh_admin_mestre() returns boolean language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(app.plataforma_atual() = 'ADMIN_MESTRE', false)
$$;

-- Registro de evento (usado pelas funções e pela API).
create function app.registrar_evento(p_evento text, p_resultado text, p_operacao text default null,
                                     p_request_id text default null, p_duracao_ms int default null,
                                     p_detalhes jsonb default null, p_conta uuid default null)
returns void language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare s record;
begin
  select * into s from app._sessao_atual() limit 1;
  insert into log_evento (evento, conta_id, paroquia_id, papeis, operacao, resultado, request_id, duracao_ms, detalhes)
  values (left(p_evento, 80), coalesce(p_conta, s.conta_id), s.paroquia_id,
          nullif(array_to_string(app.papeis_atuais(), ','), ''),
          left(p_operacao, 120), p_resultado, left(p_request_id, 64), p_duracao_ms, p_detalhes);
end $$;

-- Valida a sessão e fixa o contexto desta transação. Lança SESSAO_INVALIDA se não valer.
create function app.iniciar(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  v_resumo bytea;
  s record;
  v_unico uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'SESSAO_INVALIDA' using errcode = 'P0001';
  end if;
  v_resumo := app.resumo(p_token);
  perform set_config('app.sessao', encode(v_resumo, 'hex'), true);

  select * into s from app._sessao_atual() limit 1;
  if s.sessao_id is null then
    perform set_config('app.sessao', '', true);
    raise exception 'SESSAO_INVALIDA' using errcode = 'P0001';
  end if;

  -- Uso recente (renova a inatividade) — grava no máximo uma vez por minuto.
  update sessao set ultimo_uso = now()
   where id = s.sessao_id and ultimo_uso < now() - make_interval(secs => app.cfg('ATUALIZA_USO_SEGUNDOS'));

  -- Sem vínculo escolhido e só um vínculo ativo: escolhe automaticamente.
  if s.vinculo_id is null then
    select case when count(*) = 1 then (array_agg(id))[1] end into v_unico
      from vinculo where conta_id = s.conta_id and situacao = 'ATIVO';
    if v_unico is not null then
      update sessao set vinculo_id = v_unico where id = s.sessao_id;
    end if;
  end if;

  return app.contexto();
end $$;

-- Retrato do contexto (para a tela): conta, vínculo ativo, papéis e todos os vínculos.
create function app.contexto() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'contaId', c.id,
    'nome', c.nome,
    'trocaSenhaPendente', c.troca_senha_pendente,
    'plataforma', c.papel_plataforma,
    'vinculoAtivoId', s.vinculo_id,
    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'paroquiaId', v.paroquia_id,
        'dioceseId', coalesce(v.diocese_id, p.diocese_id),
        'nome', coalesce(p.nome, d.nome),
        'tipo', case when v.paroquia_id is not null then 'PAROQUIA' else 'DIOCESE' end,
        'corIdentidade', p.cor_identidade,
        'corDestaque', p.cor_destaque,
        'papeis', (select coalesce(jsonb_agg(vp.papel order by vp.papel), '[]') from vinculo_papel vp where vp.vinculo_id = v.id)
      ) order by coalesce(p.nome, d.nome))
      from vinculo v
      left join paroquia p on p.id = v.paroquia_id
      left join diocese d on d.id = v.diocese_id
      where v.conta_id = c.id and v.situacao = 'ATIVO'
        and (p.id is null or p.situacao = 'ATIVA') and (d.id is null or d.situacao = 'ATIVA')
    ), '[]')
  )
  from app._sessao_atual() s
  join conta c on c.id = s.conta_id
$$;

-- =============================================================================
-- Login, renovação, troca de senha e saída
-- =============================================================================
create function app._nova_sessao(p_conta uuid, p_origem text) returns text
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare v_token text := encode(gen_random_bytes(32), 'hex');
begin
  insert into sessao (conta_id, token_resumo, origem, senha_versao, expira_em)
  select id, app.resumo(v_token), p_origem, senha_alterada_em, now() + make_interval(hours => app.cfg('SESSAO_TETO_HORAS'))
    from conta where id = p_conta;
  return v_token;
end $$;

-- Só quem atua como catequista pode manter o aparelho conectado (decisão de 27/10/2026 no catequese-nsps).
create function app._pode_lembrar_aparelho(p_conta uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from vinculo v join vinculo_papel vp on vp.vinculo_id = v.id
     where v.conta_id = p_conta and v.situacao = 'ATIVO'
       and vp.papel in ('CATEQUISTA_RESPONSAVEL', 'CATEQUISTA_AUXILIAR'))
$$;

create function app.entrar(p_identificador text, p_senha text, p_lembrar boolean default false,
                           p_request_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  v_id record;
  c conta%rowtype;
  v_chave_limite text;
  v_token text;
  v_chave text;
  v_ok boolean;
begin
  select * into v_id from app.normalizar_identificador(p_identificador);
  v_chave_limite := 'entrar:' || encode(app.resumo(coalesce(v_id.cpf, v_id.codigo, upper(left(coalesce(p_identificador, ''), 40)))), 'hex');

  if app.limite_atingido(v_chave_limite) then
    return jsonb_build_object('ok', false, 'motivo', 'MUITAS_TENTATIVAS');
  end if;

  if v_id.cpf is not null then
    select * into c from conta where cpf = v_id.cpf and situacao = 'ATIVA';
  elsif v_id.codigo is not null then
    select * into c from conta where codigo_acesso = v_id.codigo and situacao = 'ATIVA';
  end if;

  if c.id is null then
    -- Gasta o mesmo tempo de uma conta real: não revela quais CPFs têm conta.
    perform app.hash_senha(coalesce(p_senha, ''));
    perform app.limite_registrar(v_chave_limite);
    insert into log_evento (evento, resultado, request_id, detalhes)
    values ('LOGIN_FALHA', 'FALHA', left(p_request_id, 64),
            jsonb_build_object('motivo', 'CONTA_NAO_ENCONTRADA', 'final', right(coalesce(v_id.cpf, v_id.codigo, ''), 2)));
    return jsonb_build_object('ok', false, 'motivo', 'CREDENCIAIS');
  end if;

  -- Bloqueio temporário: passado o prazo, a conta ganha UMA tentativa (como no catequese-nsps).
  if c.bloqueada_ate is not null and c.bloqueada_ate > now() then
    perform app.limite_registrar(v_chave_limite);
    insert into log_evento (evento, conta_id, resultado, request_id) values ('LOGIN_BLOQUEADO', c.id, 'NEGADO', left(p_request_id, 64));
    return jsonb_build_object('ok', false, 'motivo', 'BLOQUEADA');
  end if;
  if c.tentativas >= app.cfg('TENTATIVAS_MAX') then
    update conta set tentativas = app.cfg('TENTATIVAS_MAX') - 1 where id = c.id;
    c.tentativas := app.cfg('TENTATIVAS_MAX') - 1;
  end if;

  v_ok := crypt(coalesce(p_senha, ''), c.senha_hash) = c.senha_hash;
  if not v_ok then
    perform app.limite_registrar(v_chave_limite);
    update conta set
      tentativas = tentativas + 1,
      bloqueada_ate = case when tentativas + 1 >= app.cfg('TENTATIVAS_MAX')
                           then now() + make_interval(mins => app.cfg('BLOQUEIO_MIN')) else bloqueada_ate end
    where id = c.id;
    insert into log_evento (evento, conta_id, resultado, request_id) values ('LOGIN_FALHA', c.id, 'FALHA', left(p_request_id, 64));
    return jsonb_build_object('ok', false, 'motivo', 'CREDENCIAIS');
  end if;

  delete from limite_tentativa where chave = v_chave_limite;
  update conta set tentativas = 0, bloqueada_ate = null, ultimo_login = now() where id = c.id;
  v_token := app._nova_sessao(c.id, 'SENHA');

  if coalesce(p_lembrar, false) and not c.troca_senha_pendente and app._pode_lembrar_aparelho(c.id) then
    v_chave := encode(gen_random_bytes(32), 'hex');
    insert into aparelho_lembrado (conta_id, chave_resumo, senha_versao, expira_em)
    values (c.id, app.resumo(v_chave), c.senha_alterada_em, now() + make_interval(days => app.cfg('APARELHO_DIAS')));
    -- No máximo N aparelhos ativos por pessoa: o mais antigo é cancelado.
    update aparelho_lembrado set cancelado_em = now()
     where id in (select id from aparelho_lembrado
                   where conta_id = c.id and cancelado_em is null and expira_em > now()
                   order by criado_em desc offset app.cfg('APARELHOS_POR_CONTA'));
  end if;

  insert into log_evento (evento, conta_id, resultado, request_id, detalhes)
  values ('LOGIN_SUCESSO', c.id, 'SUCESSO', left(p_request_id, 64),
          case when c.troca_senha_pendente then '{"trocaSenhaPendente":true}'::jsonb end);

  return jsonb_build_object('ok', true, 'token', v_token, 'chaveAparelho', v_chave,
                            'trocaSenhaPendente', c.troca_senha_pendente);
end $$;

create function app.renovar_por_aparelho(p_chave text, p_request_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  a aparelho_lembrado%rowtype;
  c conta%rowtype;
begin
  if p_chave is null or p_chave !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'motivo', 'APARELHO_INVALIDO');
  end if;
  select * into a from aparelho_lembrado where chave_resumo = app.resumo(p_chave);
  if a.id is null or a.cancelado_em is not null then
    return jsonb_build_object('ok', false, 'motivo', 'APARELHO_INVALIDO');
  end if;
  select * into c from conta where id = a.conta_id;
  if a.expira_em <= now() or c.situacao <> 'ATIVA' or c.senha_alterada_em <> a.senha_versao
     or c.troca_senha_pendente or not app._pode_lembrar_aparelho(c.id) then
    update aparelho_lembrado set cancelado_em = now() where id = a.id;
    insert into log_evento (evento, conta_id, resultado, request_id) values ('APARELHO_RECUSADO', c.id, 'NEGADO', left(p_request_id, 64));
    return jsonb_build_object('ok', false, 'motivo', 'APARELHO_INVALIDO');
  end if;
  update aparelho_lembrado set ultimo_uso = now() where id = a.id;
  insert into log_evento (evento, conta_id, resultado, request_id) values ('SESSAO_RENOVADA_APARELHO', c.id, 'SUCESSO', left(p_request_id, 64));
  return jsonb_build_object('ok', true, 'token', app._nova_sessao(c.id, 'APARELHO'), 'trocaSenhaPendente', false);
end $$;

-- Troca da própria senha. Exige app.iniciar() antes, na mesma transação.
-- A política completa é conferida na API; aqui fica a garantia mínima.
create function app.alterar_minha_senha(p_atual text, p_nova text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  s record;
  c conta%rowtype;
  v_versao timestamptz := clock_timestamp();
begin
  select * into s from app._sessao_atual() limit 1;
  if s.sessao_id is null then raise exception 'SESSAO_INVALIDA' using errcode = 'P0001'; end if;
  select * into c from conta where id = s.conta_id;

  if c.bloqueada_ate is not null and c.bloqueada_ate > now() then
    return jsonb_build_object('ok', false, 'motivo', 'BLOQUEADA');
  end if;
  if crypt(coalesce(p_atual, ''), c.senha_hash) <> c.senha_hash then
    update conta set
      tentativas = tentativas + 1,
      bloqueada_ate = case when tentativas + 1 >= app.cfg('TENTATIVAS_MAX')
                           then now() + make_interval(mins => app.cfg('BLOQUEIO_MIN')) else bloqueada_ate end
    where id = c.id;
    perform app.registrar_evento('SENHA_ALTERACAO_FALHA', 'FALHA');
    return jsonb_build_object('ok', false, 'motivo', 'SENHA_ATUAL_INCORRETA');
  end if;
  if not app.senha_aceitavel(p_nova)
     or exists (select 1 from generate_series(1, 6) g
                 where c.cpf is not null and strpos(p_nova, substr(c.cpf, g, 6)) > 0) then
    return jsonb_build_object('ok', false, 'motivo', 'SENHA_FRACA');
  end if;
  if crypt(p_nova, c.senha_hash) = c.senha_hash then
    return jsonb_build_object('ok', false, 'motivo', 'SENHA_IGUAL');
  end if;

  update conta set senha_hash = app.hash_senha(p_nova), senha_alterada_em = v_versao,
                   troca_senha_pendente = false, tentativas = 0, bloqueada_ate = null,
                   atualizado_em = now(), atualizado_por = c.id
   where id = c.id;
  -- A sessão em uso continua; as outras caem (versão da senha mudou); aparelhos lembrados são cancelados.
  update sessao set senha_versao = v_versao where id = s.sessao_id;
  update aparelho_lembrado set cancelado_em = now() where conta_id = c.id and cancelado_em is null;
  insert into log_evento (evento, conta_id, resultado) values ('SENHA_ALTERADA_PELO_USUARIO', c.id, 'SUCESSO');
  return jsonb_build_object('ok', true);
end $$;

create function app.sair(p_chave_aparelho text default null) returns void
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare s record;
begin
  select * into s from app._sessao_atual() limit 1;
  if s.sessao_id is null then return; end if;
  update sessao set encerrada_em = now() where id = s.sessao_id;
  if p_chave_aparelho is not null and p_chave_aparelho ~ '^[0-9a-f]{64}$' then
    update aparelho_lembrado set cancelado_em = now()
     where chave_resumo = app.resumo(p_chave_aparelho) and conta_id = s.conta_id;
  end if;
  insert into log_evento (evento, conta_id, resultado) values ('LOGOUT', s.conta_id, 'SUCESSO');
end $$;

-- Troca do vínculo ativo (por exemplo, de uma paróquia para outra).
create function app.escolher_vinculo(p_vinculo uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare s record;
begin
  select * into s from app._sessao_atual() limit 1;
  if s.sessao_id is null then raise exception 'SESSAO_INVALIDA' using errcode = 'P0001'; end if;
  if not exists (select 1 from vinculo where id = p_vinculo and conta_id = s.conta_id and situacao = 'ATIVO') then
    raise exception 'VINCULO_INVALIDO' using errcode = 'P0001';
  end if;
  update sessao set vinculo_id = p_vinculo where id = s.sessao_id;
  return app.contexto();
end $$;

-- =============================================================================
-- Administração da plataforma (Administrador mestre)
-- =============================================================================
create function app.exigir_admin_mestre() returns void language plpgsql stable as $$
begin
  if not app.eh_admin_mestre() then
    raise exception 'PERMISSAO_NEGADA' using errcode = 'P0001';
  end if;
end $$;

-- Cria (ou reaproveita, pelo CPF) a conta de uma pessoa e dá a ela um papel numa paróquia ou diocese.
-- Devolve a senha provisória só quando a conta é nova — ela aparece UMA vez, na tela de quem criou.
create function app.vincular_pessoa(p_paroquia uuid, p_diocese uuid, p_papel papel,
                                    p_nome text, p_cpf text, p_email text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_conta uuid;
  v_vinculo uuid;
  v_senha text;
  v_autor uuid := app.conta_atual();
begin
  perform app.exigir_admin_mestre();
  if num_nonnulls(p_paroquia, p_diocese) <> 1 then raise exception 'ESCOPO_INVALIDO' using errcode = 'P0001'; end if;
  if not app.cpf_valido(v_cpf) then raise exception 'CPF_INVALIDO' using errcode = 'P0001'; end if;
  if p_paroquia is not null and not exists (select 1 from paroquia where id = p_paroquia and situacao = 'ATIVA') then
    raise exception 'PAROQUIA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;
  if p_diocese is not null and not exists (select 1 from diocese where id = p_diocese and situacao = 'ATIVA') then
    raise exception 'DIOCESE_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  select id into v_conta from conta where cpf = v_cpf;
  if v_conta is null then
    v_senha := app.aleatorio(12);
    insert into conta (nome, cpf, email, senha_hash, troca_senha_pendente, criado_por)
    values (btrim(p_nome), v_cpf, nullif(lower(btrim(coalesce(p_email, ''))), ''), app.hash_senha(v_senha), true, v_autor)
    returning id into v_conta;
  end if;

  select id into v_vinculo from vinculo
   where conta_id = v_conta and situacao = 'ATIVO'
     and paroquia_id is not distinct from p_paroquia and diocese_id is not distinct from p_diocese;
  if v_vinculo is null then
    insert into vinculo (conta_id, paroquia_id, diocese_id, criado_por)
    values (v_conta, p_paroquia, p_diocese, v_autor) returning id into v_vinculo;
  end if;
  insert into vinculo_papel (vinculo_id, papel, criado_por) values (v_vinculo, p_papel, v_autor)
  on conflict do nothing;

  perform app.registrar_evento('PESSOA_VINCULADA', 'SUCESSO', 'vincular_pessoa', null, null,
    jsonb_build_object('conta', v_conta, 'vinculo', v_vinculo, 'papel', p_papel, 'contaNova', v_senha is not null,
                       'paroquia', p_paroquia, 'diocese', p_diocese));
  return jsonb_build_object('contaId', v_conta, 'vinculoId', v_vinculo, 'senhaProvisoria', v_senha);
end $$;

create function app.redefinir_senha(p_conta uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare v_senha text := app.aleatorio(12);
begin
  perform app.exigir_admin_mestre();
  update conta set senha_hash = app.hash_senha(v_senha), senha_alterada_em = clock_timestamp(),
                   troca_senha_pendente = true, tentativas = 0, bloqueada_ate = null,
                   atualizado_em = now(), atualizado_por = app.conta_atual()
   where id = p_conta and situacao = 'ATIVA';
  if not found then raise exception 'CONTA_NAO_ENCONTRADA' using errcode = 'P0001'; end if;
  update aparelho_lembrado set cancelado_em = now() where conta_id = p_conta and cancelado_em is null;
  perform app.registrar_evento('SENHA_REDEFINIDA', 'SUCESSO', 'redefinir_senha', null, null, jsonb_build_object('conta', p_conta));
  return jsonb_build_object('senhaProvisoria', v_senha);
end $$;

-- Lista de pessoas vinculadas a uma paróquia (para o Administrador mestre). Nunca devolve CPF completo.
create function app.pessoas_da_paroquia(p_paroquia uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when app.eh_admin_mestre() or (p_paroquia = app.paroquia_atual() and app.tem_papel('COORDENADOR_PAROQUIAL')) then
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'contaId', c.id, 'nome', c.nome,
        'cpfFinal', right(c.cpf, 2),
        'trocaSenhaPendente', c.troca_senha_pendente,
        'ultimoLogin', c.ultimo_login,
        'papeis', (select jsonb_agg(vp.papel order by vp.papel) from vinculo_papel vp where vp.vinculo_id = v.id)
      ) order by c.nome)
      from vinculo v join conta c on c.id = v.conta_id
      where v.paroquia_id = p_paroquia and v.situacao = 'ATIVO' and c.situacao = 'ATIVA'
    ), '[]'::jsonb)
  end
$$;

-- Limpeza periódica (chamada pela rotina de backup diário).
create function app.limpar_expirados() returns void
language sql volatile security definer set search_path = public, app, pg_temp as $$
  delete from sessao where coalesce(encerrada_em, expira_em) < now() - interval '30 days';
  delete from aparelho_lembrado where coalesce(cancelado_em, expira_em) < now() - interval '60 days';
  delete from limite_tentativa where janela_fim < now() - interval '1 day';
  delete from operacao_sincronizacao where criado_em < now() - interval '60 days';
$$;

-- =============================================================================
-- Isolamento (RLS)
-- =============================================================================
alter table diocese enable row level security;
alter table paroquia enable row level security;
alter table conta enable row level security;
alter table vinculo enable row level security;
alter table vinculo_papel enable row level security;
alter table log_evento enable row level security;
alter table sessao enable row level security;
alter table aparelho_lembrado enable row level security;
alter table limite_tentativa enable row level security;
alter table operacao_sincronizacao enable row level security;

create policy diocese_ler on diocese for select using (
  (select app.plataforma_atual()) is not null
  or id = (select app.diocese_atual())
  or id = (select p.diocese_id from paroquia p where p.id = (select app.paroquia_atual()))
);
create policy diocese_criar on diocese for insert with check ((select app.eh_admin_mestre()));
create policy diocese_alterar on diocese for update using ((select app.eh_admin_mestre())) with check ((select app.eh_admin_mestre()));

create policy paroquia_ler on paroquia for select using (
  (select app.plataforma_atual()) is not null
  or id = (select app.paroquia_atual())
  or (diocese_id is not null and diocese_id = (select app.diocese_atual()))
);
create policy paroquia_criar on paroquia for insert with check ((select app.eh_admin_mestre()));
create policy paroquia_alterar on paroquia for update
  using ((select app.eh_admin_mestre()) or (id = (select app.paroquia_atual()) and (select app.tem_papel('COORDENADOR_PAROQUIAL'))))
  with check ((select app.eh_admin_mestre()) or (id = (select app.paroquia_atual()) and (select app.tem_papel('COORDENADOR_PAROQUIAL'))));

create policy conta_ler on conta for select using (id = (select app.conta_atual()));

create policy vinculo_ler on vinculo for select using (
  conta_id = (select app.conta_atual())
  or (select app.eh_admin_mestre())
  or (paroquia_id = (select app.paroquia_atual()) and (select app.tem_papel('COORDENADOR_PAROQUIAL')))
);
create policy vinculo_papel_ler on vinculo_papel for select using (
  exists (select 1 from vinculo v where v.id = vinculo_id)  -- herda a regra de vinculo
);

create policy log_ler on log_evento for select using (
  (select app.eh_admin_mestre())
  or (paroquia_id = (select app.paroquia_atual()) and (select app.tem_papel('COORDENADOR_PAROQUIAL')))
);
-- sessao, aparelho_lembrado, limite_tentativa e operacao_sincronizacao: sem política = nada visível
-- para a API; só as funções acima (SECURITY DEFINER) as usam.

-- Auditoria automática de quem criou/alterou.
create function app.carimbar() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, app.conta_atual());
  else
    new.atualizado_em := now();
    new.atualizado_por := app.conta_atual();
  end if;
  return new;
end $$;
create trigger diocese_carimbo before insert or update on diocese for each row execute function app.carimbar();
create trigger paroquia_carimbo before insert or update on paroquia for each row execute function app.carimbar();

-- O coordenador paroquial altera nome, cidade e cores da própria paróquia; diocese e situação só o Administrador mestre.
create function app.paroquia_protege() returns trigger language plpgsql as $$
begin
  if not app.eh_admin_mestre()
     and (new.diocese_id is distinct from old.diocese_id or new.situacao is distinct from old.situacao) then
    raise exception 'PERMISSAO_NEGADA' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger paroquia_protege before update on paroquia for each row execute function app.paroquia_protege();
