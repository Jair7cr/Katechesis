/**
 * Aplica a identidade visual da paróquia ativa. Só a IDENTIDADE (faixas, marca) e o DESTAQUE (fios) mudam;
 * botões e links ficam no azul fixo. Se a cor de identidade for clara, o texto sobre ela fica escuro.
 */
const PADRAO_IDENTIDADE = '#7B1E3A';
const PADRAO_DESTAQUE = '#B8913F';

function luminancia(hex: string) {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

export function textoSobre(hex: string) {
  return luminancia(hex) > 0.4 ? '#1E2430' : '#ffffff';
}

export function aplicarTema(identidade?: string | null, destaque?: string | null) {
  const raiz = document.documentElement.style;
  const id = identidade && /^#[0-9a-f]{6}$/i.test(identidade) ? identidade : PADRAO_IDENTIDADE;
  const de = destaque && /^#[0-9a-f]{6}$/i.test(destaque) ? destaque : PADRAO_DESTAQUE;
  raiz.setProperty('--cor-identidade', id);
  raiz.setProperty('--cor-sobre-identidade', textoSobre(id));
  raiz.setProperty('--cor-destaque', de);
}
