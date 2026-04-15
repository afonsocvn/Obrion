import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Projeto, Material, MaoDeObra, TemplateDivisao } from '@/types/project';
import { carregarProjetos, guardarProjetos, carregarMateriais, guardarMateriais, carregarMaoDeObra, guardarMaoDeObra, carregarTemplates, guardarTemplates } from '@/lib/storage';
import { migrarProjetos } from '@/lib/migrations';

interface AppContextType {
  projetos: Projeto[];
  materiais: Material[];
  maoDeObra: MaoDeObra[];
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
  templates: TemplateDivisao[];
  adicionarTemplate: (t: TemplateDivisao) => void;
  eliminarTemplate: (id: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [projetos, setProjetosState] = useState<Projeto[]>(() => migrarProjetos(carregarProjetos()));
  const [materiais, setMateriaisState] = useState<Material[]>(carregarMateriais);
  const [maoDeObraState, setMaoDeObraState] = useState<MaoDeObra[]>(carregarMaoDeObra);
  const [templatesState, setTemplatesState] = useState<TemplateDivisao[]>(carregarTemplates);

  useEffect(() => { guardarProjetos(projetos); }, [projetos]);
  useEffect(() => { guardarMateriais(materiais); }, [materiais]);
  useEffect(() => { guardarMaoDeObra(maoDeObraState); }, [maoDeObraState]);
  useEffect(() => { guardarTemplates(templatesState); }, [templatesState]);

  const setProjetos = useCallback((p: Projeto[] | ((prev: Projeto[]) => Projeto[])) => {
    setProjetosState(p);
  }, []);

  const setMateriais = useCallback((m: Material[] | ((prev: Material[]) => Material[])) => {
    setMateriaisState(m);
  }, []);

  const adicionarProjeto = useCallback((p: Projeto) => {
    setProjetosState(prev => [...prev, p]);
  }, []);

  const atualizarProjeto = useCallback((p: Projeto) => {
    setProjetosState(prev => prev.map(x => x.id === p.id ? p : x));
  }, []);

  const eliminarProjeto = useCallback((id: string) => {
    setProjetosState(prev => prev.filter(x => x.id !== id));
  }, []);

  const duplicarProjeto = useCallback((id: string) => {
    setProjetosState(prev => {
      const orig = prev.find(x => x.id === id);
      if (!orig) return prev;
      const clone: Projeto = {
        ...JSON.parse(JSON.stringify(orig)),
        id: `${Date.now()}-clone`,
        nome: `${orig.nome} (cópia)`,
        criadoEm: new Date().toISOString(),
      };
      return [...prev, clone];
    });
  }, []);

  const adicionarMaterial = useCallback((m: Material) => {
    setMateriaisState(prev => [...prev, m]);
  }, []);

  const atualizarMaterial = useCallback((m: Material) => {
    setMateriaisState(prev => prev.map(x => x.id === m.id ? m : x));
  }, []);

  const eliminarMaterial = useCallback((id: string) => {
    setMateriaisState(prev => prev.filter(x => x.id !== id));
  }, []);

  const adicionarMaoDeObra = useCallback((m: MaoDeObra) => {
    setMaoDeObraState(prev => [...prev, m]);
  }, []);

  const atualizarMaoDeObra = useCallback((m: MaoDeObra) => {
    setMaoDeObraState(prev => prev.map(x => x.id === m.id ? m : x));
  }, []);

  const eliminarMaoDeObra = useCallback((id: string) => {
    setMaoDeObraState(prev => prev.filter(x => x.id !== id));
  }, []);

  const adicionarTemplate = useCallback((t: TemplateDivisao) => {
    setTemplatesState(prev => [...prev, t]);
  }, []);

  const eliminarTemplate = useCallback((id: string) => {
    setTemplatesState(prev => prev.filter(x => x.id !== id));
  }, []);

  return (
    <AppContext.Provider value={{
      projetos, materiais, maoDeObra: maoDeObraState, templates: templatesState, setProjetos, setMateriais,
      adicionarProjeto, atualizarProjeto, eliminarProjeto, duplicarProjeto,
      adicionarMaterial, atualizarMaterial, eliminarMaterial,
      adicionarMaoDeObra, atualizarMaoDeObra, eliminarMaoDeObra,
      adicionarTemplate, eliminarTemplate,
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
