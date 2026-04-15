import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Projeto, Material, MaoDeObra, TemplateDivisao } from '@/types/project';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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
  atualizarMaterial: (m: Material) => void;
  eliminarMaterial: (id: string) => void;
  adicionarMaoDeObra: (m: MaoDeObra) => void;
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

function projetoToRow(p: Projeto, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    nome: p.nome,
    criado_em: p.criadoEm,
    fracoes: p.fracoes,
    tarefas: p.tarefas,
  };
}

function materialToRow(m: Material, userId: string) {
  return {
    id: m.id,
    user_id: userId,
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

function maoDeObraToRow(m: MaoDeObra, userId: string) {
  return {
    id: m.id,
    user_id: userId,
    nome: m.nome,
    categoria: m.categoria,
    unidade: m.unidade,
    preco_unitario: m.precoUnitario,
    subcontratado: m.subcontratado,
    notas: m.notas,
  };
}

function templateToRow(t: TemplateDivisao, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    nome: t.nome,
    subcapitulo: t.subcapitulo,
    criado_em: t.criadoEm,
    tarefas: t.tarefas,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [projetos, setProjetosState] = useState<Projeto[]>([]);
  const [materiais, setMateriaisState] = useState<Material[]>([]);
  const [maoDeObraState, setMaoDeObraState] = useState<MaoDeObra[]>([]);
  const [templatesState, setTemplatesState] = useState<TemplateDivisao[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Fetch all data on mount when user is authenticated
  useEffect(() => {
    if (!user) {
      setCarregando(false);
      return;
    }

    let cancelled = false;
    setCarregando(true);

    async function fetchAll() {
      const [
        { data: projetosData },
        { data: materiaisData },
        { data: maoData },
        { data: templatesData },
      ] = await Promise.all([
        supabase.from('projetos').select('*').eq('user_id', user!.id),
        supabase.from('materiais').select('*').eq('user_id', user!.id),
        supabase.from('mao_de_obra').select('*').eq('user_id', user!.id),
        supabase.from('templates_divisao').select('*').eq('user_id', user!.id),
      ]);

      if (cancelled) return;

      setProjetosState((projetosData ?? []).map(rowToProjeto));
      setMateriaisState((materiaisData ?? []).map(rowToMaterial));
      setMaoDeObraState((maoData ?? []).map(rowToMaoDeObra));
      setTemplatesState((templatesData ?? []).map(rowToTemplate));
      setCarregando(false);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [user]);

  // --- Projetos ---

  const setProjetos = useCallback((p: Projeto[] | ((prev: Projeto[]) => Projeto[])) => {
    setProjetosState((prev) => {
      const next = typeof p === 'function' ? p(prev) : p;
      if (user) {
        // Upsert all projetos
        supabase
          .from('projetos')
          .upsert(next.map((proj) => projetoToRow(proj, user.id)))
          .then(() => {});
      }
      return next;
    });
  }, [user]);

  const adicionarProjeto = useCallback((p: Projeto) => {
    if (!user) return;
    setProjetosState((prev) => [...prev, p]);
    supabase.from('projetos').insert(projetoToRow(p, user.id)).then(() => {});
  }, [user]);

  const atualizarProjeto = useCallback((p: Projeto) => {
    if (!user) return;
    setProjetosState((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    supabase.from('projetos').update(projetoToRow(p, user.id)).eq('id', p.id).then(() => {});
  }, [user]);

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
      supabase.from('projetos').insert(projetoToRow(clone, user!.id)).then(() => {});
      return [...prev, clone];
    });
  }, [user]);

  // --- Materiais ---

  const setMateriais = useCallback((m: Material[] | ((prev: Material[]) => Material[])) => {
    setMateriaisState(m);
  }, []);

  const adicionarMaterial = useCallback((m: Material) => {
    if (!user) return;
    setMateriaisState((prev) => [...prev, m]);
    supabase.from('materiais').insert(materialToRow(m, user.id)).then(() => {});
  }, [user]);

  const atualizarMaterial = useCallback((m: Material) => {
    if (!user) return;
    setMateriaisState((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    supabase.from('materiais').update(materialToRow(m, user.id)).eq('id', m.id).then(() => {});
  }, [user]);

  const eliminarMaterial = useCallback((id: string) => {
    if (!user) return;
    setMateriaisState((prev) => prev.filter((x) => x.id !== id));
    supabase.from('materiais').delete().eq('id', id).then(() => {});
  }, [user]);

  // --- Mão de Obra ---

  const adicionarMaoDeObra = useCallback((m: MaoDeObra) => {
    if (!user) return;
    setMaoDeObraState((prev) => [...prev, m]);
    supabase.from('mao_de_obra').insert(maoDeObraToRow(m, user.id)).then(() => {});
  }, [user]);

  const atualizarMaoDeObra = useCallback((m: MaoDeObra) => {
    if (!user) return;
    setMaoDeObraState((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    supabase.from('mao_de_obra').update(maoDeObraToRow(m, user.id)).eq('id', m.id).then(() => {});
  }, [user]);

  const eliminarMaoDeObra = useCallback((id: string) => {
    if (!user) return;
    setMaoDeObraState((prev) => prev.filter((x) => x.id !== id));
    supabase.from('mao_de_obra').delete().eq('id', id).then(() => {});
  }, [user]);

  // --- Templates ---

  const adicionarTemplate = useCallback((t: TemplateDivisao) => {
    if (!user) return;
    setTemplatesState((prev) => [...prev, t]);
    supabase.from('templates_divisao').insert(templateToRow(t, user.id)).then(() => {});
  }, [user]);

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
      atualizarMaterial,
      eliminarMaterial,
      adicionarMaoDeObra,
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
