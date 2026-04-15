import { Projeto, TarefaCusto } from '@/types/project';
import { v4 } from '@/lib/utils';

const NOMES: Record<string, string> = {
  // Revestimentos
  'Revestimento cerâmico - paredes':                   'Revestimentos — Paredes',
  'Revestimento cerâmico - pavimento':                 'Revestimentos — Pavimento',
  'Revestimento de paredes':                           'Revestimentos — Paredes',
  'Revestimento de pavimento':                         'Revestimentos — Pavimento',
  'Revestimento de fachada':                           'Revestimentos — Fachada',
  'Revestimento exterior':                             'Revestimentos — Fachada',
  'Revestimento pavimento':                            'Revestimentos — Pavimento',
  'Pavimento':                                         'Revestimentos — Pavimento',
  'Pavimento exterior':                                'Revestimentos — Pavimento',
  'Pavimento zonas comuns':                            'Revestimentos — Pavimento',
  // Carpintaria
  'Guardas e acabamentos':                             'Carpintaria — Guardas',
  'Caixilharia exterior':                              'Vãos',
  'Caixilharia':                                       'Vãos',
  'Carpintaria — Caixilharia':                         'Vãos',
  'Carpintaria interior (portas, roupeiros, rodapés)': 'Carpintaria interior',
  // Elétrica
  'Trabalhos elétricos':                               'Instalação elétrica',
  'Iluminação exterior':                               'Elétrica — Iluminação',
  'Iluminação e elétrica':                             'Instalação elétrica',
  // Estrutura
  'Isolamento térmico':                                'Estrutura — Isolamento',
  'Vedação e portões':                                 'Estrutura — Vedação',
  'Impermeabilização de cobertura':                    'Impermeabilização — Cobertura',
  // Outros
  'Instalação de móveis de cozinha':                   'Móveis de cozinha',
  'Arranjos exteriores e jardim':                      'Arranjos exteriores',
  'Pintura zonas comuns':                              'Pintura',
};

const CATEGORIAS: Record<string, string> = {
  'Revestimentos — Paredes':       'Revestimentos',
  'Revestimentos — Pavimento':     'Revestimentos',
  'Revestimentos — Fachada':       'Revestimentos',
  'Impermeabilização':             'Impermeabilização',
  'Impermeabilização — Cobertura': 'Impermeabilização',
  'Lavatório':                     'Sanitários',
  'Sanita':                        'Sanitários',
  'Duche / Poliban':               'Sanitários',
  'Banheira':                      'Sanitários',
  'Bidé':                          'Sanitários',
  'Torneiras e acessórios':        'Sanitários',
  'Pintura':                       'Pintura',
  'Instalação elétrica':           'Elétrica',
  'Elétrica — Iluminação':         'Elétrica',
  'Canalização':                   'Canalização',
  'Carpintaria interior':          'Carpintaria',
  'Carpintaria — Guardas':         'Carpintaria',
  'Vãos':                          'Vãos Exteriores',
  'Portas exteriores':             'Vãos Exteriores',
  'Estores':                       'Vãos Exteriores',
  'Estrutura — Isolamento':        'Estrutura',
  'Estrutura — Vedação':           'Estrutura',
  'Móveis de cozinha':             'Equipamentos',
  'Arranjos exteriores':           'Outros',
};

// Peças sanitárias — custos base (qualidade Básico) para cálculo proporcional
const SANITARIOS_BASE = [
  { tarefa: 'Lavatório',              custoMaterialBase: 200, custoMaoObraBase: 80  },
  { tarefa: 'Sanita',                 custoMaterialBase: 220, custoMaoObraBase: 80  },
  { tarefa: 'Duche / Poliban',        custoMaterialBase: 350, custoMaoObraBase: 150 },
  { tarefa: 'Banheira',               custoMaterialBase: 600, custoMaoObraBase: 200 },
  { tarefa: 'Bidé',                   custoMaterialBase: 150, custoMaoObraBase: 60  },
  { tarefa: 'Torneiras e acessórios', custoMaterialBase: 120, custoMaoObraBase: 50  },
];
// Custo base original da tarefa "Instalação de sanitários" / "Sanitários"
const BASE_MAT_ORIG = 350;
const BASE_LABOR_ORIG = 120;

