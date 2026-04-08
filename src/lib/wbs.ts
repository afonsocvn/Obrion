import { Fracao, TarefaCusto, NivelQualidade } from '@/types/project';
import { v4 } from '@/lib/utils';

const MULTIPLICADORES_QUALIDADE: Record<NivelQualidade, number> = {
  'Básico': 1.0,
  'Médio': 1.35,
  'Premium': 1.85,
};

interface TarefaTemplate {
  capitulo: string;
  subcapitulo: string;
  tarefa: string;
  unidade: string;
  areaKey: keyof typeof areaMultipliers;
  custoMaterialBase: number;
  custoMaoObraBase: number;
  margemBase: number;
}

const areaMultipliers = {
  casasBanho: 'casasBanho' as const,
  cozinha: 'cozinha' as const,
  sala: 'sala' as const,
  quartos: 'quartos' as const,
  varandas: 'varandas' as const,
  circulacao: 'circulacao' as const,
  zonaExterior: 'zonaExterior' as const,
  total: 'total' as const,
};

const templates: TarefaTemplate[] = [
  // Casa de banho
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Impermeabilização', unidade: 'm²', areaKey: 'casasBanho', custoMaterialBase: 12, custoMaoObraBase: 8, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Revestimento cerâmico - paredes', unidade: 'm²', areaKey: 'casasBanho', custoMaterialBase: 25, custoMaoObraBase: 18, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Revestimento cerâmico - pavimento', unidade: 'm²', areaKey: 'casasBanho', custoMaterialBase: 22, custoMaoObraBase: 15, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Instalação de sanitários', unidade: 'un.', areaKey: 'casasBanho', custoMaterialBase: 350, custoMaoObraBase: 120, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Pintura', unidade: 'm²', areaKey: 'casasBanho', custoMaterialBase: 5, custoMaoObraBase: 7, margemBase: 15 },
  // Cozinha
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Pavimento', unidade: 'm²', areaKey: 'cozinha', custoMaterialBase: 20, custoMaoObraBase: 12, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Instalação de móveis de cozinha', unidade: 'vg.', areaKey: 'cozinha', custoMaterialBase: 3500, custoMaoObraBase: 800, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Trabalhos elétricos', unidade: 'vg.', areaKey: 'cozinha', custoMaterialBase: 200, custoMaoObraBase: 350, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Canalização', unidade: 'vg.', areaKey: 'cozinha', custoMaterialBase: 180, custoMaoObraBase: 300, margemBase: 15 },
  // Sala
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Pavimento', unidade: 'm²', areaKey: 'sala', custoMaterialBase: 18, custoMaoObraBase: 10, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Pintura', unidade: 'm²', areaKey: 'sala', custoMaterialBase: 5, custoMaoObraBase: 7, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Trabalhos elétricos', unidade: 'vg.', areaKey: 'sala', custoMaterialBase: 150, custoMaoObraBase: 250, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Carpintaria interior', unidade: 'vg.', areaKey: 'sala', custoMaterialBase: 400, custoMaoObraBase: 300, margemBase: 15 },
  // Quartos
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Pavimento', unidade: 'm²', areaKey: 'quartos', custoMaterialBase: 18, custoMaoObraBase: 10, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Pintura', unidade: 'm²', areaKey: 'quartos', custoMaterialBase: 5, custoMaoObraBase: 7, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Trabalhos elétricos', unidade: 'vg.', areaKey: 'quartos', custoMaterialBase: 150, custoMaoObraBase: 250, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Carpintaria interior (portas, roupeiros, rodapés)', unidade: 'vg.', areaKey: 'quartos', custoMaterialBase: 600, custoMaoObraBase: 400, margemBase: 15 },
  // Varandas
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Varandas', tarefa: 'Impermeabilização', unidade: 'm²', areaKey: 'varandas', custoMaterialBase: 15, custoMaoObraBase: 10, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Varandas', tarefa: 'Revestimento pavimento', unidade: 'm²', areaKey: 'varandas', custoMaterialBase: 20, custoMaoObraBase: 12, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Varandas', tarefa: 'Guardas e acabamentos', unidade: 'ml', areaKey: 'varandas', custoMaterialBase: 80, custoMaoObraBase: 45, margemBase: 15 },
  // Circulação
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Pavimento', unidade: 'm²', areaKey: 'circulacao', custoMaterialBase: 18, custoMaoObraBase: 10, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Pintura', unidade: 'm²', areaKey: 'circulacao', custoMaterialBase: 5, custoMaoObraBase: 7, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Trabalhos elétricos', unidade: 'vg.', areaKey: 'circulacao', custoMaterialBase: 100, custoMaoObraBase: 180, margemBase: 15 },
  // Zona Exterior
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Zona Exterior', tarefa: 'Pavimento exterior', unidade: 'm²', areaKey: 'zonaExterior', custoMaterialBase: 22, custoMaoObraBase: 14, margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Zona Exterior', tarefa: 'Iluminação exterior', unidade: 'vg.', areaKey: 'zonaExterior', custoMaterialBase: 200, custoMaoObraBase: 150, margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Zona Exterior', tarefa: 'Vedação e portões', unidade: 'ml', areaKey: 'zonaExterior', custoMaterialBase: 90, custoMaoObraBase: 55, margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Zona Exterior', tarefa: 'Arranjos exteriores e jardim', unidade: 'm²', areaKey: 'zonaExterior', custoMaterialBase: 12, custoMaoObraBase: 10, margemBase: 15 },
  // Estrutura e zonas comuns
  { capitulo: 'Estrutura e Envolvente', subcapitulo: 'Cobertura', tarefa: 'Impermeabilização de cobertura', unidade: 'm²', areaKey: 'total', custoMaterialBase: 18, custoMaoObraBase: 12, margemBase: 15 },
  { capitulo: 'Estrutura e Envolvente', subcapitulo: 'Cobertura', tarefa: 'Isolamento térmico', unidade: 'm²', areaKey: 'total', custoMaterialBase: 14, custoMaoObraBase: 8, margemBase: 15 },
  { capitulo: 'Estrutura e Envolvente', subcapitulo: 'Fachada', tarefa: 'Revestimento exterior', unidade: 'm²', areaKey: 'total', custoMaterialBase: 35, custoMaoObraBase: 25, margemBase: 15 },
  { capitulo: 'Estrutura e Envolvente', subcapitulo: 'Fachada', tarefa: 'Caixilharia exterior', unidade: 'm²', areaKey: 'total', custoMaterialBase: 120, custoMaoObraBase: 60, margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Acessos', tarefa: 'Pavimento zonas comuns', unidade: 'm²', areaKey: 'total', custoMaterialBase: 22, custoMaoObraBase: 14, margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Acessos', tarefa: 'Pintura zonas comuns', unidade: 'm²', areaKey: 'total', custoMaterialBase: 5, custoMaoObraBase: 7, margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Acessos', tarefa: 'Iluminação e elétrica', unidade: 'vg.', areaKey: 'total', custoMaterialBase: 500, custoMaoObraBase: 400, margemBase: 15 },
];

