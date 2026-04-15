import { Fracao, TarefaCusto, NivelQualidade, Divisao, TipoFracao } from '@/types/project';
import { v4 } from '@/lib/utils';

function paredesArea(d: Divisao) {
  return 4 * Math.sqrt(d.area) * (d.peDireito ?? 2.7);
}

function computeAreas(divisoes: Divisao[]) {
  const a = {
    sala: 0, salaParedes: 0,
    quartos: 0, quartosParedes: 0, numQuartos: 0,
    casasBanho: 0, casasBanhoParedes: 0, numCasasBanho: 0,
    cozinha: 0, cozinhaParedes: 0,
    varandas: 0,
    circulacao: 0, circulacaoParedes: 0,
    zonaExterior: 0,
  };
  for (const d of divisoes) {
    if (d.tipo === 'Sala') { a.sala += d.area; a.salaParedes += paredesArea(d); }
    else if (d.tipo === 'Quarto') { a.quartos += d.area; a.quartosParedes += paredesArea(d); a.numQuartos++; }
    else if (d.tipo === 'Casa de Banho') { a.casasBanho += d.area; a.casasBanhoParedes += paredesArea(d); a.numCasasBanho++; }
    else if (d.tipo === 'Cozinha') { a.cozinha += d.area; a.cozinhaParedes += paredesArea(d); }
    else if (d.tipo === 'Varanda') a.varandas += d.area;
    else if (d.tipo === 'Circulação') { a.circulacao += d.area; a.circulacaoParedes += paredesArea(d); }
    else if (d.tipo === 'Zona Exterior') a.zonaExterior += d.area;
  }
  return a;
}

export const MULTIPLICADORES_QUALIDADE: Record<NivelQualidade, number> = {
  'Básico': 1.0,
  'Médio': 1.35,
  'Premium': 1.85,
};

export type TemplateTask = {
  tarefa: string;
  unidade: string;
  categoriaFiltro: string;
  custoMaterialBase: number;
  custoMaoObraBase: number;
  margemBase: number;
};

interface TarefaTemplate {
  capitulo: string;
  subcapitulo: string;
  tarefa: string;
  unidade: string;
  areaKey: keyof typeof areaMultipliers;
  categoriaFiltro: string;
  custoMaterialBase: number;
  custoMaoObraBase: number;
  margemBase: number;
  qtyMultiplier?: number;    // for 'un.' with casasBanho: multiplier per bathroom (default 1)
  areaMultiplier?: number;   // multiplicador extra sobre a área (ex: 1.2 para impermeabilização)
}

const areaMultipliers = {
  casasBanho: 'casasBanho' as const,
  casasBanhoParedes: 'casasBanhoParedes' as const,
  cozinha: 'cozinha' as const,
  cozinhaParedes: 'cozinhaParedes' as const,
  sala: 'sala' as const,
  salaParedes: 'salaParedes' as const,
  quartos: 'quartos' as const,
  quartosParedes: 'quartosParedes' as const,
  varandas: 'varandas' as const,
  circulacao: 'circulacao' as const,
  circulacaoParedes: 'circulacaoParedes' as const,
  zonaExterior: 'zonaExterior' as const,
  total: 'total' as const,
};

