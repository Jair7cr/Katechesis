/**
 * Itens de menu por papel. Um item só aparece para quem tem um dos papéis listados
 * (ou é Administrador mestre, quando `plataforma` está marcado). O servidor confere de novo.
 * Novos módulos entram aqui conforme as fases.
 */
import { Building2, Church, Home, Palette, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { Papel } from '@katechesis/compartilhado';

export interface ItemMenu {
  caminho: string;
  rotulo: string;
  icone: LucideIcon;
  grupo: 'Início' | 'Paróquia' | 'Plataforma' | 'Conta';
  papeis?: Papel[];
  plataforma?: boolean;
  todos?: boolean;
  atalho?: boolean; // aparece na barra inferior do celular
  curto?: string;   // rótulo na barra inferior
}

export const ITENS_MENU: ItemMenu[] = [
  { caminho: '/', rotulo: 'Início', icone: Home, grupo: 'Início', todos: true, atalho: true },
  { caminho: '/paroquia/pessoas', rotulo: 'Pessoas e acessos', curto: 'Pessoas', icone: Users, grupo: 'Paróquia', papeis: ['COORDENADOR_PAROQUIAL'], atalho: true },
  { caminho: '/paroquia/configuracao', rotulo: 'Configuração da paróquia', icone: Palette, grupo: 'Paróquia', papeis: ['COORDENADOR_PAROQUIAL'] },
  { caminho: '/plataforma/paroquias', rotulo: 'Paróquias', icone: Church, grupo: 'Plataforma', plataforma: true, atalho: true },
  { caminho: '/plataforma/dioceses', rotulo: 'Dioceses', icone: Building2, grupo: 'Plataforma', plataforma: true },
  { caminho: '/conta', rotulo: 'Minha conta', curto: 'Conta', icone: UserRound, grupo: 'Conta', todos: true, atalho: true }
];

export function itensVisiveis(temPapel: (...p: Papel[]) => boolean, ehAdminMestre: boolean) {
  return ITENS_MENU.filter(i => i.todos || (i.plataforma && ehAdminMestre) || (i.papeis && temPapel(...i.papeis)));
}
