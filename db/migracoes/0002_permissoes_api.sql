-- =============================================================================
-- Katechesis — migração 0002
-- O que o papel da API (katechesis_api) pode fazer. Ele é criado pelo script de
-- migração (db/scripts/migrar.mjs) com NOBYPASSRLS: as regras de isolamento sempre valem.
-- =============================================================================

-- Funções nascem executáveis por todos (PUBLIC) no Postgres: fecha tudo e libera só o necessário.
revoke all on all functions in schema app from public;
alter default privileges in schema app revoke execute on functions from public;
revoke all on schema app from public;
revoke create on schema public from public;

grant usage on schema app to katechesis_api;
grant usage on schema public to katechesis_api;

-- Entrada e sessão
grant execute on function app.entrar(text, text, boolean, text) to katechesis_api;
grant execute on function app.renovar_por_aparelho(text, text) to katechesis_api;
grant execute on function app.iniciar(text) to katechesis_api;
grant execute on function app.contexto() to katechesis_api;
grant execute on function app.alterar_minha_senha(text, text) to katechesis_api;
grant execute on function app.sair(text) to katechesis_api;
grant execute on function app.escolher_vinculo(uuid) to katechesis_api;
grant execute on function app.registrar_evento(text, text, text, text, integer, jsonb, uuid) to katechesis_api;

-- Usadas pelas regras de RLS e pelos gatilhos (rodam com o papel de quem consulta)
grant execute on function app.cfg(text) to katechesis_api;
grant execute on function app._sessao_atual() to katechesis_api;
grant execute on function app.conta_atual() to katechesis_api;
grant execute on function app.paroquia_atual() to katechesis_api;
grant execute on function app.diocese_atual() to katechesis_api;
grant execute on function app.plataforma_atual() to katechesis_api;
grant execute on function app.papeis_atuais() to katechesis_api;
grant execute on function app.tem_papel(papel) to katechesis_api;
grant execute on function app.eh_admin_mestre() to katechesis_api;
grant execute on function app.exigir_admin_mestre() to katechesis_api;
grant execute on function app.carimbar() to katechesis_api;
grant execute on function app.paroquia_protege() to katechesis_api;
grant execute on function app.cpf_valido(text) to katechesis_api;

-- Administração
grant execute on function app.vincular_pessoa(uuid, uuid, papel, text, text, text) to katechesis_api;
grant execute on function app.redefinir_senha(uuid) to katechesis_api;
grant execute on function app.pessoas_da_paroquia(uuid) to katechesis_api;

-- Tabelas (as linhas visíveis continuam limitadas pelas regras de RLS)
grant select, insert, update on diocese to katechesis_api;
grant select, insert, update on paroquia to katechesis_api;
grant select on vinculo, vinculo_papel to katechesis_api;
grant select on log_evento to katechesis_api;
-- Conta: nunca o hash da senha, nem tentativas ou bloqueio.
grant select (id, nome, email, troca_senha_pendente, ultimo_login, papel_plataforma, situacao) on conta to katechesis_api;
-- sessao, aparelho_lembrado, limite_tentativa, operacao_sincronizacao: nenhum acesso direto.
