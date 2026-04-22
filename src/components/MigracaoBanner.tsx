import { useState, useEffect } from 'react';
import { AlertTriangle, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { carregarProjetos, carregarMateriais, carregarMaoDeObra, carregarTemplates } from '@/lib/storage';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Projeto, Material, MaoDeObra, TemplateDivisao } from '@/types/project';

export default function MigracaoBanner() {
  const { user } = useAuth();
  const { adicionarProjeto, adicionarMaterial, adicionarMaoDeObra, adicionarTemplate } = useApp();

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [maoDeObra, setMaoDeObra] = useState<MaoDeObra[]>([]);
  const [templates, setTemplates] = useState<TemplateDivisao[]>([]);
  const [migrando, setMigrando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    const p = carregarProjetos();
    const m = carregarMateriais();
    const mo = carregarMaoDeObra();
    const t = carregarTemplates();
    setProjetos(p);
    setMateriais(m);
    setMaoDeObra(mo);
    setTemplates(t);
  }, []);

  const temDados = projetos.length > 0 || materiais.length > 0 || maoDeObra.length > 0 || templates.length > 0;

  if (!temDados || concluido || dispensado) return null;

  const handleMigrar = async () => {
    if (!user) return;
    setMigrando(true);

    // Migrar projetos
    for (const p of projetos) {
      await supabase.from('projetos').upsert({
        id: p.id,
        user_id: user.id,
        workspace_id: null,
        nome: p.nome,
        criado_em: p.criadoEm,
        fracoes: p.fracoes,
        tarefas: p.tarefas,
      });
    }

    // Migrar materiais
    for (const m of materiais) {
      await supabase.from('materiais').upsert({
        id: m.id,
        user_id: user.id,
        workspace_id: null,
        nome: m.nome,
        referencia: m.referencia,
        categoria: m.categoria,
        material: m.material ?? null,
        gama: m.gama ?? null,
        unidade: m.unidade,
        preco_unitario: m.precoUnitario,
        fornecedor: m.fornecedor,
        notas: m.notas,
      });
    }

    // Migrar mão de obra
    for (const mo of maoDeObra) {
      await supabase.from('mao_de_obra').upsert({
        id: mo.id,
        user_id: user.id,
        workspace_id: null,
        nome: mo.nome,
        categoria: mo.categoria,
        unidade: mo.unidade,
        preco_unitario: mo.precoUnitario,
        subcontratado: mo.subcontratado,
        notas: mo.notas,
      });
    }

    // Migrar templates
    for (const t of templates) {
      await supabase.from('templates_divisao').upsert({
        id: t.id,
        user_id: user.id,
        workspace_id: null,
        nome: t.nome,
        subcapitulo: t.subcapitulo,
        criado_em: t.criadoEm,
        tarefas: t.tarefas,
      });
    }

    // Limpar localStorage
    localStorage.removeItem('constru-plan-projetos');
    localStorage.removeItem('constru-plan-materiais');
    localStorage.removeItem('constru-plan-mao-de-obra');
    localStorage.removeItem('constru-plan-templates-divisao');

    setMigrando(false);
    setConcluido(true);

    // Recarregar página para mostrar os dados migrados
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900">
          Dados locais encontrados
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          {[
            projetos.length > 0 && `${projetos.length} projeto${projetos.length !== 1 ? 's' : ''}`,
            materiais.length > 0 && `${materiais.length} mater${materiais.length !== 1 ? 'iais' : 'ial'}`,
            maoDeObra.length > 0 && `${maoDeObra.length} item${maoDeObra.length !== 1 ? 's' : ''} de mão de obra`,
            templates.length > 0 && `${templates.length} template${templates.length !== 1 ? 's' : ''}`,
          ].filter(Boolean).join(' · ')}
          {' '}guardados localmente antes da conta.
        </p>
        {concluido && (
          <p className="text-xs text-green-700 font-medium mt-1">Migração concluída! A recarregar...</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
          onClick={() => setDispensado(true)}
          disabled={migrando}
        >
          <X className="h-3 w-3 mr-1" />
          Ignorar
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
          onClick={handleMigrar}
          disabled={migrando || concluido}
        >
          <Upload className="h-3 w-3 mr-1" />
          {migrando ? 'A migrar...' : 'Migrar para a conta'}
        </Button>
      </div>
    </div>
  );
}
