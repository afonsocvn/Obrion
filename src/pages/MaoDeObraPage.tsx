import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { MaoDeObra, CATEGORIAS_MAO_DE_OBRA } from '@/types/project';
import { v4, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Search, Pencil, HelpCircle, Download } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import * as XLSX from 'xlsx';

const UNIDADES = ['m²', 'ml', 'un.', 'vg.', 'h'];

function exportarExcel(lista: MaoDeObra[]) {
  const rows = lista.map(m => ({
    'Nome':           m.nome,
    'Categoria':      m.categoria,
    'Unidade':        m.unidade,
    'Preço (€)':      m.precoUnitario,
    'Subcontratado':  m.subcontratado ? 'Sim' : 'Não',
    'Notas':          m.notas,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [28, 18, 8, 12, 14, 30].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mão de Obra');
  XLSX.writeFile(wb, `mao_de_obra_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function MaoDeObraPage() {
  const { maoDeObra, adicionarMaoDeObra, atualizarMaoDeObra, eliminarMaoDeObra } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MaoDeObra | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [pesquisa, setPesquisa] = useState('');

  const filtrados = useMemo(() => maoDeObra.filter(m => {
    const matchCat = filtroCategoria === 'todas' || m.categoria === filtroCategoria;
    const matchSearch = !pesquisa || m.nome.toLowerCase().includes(pesquisa.toLowerCase());
    return matchCat && matchSearch;
  }), [maoDeObra, filtroCategoria, pesquisa]);

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Base de Dados de Mão de Obra</h1>
          <p className="section-subtitle mt-1">{maoDeObra.length} registos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportarExcel(filtrados)}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar..." value={pesquisa} onChange={e => setPesquisa(e.target.value)} className="pl-9 w-56 h-9" />
        </div>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {CATEGORIAS_MAO_DE_OBRA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th className="text-right">Preço (€)</th>
                <th>Subcontratado</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Sem registos para mostrar.</td>
                </tr>
              ) : (
                filtrados.map(m => (
                  <tr key={m.id}>
                    <td className="font-medium text-sm">
                      <div className="flex items-center gap-1.5">
                        {m.nome}
                        {m.notas && (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-default" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">{m.notas}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </td>
                    <td className="text-sm">{m.categoria}</td>
                    <td className="text-sm">{m.unidade}</td>
                    <td className="text-right mono text-sm">{formatCurrency(m.precoUnitario)}</td>
                    <td className="text-sm">
                      {m.subcontratado
                        ? <span className="text-xs px-1.5 py-0.5 rounded-sm font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">Subcontratado</span>
                        : <span className="text-muted-foreground text-xs">Interno</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditItem(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => eliminarMaoDeObra(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showForm && (
        <MaoDeObraFormDialog onClose={() => setShowForm(false)} onSave={(m) => { adicionarMaoDeObra(m); setShowForm(false); }} />
      )}
      {editItem && (
        <MaoDeObraFormDialog
          initial={editItem}
          onClose={() => setEditItem(null)}
          onSave={(m) => { atualizarMaoDeObra(m); setEditItem(null); }}
        />
      )}
    </div>
  );
}

function MaoDeObraFormDialog({ onClose, onSave, initial }: { onClose: () => void; onSave: (m: MaoDeObra) => void; initial?: MaoDeObra }) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? '',
    categoria: initial?.categoria ?? CATEGORIAS_MAO_DE_OBRA[0] as string,
    unidade: initial?.unidade ?? 'm²',
    precoUnitario: initial?.precoUnitario ?? 0,
    subcontratado: initial?.subcontratado ?? false,
    notas: initial?.notas ?? '',
  });

  const handleSave = () => {
    if (!form.nome.trim()) return;
    onSave({ ...form, id: initial?.id ?? v4(), precoUnitario: Number(form.precoUnitario) });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? 'Editar Mão de Obra' : 'Adicionar Mão de Obra'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome / Descrição do trabalho</Label>
            <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="mt-1" placeholder="Ex: Assentamento de cerâmico" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_MAO_DE_OBRA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unidade} onValueChange={v => setForm(f => ({ ...f, unidade: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Preço Unitário (€)</Label>
            <Input type="number" min={0} step={0.01} value={form.precoUnitario} onChange={e => setForm(f => ({ ...f, precoUnitario: Number(e.target.value) }))} className="mt-1 mono" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.subcontratado} onCheckedChange={v => setForm(f => ({ ...f, subcontratado: v }))} id="subcontratado" />
            <Label htmlFor="subcontratado">Subcontratado</Label>
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.nome.trim()}>Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