function isSanitarios(tarefa: string) {
  return ['Sanitários', 'Instalação de sanitários', 'Loiças Sanitárias'].includes(tarefa);
}

function expandirSanitarios(t: TarefaCusto): TarefaCusto[] {
  // Inferir multiplicador de qualidade a partir do custo actual
  const multMat   = BASE_MAT_ORIG   > 0 ? t.custoMaterial / BASE_MAT_ORIG   : 1;
  const multLabor = BASE_LABOR_ORIG > 0 ? t.custoMaoObra  / BASE_LABOR_ORIG : 1;
  // Quantidade original era numCasasBanho × 3 — cada peça fica com numCasasBanho
  const qty = Math.max(Math.round(t.quantidade / 3), 1);

  return SANITARIOS_BASE.map(s => ({
    ...t,
    id: v4(),
    tarefa: s.tarefa,
    unidade: 'un.',
    quantidade: qty,
    custoMaterial: Math.round(s.custoMaterialBase * multMat   * 100) / 100,
    custoMaoObra:  Math.round(s.custoMaoObraBase  * multLabor * 100) / 100,
    categoriaFiltro: 'Sanitários',
    tipoMaterial: '',
    materialId: undefined,
  }));
}

// Categorias que devem ser sempre corrigidas, independentemente do valor guardado
const CATEGORIAS_FORCADAS: Record<string, string> = {
  'Vãos':                    'Vãos Exteriores',
  'Portas exteriores':       'Vãos Exteriores',
  'Estores':                 'Vãos Exteriores',
  'Carpintaria — Guardas':   'Guardas',
  'Placa / Fogão':           'Eletrodomésticos',
  'Forno':                   'Eletrodomésticos',
  'Frigorífico':             'Eletrodomésticos',
  'Máquina de lavar loiça':  'Eletrodomésticos',
  'Exaustor':                'Eletrodomésticos',
  'Micro-ondas':             'Eletrodomésticos',
  'Combinado (frio)':        'Eletrodomésticos',
  'Máquina de lavar roupa':  'Eletrodomésticos',
  'Máquina de secar roupa':  'Eletrodomésticos',
};

const TAREFAS_REMOVIDAS = new Set([
  'Instalação elétrica',
  'Águas e esgotos',
  'Canalização',
  'Impermeabilização — Cobertura',
  'Estrutura — Isolamento',
  'Revestimentos — Fachada',
]);

const CAPITULOS_REMOVIDOS = new Set([
  'Estrutura e Envolvente',
]);

function migrarTarefa(t: TarefaCusto): TarefaCusto[] {
  if (TAREFAS_REMOVIDAS.has(t.tarefa)) return [];
  if (CAPITULOS_REMOVIDOS.has(t.capitulo)) return [];
  if (isSanitarios(t.tarefa)) return expandirSanitarios(t);

  const novoNome      = NOMES[t.tarefa] ?? t.tarefa;
  const novaCategoria = CATEGORIAS_FORCADAS[novoNome] ?? t.categoriaFiltro ?? CATEGORIAS[novoNome] ?? undefined;

  // Fix Móveis de cozinha category
  if (novoNome === 'Móveis de cozinha') return [{ ...t, tarefa: novoNome, categoriaFiltro: 'Carpintaria' }];

  return [{ ...t, tarefa: novoNome, categoriaFiltro: novaCategoria }];
}

export function migrarProjetos(projetos: Projeto[]): Projeto[] {
  return projetos.map(p => ({
    ...p,
    tarefas: p.tarefas.flatMap(migrarTarefa),
  }));
}
