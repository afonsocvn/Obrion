import { TarefaCusto } from '@/types/project';
import { calcularResumo } from '@/lib/wbs';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';

const COLORS = ['hsl(217,71%,45%)', 'hsl(142,71%,45%)', 'hsl(38,92%,50%)'];

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number;
}) => {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function CostDistributionChart({ tarefas }: { tarefas: TarefaCusto[] }) {
  const resumo = calcularResumo(tarefas);

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
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
            labelLine={false}
            label={renderLabel}
          >
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