const templates: TarefaTemplate[] = [
  // Casa de Banho
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Impermeabilização',           unidade: 'm²',  areaKey: 'casasBanho', categoriaFiltro: 'Impermeabilização', custoMaterialBase: 12,  custoMaoObraBase: 8,   margemBase: 15, areaMultiplier: 1.2 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Revestimentos — Paredes',     unidade: 'm²',  areaKey: 'casasBanhoParedes', categoriaFiltro: 'Revestimentos',     custoMaterialBase: 25,  custoMaoObraBase: 18,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Revestimentos — Pavimento',   unidade: 'm²',  areaKey: 'casasBanho', categoriaFiltro: 'Revestimentos',     custoMaterialBase: 22,  custoMaoObraBase: 15,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Lavatório',                   unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',        custoMaterialBase: 200, custoMaoObraBase: 80,  margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Sanita',                      unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',        custoMaterialBase: 220, custoMaoObraBase: 80,  margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Base de Duche',               unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',        custoMaterialBase: 350, custoMaoObraBase: 150, margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Resguardo',                   unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',        custoMaterialBase: 250, custoMaoObraBase: 80,  margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Chuveiro, misturadora de duche', unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',     custoMaterialBase: 180, custoMaoObraBase: 60,  margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Banheira',                    unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',        custoMaterialBase: 600, custoMaoObraBase: 200, margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Bidé',                        unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',        custoMaterialBase: 150, custoMaoObraBase: 60,  margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Torneiras e acessórios',      unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',        custoMaterialBase: 120, custoMaoObraBase: 50,  margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Espelho',                     unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Sanitários',        custoMaterialBase: 120, custoMaoObraBase: 30,  margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Vãos Interiores',             unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Vãos Interiores',   custoMaterialBase: 280, custoMaoObraBase: 100, margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Carpintaria interior',        unidade: 'un.', areaKey: 'casasBanho', categoriaFiltro: 'Carpintaria',       custoMaterialBase: 300, custoMaoObraBase: 120, margemBase: 15, qtyMultiplier: 1 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Tetos',                       unidade: 'm²',  areaKey: 'casasBanho', categoriaFiltro: 'Pintura',           custoMaterialBase: 8,   custoMaoObraBase: 6,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Rodapés',                     unidade: 'ml',  areaKey: 'casasBanho', categoriaFiltro: 'Carpintaria',       custoMaterialBase: 15,  custoMaoObraBase: 8,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Casa de Banho', tarefa: 'Pintura',                     unidade: 'm²',  areaKey: 'casasBanho', categoriaFiltro: 'Pintura',           custoMaterialBase: 5,   custoMaoObraBase: 7,   margemBase: 15 },
  // Cozinha
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Revestimentos — Pavimento',   unidade: 'm²',  areaKey: 'cozinha', categoriaFiltro: 'Revestimentos', custoMaterialBase: 20,   custoMaoObraBase: 12,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Revestimentos — Paredes',    unidade: 'm²',  areaKey: 'cozinhaParedes', categoriaFiltro: 'Revestimentos', custoMaterialBase: 22,   custoMaoObraBase: 15,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Móveis de cozinha',          unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Carpintaria',   custoMaterialBase: 3500, custoMaoObraBase: 800, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Bancada de cozinha',         unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Equipamentos',  custoMaterialBase: 800,  custoMaoObraBase: 200, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Placa / Fogão',              unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 500,  custoMaoObraBase: 80,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Forno',                      unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 600,  custoMaoObraBase: 80,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Frigorífico',                unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 800,  custoMaoObraBase: 0,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Máquina de lavar loiça',     unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 600,  custoMaoObraBase: 100, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Exaustor',                   unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 300,  custoMaoObraBase: 80,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Micro-ondas',                unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 250,  custoMaoObraBase: 0,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Combinado (frio)',           unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 1200, custoMaoObraBase: 0,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Máquina de lavar roupa',    unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 700,  custoMaoObraBase: 100, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Máquina de secar roupa',    unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Eletrodomésticos', custoMaterialBase: 700,  custoMaoObraBase: 80,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Lava-loiça',                unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Sanitários',    custoMaterialBase: 250,  custoMaoObraBase: 120, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Vãos Interiores',           unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Vãos Interiores', custoMaterialBase: 280,  custoMaoObraBase: 100, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Carpintaria interior',       unidade: 'vg.', areaKey: 'cozinha', categoriaFiltro: 'Carpintaria',    custoMaterialBase: 350,  custoMaoObraBase: 150, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Tetos',                      unidade: 'm²',  areaKey: 'cozinha', categoriaFiltro: 'Pintura',         custoMaterialBase: 8,    custoMaoObraBase: 6,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Cozinha', tarefa: 'Rodapés',                    unidade: 'ml',  areaKey: 'cozinha', categoriaFiltro: 'Carpintaria',     custoMaterialBase: 15,   custoMaoObraBase: 8,   margemBase: 15 },
  // Sala
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Revestimentos — Pavimento', unidade: 'm²',  areaKey: 'sala', categoriaFiltro: 'Revestimentos', custoMaterialBase: 18,  custoMaoObraBase: 10,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Pintura',                    unidade: 'm²',  areaKey: 'sala', categoriaFiltro: 'Pintura',       custoMaterialBase: 5,   custoMaoObraBase: 7,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Instalação elétrica',        unidade: 'vg.', areaKey: 'sala', categoriaFiltro: 'Elétrica',      custoMaterialBase: 150, custoMaoObraBase: 250, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Vãos Interiores',           unidade: 'vg.', areaKey: 'sala', categoriaFiltro: 'Vãos Interiores', custoMaterialBase: 280, custoMaoObraBase: 100, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Carpintaria interior',       unidade: 'vg.', areaKey: 'sala', categoriaFiltro: 'Carpintaria',    custoMaterialBase: 400, custoMaoObraBase: 300, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Tetos',                      unidade: 'm²',  areaKey: 'sala', categoriaFiltro: 'Pintura',         custoMaterialBase: 8,   custoMaoObraBase: 6,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Sala', tarefa: 'Rodapés',                    unidade: 'ml',  areaKey: 'sala', categoriaFiltro: 'Carpintaria',     custoMaterialBase: 15,  custoMaoObraBase: 8,   margemBase: 15 },
  // Quartos
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Revestimentos — Pavimento', unidade: 'm²',  areaKey: 'quartos', categoriaFiltro: 'Revestimentos', custoMaterialBase: 18,  custoMaoObraBase: 10,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Pintura',                   unidade: 'm²',  areaKey: 'quartos', categoriaFiltro: 'Pintura',       custoMaterialBase: 5,   custoMaoObraBase: 7,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Instalação elétrica',       unidade: 'vg.', areaKey: 'quartos', categoriaFiltro: 'Elétrica',      custoMaterialBase: 150, custoMaoObraBase: 250, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Vãos Interiores',          unidade: 'un.', areaKey: 'quartos', categoriaFiltro: 'Vãos Interiores', custoMaterialBase: 280, custoMaoObraBase: 100, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Carpintaria interior',      unidade: 'vg.', areaKey: 'quartos', categoriaFiltro: 'Carpintaria',    custoMaterialBase: 600, custoMaoObraBase: 400, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Tetos',                     unidade: 'm²',  areaKey: 'quartos', categoriaFiltro: 'Pintura',         custoMaterialBase: 8,   custoMaoObraBase: 6,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Quartos', tarefa: 'Rodapés',                   unidade: 'ml',  areaKey: 'quartos', categoriaFiltro: 'Carpintaria',     custoMaterialBase: 15,  custoMaoObraBase: 8,   margemBase: 15 },
  // Varandas
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Varandas', tarefa: 'Impermeabilização',           unidade: 'm²',  areaKey: 'varandas', categoriaFiltro: 'Impermeabilização', custoMaterialBase: 15,  custoMaoObraBase: 10,  margemBase: 15, areaMultiplier: 1.2 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Varandas', tarefa: 'Revestimentos — Pavimento',   unidade: 'm²',  areaKey: 'varandas', categoriaFiltro: 'Revestimentos',     custoMaterialBase: 20,  custoMaoObraBase: 12,  margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Varandas', tarefa: 'Carpintaria — Guardas',       unidade: 'ml',  areaKey: 'varandas', categoriaFiltro: 'Guardas',           custoMaterialBase: 80,  custoMaoObraBase: 45,  margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Varandas', tarefa: 'Carpintaria interior',        unidade: 'vg.', areaKey: 'varandas', categoriaFiltro: 'Carpintaria',       custoMaterialBase: 400, custoMaoObraBase: 150, margemBase: 15 },
  // Circulação
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Revestimentos — Pavimento', unidade: 'm²',  areaKey: 'circulacao', categoriaFiltro: 'Revestimentos', custoMaterialBase: 18,  custoMaoObraBase: 10,  margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Pintura',                   unidade: 'm²',  areaKey: 'circulacao', categoriaFiltro: 'Pintura',       custoMaterialBase: 5,   custoMaoObraBase: 7,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Instalação elétrica',       unidade: 'vg.', areaKey: 'circulacao', categoriaFiltro: 'Elétrica',      custoMaterialBase: 100, custoMaoObraBase: 180, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Vãos Interiores',          unidade: 'vg.', areaKey: 'circulacao', categoriaFiltro: 'Vãos Interiores', custoMaterialBase: 280, custoMaoObraBase: 100, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Carpintaria interior',      unidade: 'vg.', areaKey: 'circulacao', categoriaFiltro: 'Carpintaria',    custoMaterialBase: 350, custoMaoObraBase: 150, margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Tetos',                     unidade: 'm²',  areaKey: 'circulacao', categoriaFiltro: 'Pintura',         custoMaterialBase: 8,   custoMaoObraBase: 6,   margemBase: 15 },
  { capitulo: 'Acabamentos Interiores', subcapitulo: 'Circulação', tarefa: 'Rodapés',                   unidade: 'ml',  areaKey: 'circulacao', categoriaFiltro: 'Carpintaria',     custoMaterialBase: 15,  custoMaoObraBase: 8,   margemBase: 15 },
  // Zona Exterior
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Vãos',          tarefa: 'Vãos',                      unidade: 'un.', areaKey: 'total',        categoriaFiltro: 'Vãos Exteriores',          custoMaterialBase: 120, custoMaoObraBase: 60,  margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Vãos',          tarefa: 'Portas exteriores',         unidade: 'un.', areaKey: 'total',        categoriaFiltro: 'Vãos Exteriores',          custoMaterialBase: 800, custoMaoObraBase: 200, margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Vãos',          tarefa: 'Estores',                   unidade: 'un.', areaKey: 'total',        categoriaFiltro: 'Vãos Exteriores',          custoMaterialBase: 35,  custoMaoObraBase: 15,  margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Zona Exterior', tarefa: 'Revestimentos — Pavimento', unidade: 'm²',  areaKey: 'zonaExterior', categoriaFiltro: 'Revestimentos', custoMaterialBase: 22,  custoMaoObraBase: 14,  margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Zona Exterior', tarefa: 'Elétrica — Iluminação',     unidade: 'vg.', areaKey: 'zonaExterior', categoriaFiltro: 'Elétrica',      custoMaterialBase: 200, custoMaoObraBase: 150, margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Zona Exterior', tarefa: 'Estrutura — Vedação',       unidade: 'ml',  areaKey: 'zonaExterior', categoriaFiltro: 'Estrutura',     custoMaterialBase: 90,  custoMaoObraBase: 55,  margemBase: 15 },
  { capitulo: 'Acabamentos Exteriores', subcapitulo: 'Zona Exterior', tarefa: 'Arranjos exteriores',       unidade: 'm²',  areaKey: 'zonaExterior', categoriaFiltro: 'Outros',        custoMaterialBase: 12,  custoMaoObraBase: 10,  margemBase: 15 },
];

