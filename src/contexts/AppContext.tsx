import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Projeto, Material, MaoDeObra, TemplateDivisao } from '@/types/project';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface AppContextType {
  projetos: Projeto[];
  materiais: Material[];
  maoDeObra: MaoDeObra[];
  templates: TemplateDivisao[];
  carregando: boolean;
  setProjetos: (p: Projeto[] | ((prev: Projeto[]) => Projeto[])) => void;
  setMateriais: (m: Material[] | ((prev: Material[]) => Material[])) => void;
  adicionarProjeto: (p: Projeto) => void;
  atualizarProjeto: (p: Projeto) => void;
  eliminarProjeto: (id: string) => void;
  duplicarProjeto: (id: string) => void;
  adicionarMaterial: (m: Material) => void;
  importarMateriais: (ms: Material[]) => void;
  atualizarMaterial: (m: Material) => void;
  eliminarMaterial: (id: string) => void;
  adicionarMaoDeObra: (m: MaoDeObra) => void;
  importarMaoDeObra: (ms: MaoDeObra[]) => void;
  atualizarMaoDeObra: (m: MaoDeObra) => void;
  eliminarMaoDeObra: (id: string) => void;
  adicionarTemplate: (t: TemplateDivisao) => void;
  eliminarTemplate: (id: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// --- DB row → TS type mappers ---

function rowToProjeto(row: Record<string, unknown>): Projeto {
  return {
    id: row.id as string,
    nome: row.nome as string,
    criadoEm: row.criado_em as string,
    fracoes: (row.fracoes as Projeto['fracoes']) ?? [],
    tarefas: (row.tarefas as Projeto['tarefas']) ?? [],
    tipo: (row.tipo as Projeto['tipo']) ?? 'estimativa',
    parentId: (row.parent_id as string) ?? null,
    m2AcimaSolo: Number(row.m2_acima_solo) || 0,
    m2AbaixoSolo: Number(row.m2_abaixo_solo) || 0,
    numApartamentos: Number(row.num_apartamentos) || 0,
    m2Retalho: Number(row.m2_retalho) || 0,
    m2AreasComuns: Number(row.m2_areas_comuns) || 0,
    m2Circulacao: Number(row.m2_circulacao) || 0,
    m2AreasTecnicas: Number(row.m2_areas_tecnicas) || 0,
    m2Terracos: Number(row.m2_terracos) || 0,
    unidades: (row.unidades as Projeto['unidades']) ?? [],
  };
}

function rowToMaterial(row: Record<string, unknown>): Material {
  return {
    id: row.id as string,
    nome: row.nome as string,
    referencia: (row.referencia as string) ?? '',
    categoria: row.categoria as string,
    material: row.material as string | undefined,
    gama: row.gama as Material['gama'] | undefined,
    unidade: row.unidade as string,
    precoUnitario: Number(row.preco_unitario),
    fornecedor: (row.fornecedor as string) ?? '',
    notas: (row.notas as string) ?? '',
  };
}

function rowToMaoDeObra(row: Record<string, unknown>): MaoDeObra {
  return {
    id: row.id as string,
    nome: row.nome as string,
    categoria: row.categoria as string,
    unidade: row.unidade as string,
    precoUnitario: Number(row.preco_unitario),
    subcontratado: Boolean(row.subcontratado),
    notas: (row.notas as string) ?? '',
  };
}

function rowToTemplate(row: Record<string, unknown>): TemplateDivisao {
  return {
    id: row.id as string,
    nome: row.nome as string,
    subcapitulo: row.subcapitulo as string,
    criadoEm: row.criado_em as string,
    tarefas: (row.tarefas as TemplateDivisao['tarefas']) ?? [],
  };
}

// --- TS type → DB row mappers ---

function projetoToRow(p: Projeto, userId: string, workspaceId: string | null) {
  return {
    id: p.id,
    user_id: userId,
    workspace_id: workspaceId,
    nome: p.nome,
    criado_em: p.criadoEm,
    fracoes: p.fracoes,
    tarefas: p.tarefas,
    tipo: p.tipo ?? 'estimativa',
    parent_id: p.parentId ?? null,
    m2_acima_solo: p.m2AcimaSolo ?? 0,
    m2_abaixo_solo: p.m2AbaixoSolo ?? 0,
    num_apartamentos: p.numApartamentos ?? 0,
    m2_retalho: p.m2Retalho ?? 0,
    m2_areas_comuns: p.m2AreasComuns ?? 0,
    m2_circulacao: p.m2Circulacao ?? 0,
    m2_areas_tecnicas: p.m2AreasTecnicas ?? 0,
    m2_terracos: p.m2Terracos ?? 0,
    unidades: p.unidades ?? [],
  };
}

function materialToRow(m: Material, userId: string, workspaceId: string | null) {
  return {
    id: m.id,
    user_id: userId,
    workspace_id: workspaceId,
    nome: m.nome,
    referencia: m.referencia,
    categoria: m.categoria,
    material: m.material ?? null,
    gama: m.gama ?? null,
    unidade: m.unidade,
    preco_unitario: m.precoUnitario,
    fornecedor: m.fornecedor,
    notas: m.notas,
  };
}

function maoDeObraToRow(m: MaoDeObra, userId: string, workspaceId: string | null) {
  return {
    id: m.id,
    user_id: userId,
    workspace_id: workspaceId,
    nome: m.nome,
    categoria: m.categoria,
    unidade: m.unidade,
    preco_unitario: m.precoUnitario,
    subcontratado: m.subcontratado,
    notas: m.notas,
  };
}

function templateToRow(t: TemplateDivisao, userId: string, workspaceId: string | null) {
  return {
    id: t.id,
    user_id: userId,
    workspace_id: workspaceId,
    nome: t.nome,
    subcapitulo: t.subcapitulo,
    criado_em: t.criadoEm,
    tarefas: t.tarefas,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [projetos, setProjetosState] = useState<Projeto[]>([]);
  const [materiais, setMateriaisState] = useState<Material[]>([]);
  const [maoDeObraState, setMaoDeObraState] = useState<MaoDeObra[]>([]);
  const [templatesState, setTemplatesState] = useState<TemplateDivisao[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!user) {
      setCarregando(false);
      return;
    }

    let cancelled = false;
    setCarregando(true);

    async function fetchAll() {
      let projetosQ, materiaisQ, maoQ, templatesQ;

      if (activeWorkspace) {
        [projetosQ, materiaisQ, maoQ, templatesQ] = await Promise.all([
          supabase.from('projetos').select('*').eq('workspace_id', activeWorkspace.id),
          supabase.from('materiais').select('*').eq('workspace_id', activeWorkspace.id),
          supabase.from('mao_de_obra').select('*').eq('workspace_id', activeWorkspace.id),
          supabase.from('templates_divisao').select('*').eq('workspace_id', activeWorkspace.id),
        ]);
      } else {
        [projetosQ, materiaisQ, maoQ, templatesQ] = await Promise.all([
          supabase.from('projetos').select('*').eq('user_id', user!.id).is('workspace_id', null),
          supabase.from('materiais').select('*').eq('user_id', user!.id).is('workspace_id', null),
          supabase.from('mao_de_obra').select('*').eq('user_id', user!.id).is('workspace_id', null),
          supabase.from('templates_divisao').select('*').eq('user_id', user!.id).is('workspace_id', null),
        ]);
      }

      if (cancelled) return;

      setProjetosState((projetosQ.data ?? []).map(rowToProjeto));
      setMateriaisState((materiaisQ.data ?? []).map(rowToMaterial));
      setMaoDeObraState((maoQ.data ?? []).map(rowToMaoDeObra));
      setTemplatesState((templatesQ.data ?? []).map(rowToTemplate));
      setCarregando(false);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [user, activeWorkspace]);

  // --- Projetos ---

  const setProjetos = useCallback((p: Projeto[] | ((prev: Projeto[]) => Projeto[])) => {
    setProjetosState((prev) => {
      const next = typeof p === 'function' ? p(prev) : p;
      if (user) {
        supabase
          .from('projetos')
          .upsert(next.map((proj) => projetoToRow(proj, user.id, activeWorkspace?.id ?? null)))
          .then(() => {});
      }
      return next;
    });
  }, [user, activeWorkspace]);

  const adicionarProjeto = useCallback((p: Projeto) => {
    if (!user) return;
    setProjetosState((prev) => [...prev, p]);
    supabase.from('projetos').insert(projetoToRow(p, user.id, activeWorkspace?.id ?? null)).then(() => {});
  }, [user, activeWorkspace]);

  const atualizarProjeto = useCallback((p: Projeto) => {
    if (!user) return;
    setProjetosState((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    supabase.from('projetos').update(projetoToRow(p, user.id, activeWorkspace?.id ?? null)).eq('id', p.id).then(() => {});
  }, [user, activeWorkspace]);

  const eliminarProjeto = useCallback((id: string) => {
    if (!user) return;
    setProjetosState((prev) => prev.filter((x) => x.id !== id));
    supabase.from('projetos').delete().eq('id', id).then(() => {});
  }, [user]);

  const duplicarProjeto = useCallback((id: string) => {
    if (!user) return;
    setProjetosState((prev) => {
      const orig = prev.find((x) => x.id === id);
      if (!orig) return prev;
      const clone: Projeto = {
        ...JSON.parse(JSON.stringify(orig)),
        id: `${Date.now()}-clone`,
        nome: `${orig.nome} (cópia)`,
        criadoEm: new Date().toISOString(),
      };
      supabase.from('projetos').insert(projetoToRow(clone, user!.id, activeWorkspace?.id ?? null)).then(() => {});
      return [...prev, clone];
    });
  }, [user, activeWorkspace]);

  // --- Materiais ---

  const setMateriais = useCallback((m: Material[] | ((prev: Material[]) => Material[])) => {
    setMateriaisState(m);
  }, []);

  const adicionarMaterial = useCallback((m: Material) => {
    if (!user) return;
    setMateriaisState((prev) => [...prev, m]);
    supabase.from('materiais').insert(materialToRow(m, user.id, activeWorkspace?.id ?? null)).then(() => {});
  }, [user, activeWorkspace]);

  const importarMateriais = useCallback((ms: Material[]) => {
    if (!user) return;
    setMateriaisState((prev) => [...prev, ...ms]);
    supabase.from('materiais').insert(ms.map(m => materialToRow(m, user.id, activeWorkspace?.id ?? null))).then(() => {});
  }, [user, activeWorkspace]);

  const atualizarMaterial = useCallback((m: Material) => {
    if (!user) return;
    setMateriaisState((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    supabase.from('materiais').update(materialToRow(m, user.id, activeWorkspace?.id ?? null)).eq('id', m.id).then(() => {});
  }, [user, activeWorkspace]);

  const eliminarMaterial = useCallback((id: string) => {
    if (!user) return;
    setMateriaisState((prev) => prev.filter((x) => x.id !== id));
    supabase.from('materiais').delete().eq('id', id).then(() => {});
  }, [user]);

  // --- Mão de Obra ---

  const adicionarMaoDeObra = useCallback((m: MaoDeObra) => {
    if (!user) return;
    setMaoDeObraState((prev) => [...prev, m]);
    supabase.from('mao_de_obra').insert(maoDeObraToRow(m, user.id, activeWorkspace?.id ?? null)).then(() => {});
  }, [user, activeWorkspace]);

  const importarMaoDeObra = useCallback((ms: MaoDeObra[]) => {
    if (!user) return;
    setMaoDeObraState((prev) => [...prev, ...ms]);
    supabase.from('mao_de_obra').insert(ms.map(m => maoDeObraToRow(m, user.id, activeWorkspace?.id ?? null))).then(() => {});
  }, [user, activeWorkspace]);

  const atualizarMaoDeObra = useCallback((m: MaoDeObra) => {
    if (!user) return;
    setMaoDeObraState((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    supabase.from('mao_de_obra').update(maoDeObraToRow(m, user.id, activeWorkspace?.id ?? null)).eq('id', m.id).then(() => {});
  }, [user, activeWorkspace]);

  const eliminarMaoDeObra = useCallback((id: string) => {
    if (!user) return;
    setMaoDeObraState((prev) => prev.filter((x) => x.id !== id));
    supabase.from('mao_de_obra').delete().eq('id', id).then(() => {});
  }, [user]);

  // --- Templates ---

  const adicionarTemplate = useCallback((t: TemplateDivisao) => {
    if (!user) return;
    setTemplatesState((prev) => [...prev, t]);
    supabase.from('templates_divisao').insert(templateToRow(t, user.id, activeWorkspace?.id ?? null)).then(() => {});
  }, [user, activeWorkspace]);

  const eliminarTemplate = useCallback((id: string) => {
    if (!user) return;
    setTemplatesState((prev) => prev.filter((x) => x.id !== id));
    supabase.from('templates_divisao').delete().eq('id', id).then(() => {});
  }, [user]);

  return (
    <AppContext.Provider value={{
      projetos,
      materiais,
      maoDeObra: maoDeObraState,
      templates: templatesState,
      carregando,
      setProjetos,
      setMateriais,
      adicionarProjeto,
      atualizarProjeto,
      eliminarProjeto,
      duplicarProjeto,
      adicionarMaterial,
      importarMateriais,
      atualizarMaterial,
      eliminarMaterial,
      adicionarMaoDeObra,
      importarMaoDeObra,
      atualizarMaoDeObra,
      eliminarMaoDeObra,
      adicionarTemplate,
      eliminarTemplate,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
