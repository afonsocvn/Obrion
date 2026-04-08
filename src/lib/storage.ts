import { Projeto, Material } from '@/types/project';

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