function getQuantidade(template: TarefaTemplate, fracao: Fracao): number {
  if (template.areaKey === 'total') {
    const { numQuartos, numCasasBanho, ...areaValues } = fracao.areas;
    const total = Object.values(areaValues).reduce((s, v) => s + v, 0);
    return Math.max(total * 0.3, 1);
  }
  const area = fracao.areas[template.areaKey as keyof typeof fracao.areas];
  if (template.unidade === 'vg.') return 1;
  if (template.unidade === 'un.') {
    // Use actual count for rooms/bathrooms
    if (template.areaKey === 'casasBanho') return Math.max(fracao.areas.numCasasBanho * 3, 1);
    if (template.areaKey === 'quartos') return Math.max(fracao.areas.numQuartos, 1);
    return Math.max(Math.ceil(area / 5), 1);
  }
  if (template.unidade === 'ml') return Math.max(Math.ceil(Math.sqrt(area) * 4), 1);
  return Math.max(area, 1);
}

export function gerarTarefas(fracao: Fracao): TarefaCusto[] {
  const mult = MULTIPLICADORES_QUALIDADE[fracao.qualidade];
  
  return templates.map((t) => {
    const qtd = getQuantidade(t, fracao);
    return {
      id: v4(),
      capitulo: t.capitulo,
      subcapitulo: t.subcapitulo,
      tarefa: t.tarefa,
      unidade: t.unidade,
      quantidade: qtd,
      custoMaterial: Math.round(t.custoMaterialBase * mult * 100) / 100,
      custoMaoObra: Math.round(t.custoMaoObraBase * mult * 100) / 100,
      margemEmpreiteiro: t.margemBase,
      fornecedor: '',
      notas: '',
      fracaoId: fracao.id,
    };
  });
}

export function calcularCustoTarefa(t: TarefaCusto): number {
  return (t.custoMaterial + t.custoMaoObra) * t.quantidade * (1 + t.margemEmpreiteiro / 100);
}

export function calcularResumo(tarefas: TarefaCusto[]) {
  let totalMaterial = 0;
  let totalMaoObra = 0;
  let totalMargem = 0;

  tarefas.forEach((t) => {
    const baseMat = t.custoMaterial * t.quantidade;
    const baseMO = t.custoMaoObra * t.quantidade;
    const base = baseMat + baseMO;
    const margem = base * (t.margemEmpreiteiro / 100);
    totalMaterial += baseMat;
    totalMaoObra += baseMO;
    totalMargem += margem;
  });

  return {
    totalMaterial,
    totalMaoObra,
    totalMargem,
    total: totalMaterial + totalMaoObra + totalMargem,
  };
}
