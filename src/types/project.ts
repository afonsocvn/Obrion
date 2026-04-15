export type Tipologia = 'T0' | 'T1' | 'T2' | 'T3' | 'T4+';
export type NivelQualidade = 'Básico' | 'Médio' | 'Premium';
export type TipoDivisao = 'Quarto' | 'Casa de Banho' | 'Sala' | 'Cozinha' | 'Varanda' | 'Circulação' | 'Zona Exterior';

export interface Divisao {
  id: string;
  tipo: TipoDivisao;
  area: number;
  peDireito: number;
}

export type TipoFracao = 'Fracao' | 'ZonaComum';

export interface Fracao {
  id: string;
  nome: string;
  tipo?: TipoFracao;
  tipologia: Tipologia;
  divisoes: Divisao[];
  qualidade: NivelQualidade;
  quantidade: number;
  imagemUrl?: string;
}

export type GamaMaterial = 'Alta' | 'Média' | 'Baixa';

export interface Material {
  id: string;
  nome: string;
  referencia: string;
  categoria: string;
  material?: string;
  gama?: GamaMaterial;
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
  maoDeObraId?: string;
  tipoMaterial?: string;
  categoriaFiltro?: string;
  fornecedor: string;
  notas: string;
  fracaoId: string;
}

export interface TemplateTarefa {
  tarefa: string;
  unidade: string;
  quantidade: number;
  custoMaterial: number;
  custoMaoObra: number;
  margemEmpreiteiro: number;
  materialId?: string;
  maoDeObraId?: string;
  tipoMaterial?: string;
  categoriaFiltro?: string;
  fornecedor: string;
  notas: string;
}

export interface TemplateDivisao {
  id: string;
  nome: string;
  subcapitulo: string;
  criadoEm: string;
  tarefas: TemplateTarefa[];
}

export interface Projeto {
  id: string;
  nome: string;
  criadoEm: string;
  fracoes: Fracao[];
  tarefas: TarefaCusto[];
}

export interface MaoDeObra {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  precoUnitario: number;
  subcontratado: boolean;
  notas: string;
}

export const CATEGORIAS_MAO_DE_OBRA = [
  'Revestimentos',
  'Pintura',
  'Impermeabilização',
  'Carpintaria',
  'Sanitários',
  'Elétrica',
  'Canalização',
  'Estrutura',
  'Vãos Exteriores',
  'Vãos Interiores',
  'Guardas',
  'Demolições',
  'Outros',
] as const;

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
  'Eletrodomésticos',
  'Vãos Exteriores',
  'Vãos Interiores',
  'Guardas',
  'Elevadores',
  'Bombas de calor',
  'Ar condicionado',
  'Outros',
] as const;

export const TIPOS_MATERIAL: Record<string, string[]> = {
  'Revestimentos':      ['Cerâmico', 'Porcelânico', 'Pedra natural', 'Microcimento', 'Vinílico', 'Madeira', 'Epoxy'],
  'Pintura':            ['Tinta plástica', 'Tinta texturada', 'Tinta esmalte', 'Verniz'],
  'Carpintaria':        ['Madeira maciça', 'MDF lacado', 'MDF folheado', 'PVC', 'Alumínio'],
  'Impermeabilização':  ['Membrana líquida', 'Tela asfáltica', 'Poliuretano', 'Epoxy'],
  'Sanitários':         ['Cerâmico', 'Suspenso', 'Encastrado', 'Pousar'],
  'Equipamentos':       ['Standard', 'Semi-profissional', 'Profissional'],
  'Eletrodomésticos':   ['Standard', 'Semi-profissional', 'Profissional', 'Encastrado', 'De livre instalação'],
  'Canalização':        ['PPR', 'Cobre', 'Multicamadas', 'PVC'],
  'Elétrica':           ['Standard', 'Domotica', 'Premium'],
  'Estrutura':          ['Betão', 'Metálico', 'Madeira', 'Alvenaria'],
  'Vãos Exteriores':    ['Alumínio', 'PVC', 'Madeira', 'Aço inox', 'Vidro duplo', 'Vidro triplo'],
  'Vãos Interiores':   ['Madeira', 'MDF lacado', 'Alumínio', 'Vidro', 'PVC'],
  'Guardas':            ['Vidro', 'Inox', 'Alumínio', 'Ferro', 'Madeira', 'Compósito'],
  'Elevadores':         ['Hidráulico', 'Elétrico', 'Monta-cargas', 'Plataforma elevatória'],
  'Bombas de calor':    ['Aerotérmica', 'Geotérmica', 'Ar-água', 'Ar-ar'],
  'Ar condicionado':    ['Split', 'Multi-split', 'VRV/VRF', 'Cassete', 'Conduta'],
  'Outros':             [],
};

export const TIPOLOGIAS: Tipologia[] = ['T0', 'T1', 'T2', 'T3', 'T4+'];
export const NIVEIS_QUALIDADE: NivelQualidade[] = ['Básico', 'Médio', 'Premium'];
export const TIPOS_DIVISAO: TipoDivisao[] = ['Sala', 'Quarto', 'Casa de Banho', 'Cozinha', 'Varanda', 'Circulação', 'Zona Exterior'];
