-- Conferência do backup restaurado: estrutura completa e dados legíveis.
\pset format aligned
select 'Migrações aplicadas' as item, count(*)::text as valor from migracao_aplicada
union all select 'Última migração', max(nome) from migracao_aplicada
union all select 'Dioceses', count(*)::text from diocese
union all select 'Paróquias', count(*)::text from paroquia
union all select 'Contas', count(*)::text from conta
union all select 'Vínculos ativos', count(*)::text from vinculo where situacao = 'ATIVO'
union all select 'Eventos no log', count(*)::text from log_evento
union all select 'Regras de isolamento (RLS)', count(*)::text from pg_policies where schemaname = 'public';
do $$ begin
  if (select count(*) from migracao_aplicada) = 0 then raise exception 'Backup sem migrações: restauração inválida.'; end if;
  if (select count(*) from conta) = 0 then raise exception 'Backup sem contas: restauração suspeita.'; end if;
end $$;
