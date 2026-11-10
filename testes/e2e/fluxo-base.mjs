/**
 * Percorre a Fase 2 no navegador, como uma pessoa faria, e tira fotos das telas.
 * Uso: BASE=http://localhost:8788 SENHA_ADMIN=... node testes/e2e/fluxo-base.mjs <pasta-das-fotos>
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8788';
const pasta = process.argv[2] ?? '.';
const SENHA_ADMIN = process.env.SENHA_ADMIN;
const NOVA_ADMIN = 'Katechesis2026adm';
const NOVA_COORD = 'Paroquia2026nova';
const falhas = [];

function confere(cond, texto) {
  if (!cond) { falhas.push(texto); console.log('FALHOU:', texto); } else console.log('ok:', texto);
}

async function entrar(pagina, cpf, senha, lembrar = false) {
  await pagina.goto(BASE + '/');
  await pagina.getByLabel('CPF ou código de acesso').fill(cpf);
  await pagina.getByLabel('Senha', { exact: true }).fill(senha);
  if (lembrar) await pagina.getByLabel('Manter conectado neste aparelho').check();
  await pagina.getByRole('button', { name: 'Entrar' }).click();
}

async function trocarSenhaObrigatoria(pagina, provisoria, nova) {
  await pagina.getByRole('heading', { name: 'Crie sua senha' }).waitFor();
  await pagina.getByLabel('Senha provisória', { exact: true }).fill(provisoria);
  await pagina.getByLabel('Nova senha', { exact: true }).fill(nova);
  await pagina.getByLabel('Repita a nova senha').fill(nova);
  await pagina.getByRole('button', { name: 'Trocar senha' }).click();
}

const navegador = await chromium.launch();
const computador = await navegador.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'pt-BR' });
const p = await computador.newPage();
const errosConsole = [];
p.on('console', m => { if (m.type() === 'error' && !/status of 40[13]/.test(m.text())) errosConsole.push(m.text()); });

// 1. Tela de entrada e senha errada
await p.goto(BASE + '/');
await p.screenshot({ path: `${pasta}/01-entrar.png` });
await entrar(p, '529.982.247-25', 'errada123');
await p.getByText('CPF, código ou senha inválidos.').waitFor();
confere(true, 'senha errada mostra mensagem clara');

// 2. Admin: senha provisória obriga a troca
await entrar(p, '529.982.247-25', SENHA_ADMIN);
await p.screenshot({ path: `${pasta}/02-troca-obrigatoria.png` });
await trocarSenhaObrigatoria(p, SENHA_ADMIN, NOVA_ADMIN);
await p.getByRole('heading', { name: 'Administração da plataforma' }).waitFor();
confere(true, 'admin troca a senha provisória e entra');
await p.screenshot({ path: `${pasta}/03-inicio-admin.png` });

// 3. Cria diocese e duas paróquias
await p.getByRole('link', { name: 'Dioceses' }).first().click();
await p.getByRole('button', { name: 'Nova diocese' }).click();
await p.getByLabel('Nome').fill('Diocese de Exemplo');
await p.getByLabel('Cidade').fill('Recife');
await p.getByLabel('UF').selectOption('PE');
await p.getByRole('button', { name: 'Salvar' }).click();
await p.getByText('Diocese de Exemplo').waitFor();
confere(true, 'diocese criada');

await p.getByRole('link', { name: 'Paróquias' }).first().click();
for (const nome of ['Paróquia Nossa Senhora do Exemplo', 'Paróquia São José de Teste']) {
  await p.getByRole('button', { name: 'Nova paróquia' }).click();
  await p.getByLabel('Nome').fill(nome);
  await p.getByLabel('Diocese').selectOption({ label: 'Diocese de Exemplo' });
  await p.getByRole('button', { name: 'Salvar' }).click();
  await p.getByText(nome).waitFor();
}
confere(true, 'duas paróquias criadas');
await p.screenshot({ path: `${pasta}/04-paroquias.png` });

// 4. Adiciona a coordenadora na primeira paróquia e vê a senha provisória uma vez
await p.getByRole('listitem').filter({ hasText: 'Nossa Senhora do Exemplo' }).getByRole('button', { name: 'Pessoas' }).click();
await p.getByRole('button', { name: 'Adicionar pessoa' }).click();
await p.getByLabel('Nome completo').fill('Maria Coordenadora');
await p.getByLabel('CPF', { exact: true }).fill('11144477735');
await p.getByRole('button', { name: 'Adicionar' }).click();
const senhaCoord = (await p.getByLabel('Senha provisória', { exact: true }).textContent())?.trim();
confere(/^[A-Z2-9]{12}$/.test(senhaCoord ?? ''), 'senha provisória da coordenadora exibida');
await p.screenshot({ path: `${pasta}/05-senha-provisoria.png` });
await p.getByRole('button', { name: 'Entendi' }).click();

// Mesma pessoa na segunda paróquia: conta reaproveitada
await p.getByRole('button', { name: 'Fechar' }).click();
await p.getByRole('listitem').filter({ hasText: 'São José de Teste' }).getByRole('button', { name: 'Pessoas' }).click();
await p.getByRole('button', { name: 'Adicionar pessoa' }).click();
await p.getByLabel('Nome completo').fill('Maria Coordenadora');
await p.getByLabel('CPF', { exact: true }).fill('11144477735');
await p.getByRole('button', { name: 'Adicionar' }).click();
await p.getByText('já tinha conta no Katechesis').waitFor();
confere(true, 'segunda paróquia reaproveita a conta, sem nova senha');
await p.getByRole('button', { name: 'Concluir' }).click();
await p.getByRole('button', { name: 'Fechar' }).click();

// Sai
await p.getByRole('link', { name: 'Minha conta' }).first().click();
await p.getByRole('button', { name: 'Sair' }).click();
await p.getByRole('heading', { name: 'Entrar' }).waitFor();
confere(true, 'admin sai');

// 5. Coordenadora no celular: troca a senha, escolhe a paróquia, configura a cor
const celular = await navegador.newContext({ ...devices['iPhone 13'], locale: 'pt-BR' });
const c = await celular.newPage();
c.on('console', m => { if (m.type() === 'error' && !/status of 40[13]/.test(m.text())) errosConsole.push(m.text()); });
await entrar(c, '111.444.777-35', senhaCoord);
await trocarSenhaObrigatoria(c, senhaCoord, NOVA_COORD);
await c.getByRole('heading', { name: 'Onde você vai atuar agora?' }).waitFor();
await c.screenshot({ path: `${pasta}/06-celular-escolher-paroquia.png` });
await c.getByRole('button', { name: /Nossa Senhora do Exemplo/ }).click();
await c.getByRole('heading', { name: /Bo[am] (dia|tarde|noite), Maria/ }).waitFor();
await c.screenshot({ path: `${pasta}/07-celular-inicio-coordenacao.png` });
confere(true, 'coordenadora escolhe a paróquia no celular');

await c.goto(BASE + '/paroquia/configuracao');
await c.getByLabel('Cor de identidade').fill('#1f6f50');
await c.getByRole('button', { name: 'Salvar' }).click();
await c.getByText('Configuração salva.').waitFor();
confere(true, 'coordenadora altera a cor da própria paróquia');

// Área do admin: bloqueada no app e na API
await c.goto(BASE + '/plataforma/paroquias');
await c.getByText('não está disponível para o seu papel').waitFor();
const token = await c.evaluate(() => sessionStorage.getItem('katechesis.token'));
const r = await c.request.get(BASE + '/api/plataforma/paroquias', { headers: { Authorization: `Bearer ${token}` } });
confere(r.status() === 403, 'API recusa a área do admin para a coordenadora (403)');

// Troca para a outra paróquia pelo topo
await c.goto(BASE + '/');
await c.getByRole('button', { name: /Nossa Senhora do Exemplo/ }).click();
await c.getByRole('menuitem', { name: /São José de Teste/ }).click();
await c.getByText('São José de Teste ·').waitFor();
confere(true, 'troca de paróquia pelo topo');
await c.getByRole('button', { name: 'Abrir menu' }).click();
await c.waitForTimeout(400);
await c.screenshot({ path: `${pasta}/08-celular-menu.png` });

confere(errosConsole.length === 0, 'sem erros no console do navegador' + (errosConsole.length ? ': ' + errosConsole.join(' | ') : ''));
await navegador.close();
console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo.');
process.exit(falhas.length ? 1 : 0);
