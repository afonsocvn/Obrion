import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Projeto, Material } from '@/types/project';
import { carregarProjetos, guardarProjetos, carregarMateriais, guardarMateriais } from '@/lib/storage';

interface AppContextType {
  projetos: Projeto[];
  materiais: Material[];
  setProjetos: (p: Projeto[] | ((prev: Projeto[]) => Projeto[])) => void;
  setMateriais: (m: Material[] | ((prev: Material[]) => Material[])) => void;
  adicionarProjeto: (p: Projeto) => void;
  atualizarProjeto: (p: Projeto) => void;
  eliminarProjeto: (id: string) => void;
  duplicarProjeto: (id: string) => void;
  adicionarMaterial: (m: Material) => void;
  atualizarMaterial: (m: Material) => void;
  eliminarMaterial: (id: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [projetos, setProjetosState] = useState<Projeto[]>(carregarProjetos);
  const [materiais, setMateriaisState] = useState<Material[]>(carregarMateriais);

  useEffect(() => { guardarProjetos(projetos); }, [projetos]);
  useEffect(() => { guardarMateriais(materiais); }, [materiais]);

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

  return (
    <AppContext.Provider value={{
      projetos, materiais, setProjetos, setMateriais,
      adicionarProjeto, atualizarProjeto, eliminarProjeto, duplicarProjeto,
      adicionarMaterial, atualizarMaterial, eliminarMaterial,
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