const WALL_AREA_KEYS = new Set(['casasBanhoParedes', 'cozinhaParedes', 'salaParedes', 'quartosParedes', 'circulacaoParedes']);

function areaBaseParaKey(areaKey: string, areas: ReturnType<typeof computeAreas>): number {
  if (areaKey === 'total') {
    const { numQuartos, numCasasBanho, ...areaValues } = areas;
    return Object.values(areaValues).reduce((s, v) => s + v, 0);
  }
  if (WALL_AREA_KEYS.has(areaKey)) {
    // Verifica a área de pavimento correspondente (ex: casasBanhoParedes → casasBanho)
    const baseKey = areaKey.replace('Paredes', '') as keyof typeof areas;
    return (areas[baseKey as keyof typeof areas] as number) ?? 0;
  }
  return (areas[areaKey as keyof typeof areas] as number) ?? 0;
}

function getQuantidade(template: TarefaTemplate, areas: ReturnType<typeof computeAreas>): number {
  if (template.unidade === 'vg.') return 1;
  if (template.areaKey === 'total') {
    const { numQuartos, numCasasBanho, ...areaValues } = areas;
    const total = Object.values(areaValues).reduce((s, v) => s + v, 0);
    // For unit-based total items (e.g. windows), estimate from room count
    if (template.unidade === 'un.') return Math.max(numQuartos + numCasasBanho + 2, 1);
    return Math.max(total * 0.3, 1);
  }
  // Wall area keys — always m², return the computed wall area directly
  if (WALL_AREA_KEYS.has(template.areaKey)) {
    const area = areas[template.areaKey as keyof typeof areas] as number;
    return Math.max(Math.round(area * 10) / 10, 1);
  }
  const area = areas[template.areaKey as keyof typeof areas] as number;
  if (template.unidade === 'un.') {
    if (template.areaKey === 'casasBanho') return Math.max(areas.numCasasBanho * (template.qtyMultiplier ?? 1), 1);
    if (template.areaKey === 'quartos') return Math.max(areas.numQuartos, 1);
    return Math.max(Math.ceil(area / 5), 1);
  }
  if (template.unidade === 'ml') return Math.max(Math.ceil(Math.sqrt(area) * 4), 1);
  return Math.max(Math.round(area * (template.areaMultiplier ?? 1) * 10) / 10, 1);
}

