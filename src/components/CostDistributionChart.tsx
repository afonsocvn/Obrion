import { Projeto } from '@/types/project';
import { calcularResumo } from '@/lib/wbs';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';

const COLORS = ['hsl(217,71%,45%)', 'hsl(142,71%,45%)', 'hsl(38,92%,50%)'];

export default function CostDistributionChart({ projetos }: { projetos: Projeto[] }) {
  const allTarefas = projetos.flatMap(p => p.tarefas);
  const resumo = calcularResumo(allTarefas);

  const data = [
    { name: 'Material', value: resumo.totalMaterial },
    { name: 'Mão de Obra', value: resumo.totalMaoObra },
    { name: 'Margem', value: resumo.totalMargem },
  ];

  if (resumo.total === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">Sem dados de custos disponíveis.</p>;
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
