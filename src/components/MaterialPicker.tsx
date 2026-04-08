import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Material } from '@/types/project';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  onSelect: (material: Material) => void;
  onClose: () => void;
}

export default function MaterialPicker({ onSelect, onClose }: Props) {
  const { materiais } = useApp();
  const [pesquisa, setPesquisa] = useState('');

  const filtrados = materiais.filter(m =>
    m.nome.toLowerCase().includes(pesquisa.toLowerCase()) ||
    m.categoria.toLowerCase().includes(pesquisa.toLowerCase()) ||
    m.referencia.toLowerCase().includes(pesquisa.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Selecionar Material</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome, categoria ou referência..."
            value={pesquisa}
            onChange={e => setPesquisa(e.target.value)}
            className="pl-9"
          />
        </div>
        {filtrados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {materiais.length === 0 ? 'Sem materiais na base de dados. Adicione materiais na página de Materiais.' : 'Nenhum material encontrado.'}
          </p>
        ) : (
          <div className="max-h-64 overflow-auto space-y-1">
            {filtrados.map(m => (
              <button
                key={m.id}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors flex items-center justify-between"
                onClick={() => onSelect(m)}
              >
                <div>
                  <p className="text-sm font-medium">{m.nome}</p>
                  <p className="text-xs text-muted-foreground">{m.categoria} · {m.referencia}</p>
                </div>
                <span className="text-sm font-medium mono">{formatCurrency(m.precoUnitario)}/{m.unidade}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