const zonaComumTemplates: TarefaTemplate[] = [
  { capitulo: 'Zonas Comuns', subcapitulo: 'Zona Comum', tarefa: 'Revestimentos — Pavimento', unidade: 'm²',  areaKey: 'sala', categoriaFiltro: 'Revestimentos', custoMaterialBase: 18,  custoMaoObraBase: 10,  margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Zona Comum', tarefa: 'Pintura',                    unidade: 'm²',  areaKey: 'sala', categoriaFiltro: 'Pintura',       custoMaterialBase: 5,   custoMaoObraBase: 7,   margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Zona Comum', tarefa: 'Instalação elétrica',        unidade: 'vg.', areaKey: 'sala', categoriaFiltro: 'Elétrica',      custoMaterialBase: 150, custoMaoObraBase: 250, margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Zona Comum', tarefa: 'Vãos Interiores',            unidade: 'vg.', areaKey: 'sala', categoriaFiltro: 'Vãos Interiores', custoMaterialBase: 280, custoMaoObraBase: 100, margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Zona Comum', tarefa: 'Carpintaria interior',       unidade: 'vg.', areaKey: 'sala', categoriaFiltro: 'Carpintaria',    custoMaterialBase: 400, custoMaoObraBase: 300, margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Zona Comum', tarefa: 'Tetos',                      unidade: 'm²',  areaKey: 'sala', categoriaFiltro: 'Pintura',        custoMaterialBase: 8,   custoMaoObraBase: 6,   margemBase: 15 },
  { capitulo: 'Zonas Comuns', subcapitulo: 'Zona Comum', tarefa: 'Rodapés',                    unidade: 'ml',  areaKey: 'sala', categoriaFiltro: 'Carpintaria',    custoMaterialBase: 15,  custoMaoObraBase: 8,   margemBase: 15 },
];

// Mapeia cada tipo de divisão para o subcapítulo dos templates
const TIPO_SUBCAPITULO: Record<string, string> = {
  'Casa de Banho': 'Casa de Banho',
  'Cozinha':       'Cozinha',
  'Sala':          'Sala',
  'Quarto':        'Quartos',
  'Varanda':       'Varandas',
  'Circulação':    'Circulação',
  'Zona Exterior': 'Zona Exterior',
};

// Mapeia cada tipo de divisão para os areaKeys que preenche
const TIPO_AREA_KEYS: Record<string, string[]> = {
  'Casa de Banho': ['casasBanho', 'casasBanhoParedes'],
  'Cozinha':       ['cozinha', 'cozinhaParedes'],
  'Sala':          ['sala', 'salaParedes'],
  'Quarto':        ['quartos', 'quartosParedes'],
  'Varanda':       ['varandas'],
  'Circulação':    ['circulacao', 'circulacaoParedes'],
  'Zona Exterior': ['zonaExterior'],
};

function makeTarefa(t: TarefaTemplate, areas: ReturnType<typeof computeAreas>, mult: number, subcapitulo: string, fracaoId: string): TarefaCusto {
  return {
    id: v4(),
    capitulo: t.capitulo,
    subcapitulo,
    tarefa: t.tarefa,
    unidade: t.unidade,
    quantidade: getQuantidade(t, areas),
    custoMaterial: Math.round(t.custoMaterialBase * mult * 100) / 100,
    custoMaoObra:  Math.round(t.custoMaoObraBase  * mult * 100) / 100,
    margemEmpreiteiro: t.margemBase,
    categoriaFiltro: t.categoriaFiltro,
    tipoMaterial: '',
    fornecedor: '',
    notas: '',
    fracaoId,
  };
}

export function gerarTarefas(fracao: Fracao): TarefaCusto[] {
  const mult = MULTIPLICADORES_QUALIDADE[fracao.qualidade];

  // Zona Comum — tratamento especial (uma única "sala")
  if (fracao.tipo === 'ZonaComum') {
    const areas = computeAreas(fracao.divisoes);
    return zonaComumTemplates
      .filter(t => areaBaseParaKey(t.areaKey, areas) > 0)
      .map(t => makeTarefa(t, areas, mult, fracao.nome, fracao.id));
  }

  const result: TarefaCusto[] = [];

  // Contar divisões por tipo para saber se numerar
  const countByTipo: Record<string, number> = {};
  for (const d of fracao.divisoes) countByTipo[d.tipo] = (countByTipo[d.tipo] ?? 0) + 1;
  const indexByTipo: Record<string, number> = {};

  // Templates que dependem de uma divisão específica (não 'total')
  const divisaoTemplates = templates.filter(t => t.areaKey !== 'total');

  for (const divisao of fracao.divisoes) {
    const subcapBase = TIPO_SUBCAPITULO[divisao.tipo];
    const allowedKeys = TIPO_AREA_KEYS[divisao.tipo];
    if (!subcapBase || !allowedKeys) continue;

    indexByTipo[divisao.tipo] = (indexByTipo[divisao.tipo] ?? 0) + 1;
    const idx = indexByTipo[divisao.tipo];
    const subcap = countByTipo[divisao.tipo] > 1 ? `${subcapBase} ${idx}` : subcapBase;

    const singleAreas = computeAreas([divisao]);

    divisaoTemplates
      .filter(t => allowedKeys.includes(t.areaKey))
      .filter(t => areaBaseParaKey(t.areaKey, singleAreas) > 0)
      .map(t => makeTarefa(t, singleAreas, mult, subcap, fracao.id))
      .forEach(t => result.push(t));
  }

  // Templates de nível de fração (Vãos, Portas exteriores, Estores)
  const allAreas = computeAreas(fracao.divisoes);
  templates
    .filter(t => t.areaKey === 'total')
    .filter(t => areaBaseParaKey(t.areaKey, allAreas) > 0)
    .map(t => makeTarefa(t, allAreas, mult, t.subcapitulo, fracao.id))
    .forEach(t => result.push(t));

  return result;
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

export function normalizarSubcapitulo(subcapitulo: string): string {
  return subcapitulo.replace(/ \d+$/, '');
}

export function getTemplatesSubcapitulo(subcapitulo: string): TemplateTask[] {
  const base = normalizarSubcapitulo(subcapitulo);
  return templates
    .filter(t => t.subcapitulo === base)
    .map(t => ({
      tarefa: t.tarefa,
      unidade: t.unidade,
      categoriaFiltro: t.categoriaFiltro,
      custoMaterialBase: t.custoMaterialBase,
      custoMaoObraBase: t.custoMaoObraBase,
      margemBase: t.margemBase,
    }));
}
