import { useState, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Material, CATEGORIAS_MATERIAL } from '@/types/project';
import { v4, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Upload, Trash2, Search, FileSpreadsheet, Check, X } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function MateriaisPage() {
  const { materiais, adicionarMaterial, eliminarMaterial } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [pesquisa, setPesquisa] = useState('');

  const filtrados = materiais.filter(m => {
    const matchCat = filtroCategoria === 'todas' || m.categoria === filtroCategoria;
    const matchSearch = !pesquisa || m.nome.toLowerCase().includes(pesquisa.toLowerCase()) || m.referencia.toLowerCase().includes(pesquisa.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Base de Dados de Materiais</h1>
          <p className="section-subtitle mt-1">{materiais.length} materiais registados</p>
        </div>
        <div className="flex gap-2">
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
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {CATEGORIAS_MATERIAL.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Referência</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th className="text-right">Preço (€)</th>
                <th>Fornecedor</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Sem materiais para mostrar.</td>
                </tr>
              ) : (
                filtrados.map(m => (
                  <tr key={m.id}>
                    <td className="font-medium text-sm">{m.nome}</td>
                    <td className="text-sm text-muted-foreground mono">{m.referencia}</td>
                    <td className="text-sm">{m.categoria}</td>
                    <td className="text-sm">{m.unidade}</td>
                    <td className="text-right mono text-sm">{formatCurrency(m.precoUnitario)}</td>
                    <td className="text-sm text-muted-foreground">{m.fornecedor || '—'}</td>
                    <td>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => eliminarMaterial(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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

      {showImport && (
        <ImportExcelDialog onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

function MaterialFormDialog({ onClose, onSave }: { onClose: () => void; onSave: (m: Material) => void }) {
  const [form, setForm] = useState({
    nome: '', referencia: '', categoria: CATEGORIAS_MATERIAL[0] as string, unidade: 'm²', precoUnitario: 0, fornecedor: '', notas: '',
  });

  const handleSave = () => {
    if (!form.nome.trim()) return;
    onSave({ ...form, id: v4(), precoUnitario: Number(form.precoUnitario) });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Adicionar Material</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Referência</Label><Input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_MATERIAL.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
  const { adicionarMaterial } = useApp();
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
      unidade: String(row[mapping.unidade] || 'un.'),
      precoUnitario: Number(row[mapping.precoUnitario]) || 0,
      fornecedor: String(row[mapping.fornecedor] || ''),
      notas: String(row[mapping.notas] || ''),
    })).filter(m => m.nome.trim());
    setPreview(materiais);
    setStep('preview');
  };

  const confirmarImportacao = () => {
    preview.forEach(m => adicionarMaterial(m));
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
                <span className="text-sm w-28 shrink-0">{f.label}{f.required ? ' *' : ''}</span>
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
                    <th>Un.</th>
                    <th className="text-right">Preço</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map(m => (
                    <tr key={m.id}>
                      <td className="text-sm">{m.nome}</td>
                      <td className="text-sm">{m.categoria}</td>
                      <td className="text-sm">{m.unidade}</td>
                      <td className="text-right mono text-sm">{formatCurrency(m.precoUnitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 20 && <p className="text-xs text-muted-foreground text-center py-2">... e mais {preview.length - 20} materiais</p>}
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
