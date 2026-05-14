import { useState, useMemo, useRef, useEffect } from 'react';
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
import { Plus, Trash2, Search, Pencil, HelpCircle, Download, Upload, Check, FileSpreadsheet } from 'lucide-react';
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
  const [showImport, setShowImport] = useState(false);
  const [editItem, setEditItem] = useState<MaoDeObra | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState(() => sessionStorage.getItem('mo_cat') ?? 'todas');
  const [pesquisa, setPesquisa] = useState(() => sessionStorage.getItem('mo_search') ?? '');

  useEffect(() => { sessionStorage.setItem('mo_cat', filtroCategoria); }, [filtroCategoria]);
  useEffect(() => { sessionStorage.setItem('mo_search', pesquisa); }, [pesquisa]);

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
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar Excel
          </Button>
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

      {showImport && <ImportExcelDialog onClose={() => setShowImport(false)} />}
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

function ImportExcelDialog({ onClose }: { onClose: () => void }) {
  const { importarMaoDeObra } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [preview, setPreview] = useState<MaoDeObra[]>([]);

  const fields = [
    { key: 'nome',          label: 'Nome / Descrição', required: true },
    { key: 'categoria',     label: 'Categoria' },
    { key: 'unidade',       label: 'Unidade' },
    { key: 'precoUnitario', label: 'Preço Unitário' },
    { key: 'subcontratado', label: 'Subcontratado (Sim/Não)' },
    { key: 'notas',         label: 'Notas' },
  ];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws) as any[];
      if (data.length > 0) {
        setHeaders(Object.keys(data[0]));
        setRows(data);
        setStep('map');
      }
    };
    reader.readAsBinaryString(file);
  };

  const gerarPreview = () => {
    const lista: MaoDeObra[] = rows.map(row => ({
      id: v4(),
      nome: String(row[mapping.nome] || ''),
      categoria: String(row[mapping.categoria] || CATEGORIAS_MAO_DE_OBRA[0]),
      unidade: String(row[mapping.unidade] || 'm²'),
      precoUnitario: Number(row[mapping.precoUnitario]) || 0,
      subcontratado: String(row[mapping.subcontratado] || '').toLowerCase() === 'sim',
      notas: String(row[mapping.notas] || ''),
    })).filter(m => m.nome.trim());
    setPreview(lista);
    setStep('preview');
  };

  const confirmarImportacao = () => {
    importarMaoDeObra(preview);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Importar Ficheiro Excel'}
            {step === 'map' && 'Mapear Colunas'}
            {step === 'preview' && `Pré-visualização (${preview.length} registos)`}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center py-8">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">Selecione um ficheiro .xlsx com os dados de mão de obra</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button onClick={() => fileRef.current?.click()}>Selecionar Ficheiro</Button>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{rows.length} linhas encontradas. Mapeie as colunas:</p>
            {fields.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="text-sm w-40 shrink-0">{f.label}{f.required ? ' *' : ''}</span>
                <select
                  className="flex-1 h-8 text-sm rounded-md border border-input bg-white px-2"
                  value={mapping[f.key] || ''}
                  onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">— ignorar —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
              <Button onClick={gerarPreview} disabled={!mapping.nome}>Pré-visualizar</Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div>
            <div className="max-h-64 overflow-auto mb-4">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Categoria</th>
                    <th>Unidade</th>
                    <th className="text-right">Preço</th>
                    <th>Subcontratado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map(m => (
                    <tr key={m.id}>
                      <td className="text-sm">{m.nome}</td>
                      <td className="text-sm">{m.categoria}</td>
                      <td className="text-sm">{m.unidade}</td>
                      <td className="text-right mono text-sm">{formatCurrency(m.precoUnitario)}</td>
                      <td className="text-sm">{m.subcontratado ? 'Sim' : 'Não'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && <p className="text-xs text-muted-foreground text-center py-2">... e mais {preview.length - 50} registos</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('map')}>Voltar</Button>
              <Button onClick={confirmarImportacao}>
                <Check className="h-4 w-4 mr-1.5" />
                Importar {preview.length} registos
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
