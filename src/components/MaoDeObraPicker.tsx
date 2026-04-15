import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { MaoDeObra } from '@/types/project';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  onSelect: (item: MaoDeObra) => void;
  onClose: () => void;
  categoriaFiltro?: string;
}

export default function MaoDeObraPicker({ onSelect, onClose, categoriaFiltro }: Props) {
  const { maoDeObra } = useApp();
  const [pesquisa, setPesquisa] = useState('');

  const base = categoriaFiltro
    ? maoDeObra.filter(m => m.categoria === categoriaFiltro)
    : maoDeObra;

  const filtrados = base.filter(m =>
    m.nome.toLowerCase().includes(pesquisa.toLowerCase()) ||
    m.categoria.toLowerCase().includes(pesquisa.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Selecionar Mão de Obra
            {categoriaFiltro && <span className="ml-2 text-xs font-normal text-muted-foreground">— {categoriaFiltro}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome ou categoria..."
            value={pesquisa}
            onChange={e => setPesquisa(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        {filtrados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {base.length === 0
              ? categoriaFiltro
                ? `Sem registos na categoria "${categoriaFiltro}". Adicione na página de Mão de Obra.`
                : 'Sem registos na base de dados. Adicione na página de Mão de Obra.'
              : 'Nenhum registo encontrado.'}
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
                  <p className="text-xs text-muted-foreground">
                    {m.categoria}
                    {m.subcontratado && <span className="ml-2 px-1.5 py-0.5 rounded-sm bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">Subcontratado</span>}
                  </p>
                </div>
                <span className="text-sm font-medium mono shrink-0 ml-3">{formatCurrency(m.precoUnitario)}/{m.unidade}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
