import { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Material, GamaMaterial, CATEGORIAS_MATERIAL, TIPOS_MATERIAL } from '@/types/project';
import { v4, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Upload, Download, Trash2, Search, FileSpreadsheet, Check, Pencil, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import * as XLSX from 'xlsx';

const GAMAS: GamaMaterial[] = ['Baixa', 'Média', 'Alta'];

function exportarExcel(filtrados: Material[], resolverGama: (m: Material, todos: Material[]) => GamaMaterial | null, todos: Material[]) {
  const rows = filtrados.map(m => ({
    'Nome':          m.nome,
    'Referência':    m.referencia,
    'Categoria':     m.categoria,
    'Material':      m.material || '',
    'Gama':          resolverGama(m, todos) ?? '',
    'Unidade':       m.unidade,
    'Preço (€)':     m.precoUnitario,
    'Fornecedor':    m.fornecedor,
    'Notas':         m.notas,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [20, 16, 16, 14, 8, 8, 12, 20, 30].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Materiais');
  XLSX.writeFile(wb, `materiais_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function resolverGama(m: Material, todos: Material[]): GamaMaterial | null {
  if (m.gama) return m.gama;
  const sameCat = todos.filter(x => x.categoria === m.categoria && x.precoUnitario > 0);
  if (sameCat.length < 2) return null;
  const avg = sameCat.reduce((s, x) => s + x.precoUnitario, 0) / sameCat.length;
  const ratio = m.precoUnitario / avg;
  if (ratio > 1.4) return 'Alta';
  if (ratio < 0.7) return 'Baixa';
  return 'Média';
}

export function GamaBadge({ gama }: { gama: GamaMaterial | null }) {
  if (!gama) return <span className="text-muted-foreground text-xs">—</span>;
  const cls =
    gama === 'Alta'  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
    gama === 'Baixa' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400';
  return <span className={`text-xs px-1.5 py-0.5 rounded-sm font-medium ${cls}`}>{gama}</span>;
}

export default function MateriaisPage() {
  const { materiais, adicionarMaterial, atualizarMaterial, eliminarMaterial } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState(() => sessionStorage.getItem('mat_cat') ?? 'todas');
  const [filtroMaterial, setFiltroMaterial] = useState(() => sessionStorage.getItem('mat_mat') ?? 'todos');
  const [filtroFornecedor, setFiltroFornecedor] = useState(() => sessionStorage.getItem('mat_forn') ?? 'todos');
  const [pesquisa, setPesquisa] = useState(() => sessionStorage.getItem('mat_search') ?? '');

  useEffect(() => { sessionStorage.setItem('mat_cat', filtroCategoria); }, [filtroCategoria]);
  useEffect(() => { sessionStorage.setItem('mat_mat', filtroMaterial); }, [filtroMaterial]);
  useEffect(() => { sessionStorage.setItem('mat_forn', filtroFornecedor); }, [filtroFornecedor]);
  useEffect(() => { sessionStorage.setItem('mat_search', pesquisa); }, [pesquisa]);

  const tiposDisponiveis = filtroCategoria !== 'todas' ? (TIPOS_MATERIAL[filtroCategoria] ?? []) : [];

  const fornecedoresDisponiveis = useMemo(() =>
    [...new Set(materiais.map(m => m.fornecedor).filter(Boolean))].sort(),
  [materiais]);

  const filtrados = useMemo(() => materiais.filter(m => {
    const matchCat = filtroCategoria === 'todas' || m.categoria === filtroCategoria;
    const matchMat = filtroMaterial === 'todos' || m.material === filtroMaterial;
    const matchForn = filtroFornecedor === 'todos' || m.fornecedor === filtroFornecedor;
    const matchSearch = !pesquisa || m.nome.toLowerCase().includes(pesquisa.toLowerCase()) || m.referencia.toLowerCase().includes(pesquisa.toLowerCase());
    return matchCat && matchMat && matchForn && matchSearch;
  }), [materiais, filtroCategoria, filtroMaterial, filtroFornecedor, pesquisa]);

  const handleCategoriaChange = (v: string) => {
    setFiltroCategoria(v);
    setFiltroMaterial('todos');
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Base de Dados de Materiais</h1>
          <p className="section-subtitle mt-1">{materiais.length} materiais registados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportarExcel(filtrados, resolverGama, materiais)}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar Excel
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Material
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar..." value={pesquisa} onChange={e => setPesquisa(e.target.value)} className="pl-9 w-56 h-9" />
        </div>
        <Select value={filtroCategoria} onValueChange={handleCategoriaChange}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {CATEGORIAS_MATERIAL.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {tiposDisponiveis.length > 0 && (
          <Select value={filtroMaterial} onValueChange={setFiltroMaterial}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Material" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os materiais</SelectItem>
              {tiposDisponiveis.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {fornecedoresDisponiveis.length > 0 && (
          <Select value={filtroFornecedor} onValueChange={setFiltroFornecedor}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os fornecedores</SelectItem>
              {fornecedoresDisponiveis.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Referência</th>
                <th>Categoria</th>
                <th>Material</th>
                <th>Gama</th>
                <th>Unidade</th>
                <th className="text-right">Preço (€)</th>
                <th>Fornecedor</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Sem materiais para mostrar.</td>
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
                    <td className="text-sm text-muted-foreground mono">{m.referencia}</td>
                    <td className="text-sm">{m.categoria}</td>
                    <td className="text-sm">{m.material || <span className="text-muted-foreground">—</span>}</td>
                    <td><GamaBadge gama={resolverGama(m, materiais)} /></td>
                    <td className="text-sm">{m.unidade}</td>
                    <td className="text-right mono text-sm">{formatCurrency(m.precoUnitario)}</td>
                    <td className="text-sm text-muted-foreground">{m.fornecedor || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditMaterial(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => eliminarMaterial(m.id)}>
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
        <MaterialFormDialog onClose={() => setShowForm(false)} onSave={(m) => { adicionarMaterial(m); setShowForm(false); }} />
      )}
      {editMaterial && (
        <MaterialFormDialog
          initial={editMaterial}
          onClose={() => setEditMaterial(null)}
          onSave={(m) => { atualizarMaterial(m); setEditMaterial(null); }}
        />
      )}
      {showImport && (
        <ImportExcelDialog onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

function MaterialFormDialog({ onClose, onSave, initial }: { onClose: () => void; onSave: (m: Material) => void; initial?: Material }) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? '',
    referencia: initial?.referencia ?? '',
    categoria: initial?.categoria ?? CATEGORIAS_MATERIAL[0] as string,
    material: initial?.material ?? '',
    gama: initial?.gama ?? '' as GamaMaterial | '',
    unidade: initial?.unidade ?? 'm²',
    precoUnitario: initial?.precoUnitario ?? 0,
    fornecedor: initial?.fornecedor ?? '',
    notas: initial?.notas ?? '',
  });

  const tiposMaterial = TIPOS_MATERIAL[form.categoria] ?? [];

  const handleCatChange = (v: string) => setForm(f => ({ ...f, categoria: v, material: '' }));

  const handleSave = () => {
    if (!form.nome.trim()) return;
    const { gama, ...rest } = form;
    const gamaVal = (gama && gama !== '__none') ? gama as GamaMaterial : undefined;
    onSave({ ...rest, id: initial?.id ?? v4(), precoUnitario: Number(form.precoUnitario), gama: gamaVal });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? 'Editar Material' : 'Adicionar Material'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Referência</Label><Input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={handleCatChange}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_MATERIAL.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Material (tipo)</Label>
            {tiposMaterial.length > 0 ? (
              <Select value={form.material} onValueChange={v => setForm(f => ({ ...f, material: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar tipo..." /></SelectTrigger>
                <SelectContent>
                  {tiposMaterial.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} className="mt-1" placeholder="Ex: Cerâmico, Madeira..." />
            )}
          </div>
          <div>
            <Label>Gama</Label>
            <Select value={form.gama} onValueChange={v => setForm(f => ({ ...f, gama: v as GamaMaterial | '' }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar gama..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Sem definir —</SelectItem>
                {GAMAS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Unidade</Label><Input value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} className="mt-1" /></div>
            <div><Label>Preço Unitário (€)</Label><Input type="number" min={0} step={0.01} value={form.precoUnitario} onChange={e => setForm(f => ({ ...f, precoUnitario: Number(e.target.value) }))} className="mt-1 mono" /></div>
          </div>
          <div><Label>Fornecedor (opcional)</Label><Input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} className="mt-1" /></div>
          <div><Label>Notas</Label><Input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className="mt-1" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.nome.trim()}>Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportExcelDialog({ onClose }: { onClose: () => void }) {
  const { importarMateriais } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [preview, setPreview] = useState<Material[]>([]);

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

  const fields = [
    { key: 'nome', label: 'Nome', required: true },
    { key: 'referencia', label: 'Referência' },
    { key: 'categoria', label: 'Categoria' },
    { key: 'material', label: 'Material (tipo)' },
    { key: 'unidade', label: 'Unidade' },
    { key: 'precoUnitario', label: 'Preço Unitário' },
    { key: 'fornecedor', label: 'Fornecedor' },
    { key: 'notas', label: 'Notas' },
  ];

  const gerarPreview = () => {
    const materiais: Material[] = rows.map(row => ({
      id: v4(),
      nome: String(row[mapping.nome] || ''),
      referencia: String(row[mapping.referencia] || ''),
      categoria: String(row[mapping.categoria] || 'Outros'),
      material: String(row[mapping.material] || ''),
      unidade: String(row[mapping.unidade] || 'un.'),
      precoUnitario: Number(row[mapping.precoUnitario]) || 0,
      fornecedor: String(row[mapping.fornecedor] || ''),
      notas: String(row[mapping.notas] || ''),
    })).filter(m => m.nome.trim());
    setPreview(materiais);
    setStep('preview');
  };

  const confirmarImportacao = () => {
    importarMateriais(preview);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Importar Ficheiro Excel'}
            {step === 'map' && 'Mapear Colunas'}
            {step === 'preview' && `Pré-visualização (${preview.length} materiais)`}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center py-8">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">Selecione um ficheiro .xlsx com os dados dos materiais</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button onClick={() => fileRef.current?.click()}>Selecionar Ficheiro</Button>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{rows.length} linhas encontradas. Mapeie as colunas:</p>
            {fields.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="text-sm w-32 shrink-0">{f.label}{f.required ? ' *' : ''}</span>
                <Select value={mapping[f.key] || ''} onValueChange={v => setMapping(m => ({ ...m, [f.key]: v }))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar coluna" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Ignorar —</SelectItem>
                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                    <th>Material</th>
                    <th>Un.</th>
                    <th className="text-right">Preço</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map(m => (
                    <tr key={m.id}>
                      <td className="text-sm">{m.nome}</td>
                      <td className="text-sm">{m.categoria}</td>
                      <td className="text-sm">{m.material || '—'}</td>
                      <td className="text-sm">{m.unidade}</td>
                      <td className="text-right mono text-sm">{formatCurrency(m.precoUnitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && <p className="text-xs text-muted-foreground text-center py-2">... e mais {preview.length - 50} materiais</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('map')}>Voltar</Button>
              <Button onClick={confirmarImportacao}>
                <Check className="h-4 w-4 mr-1.5" />
                Importar {preview.length} materiais
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
