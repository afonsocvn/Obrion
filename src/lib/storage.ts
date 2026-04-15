import { Projeto, Material, MaoDeObra, TemplateDivisao } from '@/types/project';

const PROJETOS_KEY = 'constru-plan-projetos';
const MATERIAIS_KEY = 'constru-plan-materiais';

export function carregarProjetos(): Projeto[] {
  try {
    const data = localStorage.getItem(PROJETOS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function guardarProjetos(projetos: Projeto[]) {
  localStorage.setItem(PROJETOS_KEY, JSON.stringify(projetos));
}

export function carregarMateriais(): Material[] {
  try {
    const data = localStorage.getItem(MATERIAIS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function guardarMateriais(materiais: Material[]) {
  localStorage.setItem(MATERIAIS_KEY, JSON.stringify(materiais));
}

const MAO_DE_OBRA_KEY = 'constru-plan-mao-de-obra';

export function carregarMaoDeObra(): MaoDeObra[] {
  try {
    const data = localStorage.getItem(MAO_DE_OBRA_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function guardarMaoDeObra(lista: MaoDeObra[]) {
  localStorage.setItem(MAO_DE_OBRA_KEY, JSON.stringify(lista));
}

const TEMPLATES_KEY = 'constru-plan-templates-divisao';

export function carregarTemplates(): TemplateDivisao[] {
  try {
    const data = localStorage.getItem(TEMPLATES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function guardarTemplates(lista: TemplateDivisao[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(lista));
}
