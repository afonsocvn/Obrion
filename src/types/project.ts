export type Tipologia = 'T0' | 'T1' | 'T2' | 'T3' | 'T4+';
export type NivelQualidade = 'Básico' | 'Médio' | 'Premium';

export interface AreasFracao {
  sala: number;
  quartos: number;
  casasBanho: number;
  cozinha: number;
  varandas: number;
}

export interface Fracao {
  id: string;
  nome: string;
  tipologia: Tipologia;
  areas: AreasFracao;
  qualidade: NivelQualidade;
}

export interface Material {
  id: string;
  nome: string;
  referencia: string;
  categoria: string;
  unidade: string;
  precoUnitario: number;
  fornecedor: string;
  notas: string;
}

export interface TarefaCusto {
  id: string;
  capitulo: string;
  subcapitulo: string;
  tarefa: string;
  unidade: string;
  quantidade: number;
  custoMaterial: number;
  custoMaoObra: number;
  margemEmpreiteiro: number;
  materialId?: string;
  fornecedor: string;
  notas: string;
  fracaoId: string;
}

export interface Projeto {
  id: string;
  nome: string;
  criadoEm: string;
  fracoes: Fracao[];
  tarefas: TarefaCusto[];
}

export const CATEGORIAS_MATERIAL = [
  'Revestimentos',
  'Canalização',
  'Elétrica',
  'Estrutura',
  'Carpintaria',
  'Pintura',
  'Impermeabilização',
  'Sanitários',
  'Equipamentos',
  'Outros',
] as const;

export const TIPOLOGIAS: Tipologia[] = ['T0', 'T1', 'T2', 'T3', 'T4+'];
export const NIVEIS_QUALIDADE: NivelQualidade[] = ['Básico', 'Médio', 'Premium'];
