import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { v4, formatCurrency, cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  FileSpreadsheet, ChevronUp, ChevronDown, AlertTriangle, Check,
  Trash2, ArrowLeft, Save, ChevronRight, Plus, Minus, BadgeCheck,
  Layers, BarChart2, FolderOpen, AlertCircle, PencilLine, X, SlidersHorizontal, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';
import { parsePDF } from '@/lib/pdfParser';

// ─── Types ────────────────────────────────────────────────────────────────────

type ColunaRole =
  | 'capitulo' | 'descricao' | 'unidade' | 'quantidade'
  | 'precoUnitario' | 'total' | 'observacoes' | 'ignorar';

const ROLE_LABELS: Record<ColunaRole, string> = {
  capitulo: 'Capítulo / Nº', descricao: 'Descrição', unidade: 'Unidade',
  quantidade: 'Quantidade', precoUnitario: 'Preço Unitário', total: 'Total',
  observacoes: 'Observações', ignorar: '— Ignorar —',
};

interface LinhaOrcamento {
  id: string; numero: string; parentNumero: string; descricao: string;
  unidade: string; quantidade: number; precoUnitario: number; total: number;
  observacoes: string; nivel: number; isCapitulo: boolean;
  erroHierarquia: boolean; somaCalculada: number; ficheiroId: string;
}

interface ExcelFicheiro {
  id: string; nome: string; folha: string; carregadoEm: string;
  total: number; linhas: LinhaOrcamento[];
}

interface Projeto {
  id: string; nome: string; criadoEm: string; ficheiros: ExcelFicheiro[];
  versao: string;
}

interface Orcamento {
  id: string; nome: string; criadoEm: string; projetos: Projeto[];
  m2AcimaSolo: number; m2AbaixoSolo: number; numApartamentos: number;
  m2Retalho: number; m2AreasComuns: number; m2Circulacao: number;
  m2AreasTecnicas: number; m2Terracos: number;
  projetoDefault: string | null;
}

interface FilePendente {
  id: string; nome: string; nomeDisplay: string;
  workbook: XLSX.WorkBook; folhaNomes: string[];
  folhaSelecionada: string; rawRows: unknown[][]; colLabels: string[];
  mapeamento: ColunaRole[]; linhaInicio: number;
  linhasProcessadas: LinhaOrcamento[]; total: number; configured: boolean;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const LS_KEY = 'orcamentos_v2';
function loadOrcamentosLS(): Orcamento[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    return raw.map((o: Orcamento) => ({
      m2AcimaSolo: 0, m2AbaixoSolo: 0, numApartamentos: 0,
      m2Retalho: 0, m2AreasComuns: 0, m2Circulacao: 0, m2AreasTecnicas: 0, m2Terracos: 0,
      projetoDefault: null,
      ...o,
      projetos: (o.projetos ?? []).map((p: Projeto) => ({ versao: '', ...p })),
    }));
  } catch { return []; }
}
function saveOrcamentosLS(list: Orcamento[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

type DbOrcamento = {
  id: string; user_id: string; workspace_id: string | null;
  nome: string; criado_em: string;
  m2_acima_solo: number; m2_abaixo_solo: number; num_apartamentos: number;
  m2_retalho: number; m2_areas_comuns: number; m2_circulacao: number;
  m2_areas_tecnicas: number; m2_terracos: number;
};
type DbProjeto  = { id: string; orcamento_id: string; nome: string; versao: string; criado_em: string; };
type DbFicheiro = { id: string; projeto_id: string; nome: string; folha: string; carregado_em: string; total: number; linhas: LinhaOrcamento[]; };

function orcToRow(o: Orcamento, userId: string, workspaceId: string | null): DbOrcamento {
  return {
    id: o.id, user_id: userId, workspace_id: workspaceId,
    nome: o.nome, criado_em: o.criadoEm,
    m2_acima_solo: o.m2AcimaSolo, m2_abaixo_solo: o.m2AbaixoSolo, num_apartamentos: o.numApartamentos,
    m2_retalho: o.m2Retalho, m2_areas_comuns: o.m2AreasComuns, m2_circulacao: o.m2Circulacao,
    m2_areas_tecnicas: o.m2AreasTecnicas, m2_terracos: o.m2Terracos,
    projeto_default: o.projetoDefault ?? null,
  };
}
function projToRow(p: Projeto, orcId: string): DbProjeto {
  return { id: p.id, orcamento_id: orcId, nome: p.nome, versao: p.versao, criado_em: p.criadoEm };
}
function ficToRow(f: ExcelFicheiro, projId: string): DbFicheiro {
  return { id: f.id, projeto_id: projId, nome: f.nome, folha: f.folha, carregado_em: f.carregadoEm, total: f.total, linhas: f.linhas };
}

async function loadOrcamentosDB(userId: string, workspaceId: string | null): Promise<Orcamento[]> {
  const q = supabase
    .from('orcamentos')
    .select(`id,nome,criado_em,m2_acima_solo,m2_abaixo_solo,num_apartamentos,m2_retalho,m2_areas_comuns,m2_circulacao,m2_areas_tecnicas,m2_terracos,
      orcamento_projetos(id,nome,versao,criado_em,
        orcamento_ficheiros(id,nome,folha,carregado_em,total,linhas)
      )`);
  if (workspaceId) q.eq('workspace_id', workspaceId);
  else             q.eq('user_id', userId).is('workspace_id', null);
  const { data, error } = await q;
  if (error) { console.error('[orcamentos load]', error.message); return []; }
  return (data ?? []).map((row: any) => ({
    id: row.id, nome: row.nome, criadoEm: row.criado_em,
    m2AcimaSolo: row.m2_acima_solo ?? 0, m2AbaixoSolo: row.m2_abaixo_solo ?? 0,
    numApartamentos: row.num_apartamentos ?? 0, m2Retalho: row.m2_retalho ?? 0,
    m2AreasComuns: row.m2_areas_comuns ?? 0, m2Circulacao: row.m2_circulacao ?? 0,
    m2AreasTecnicas: row.m2_areas_tecnicas ?? 0, m2Terracos: row.m2_terracos ?? 0,
    projetoDefault: row.projeto_default ?? null,
    projetos: (row.orcamento_projetos ?? []).map((p: any) => ({
      id: p.id, nome: p.nome, versao: p.versao ?? '', criadoEm: p.criado_em,
      ficheiros: (p.orcamento_ficheiros ?? []).map((f: any) => ({
        id: f.id, nome: f.nome, folha: f.folha ?? '', carregadoEm: f.carregado_em,
        total: f.total ?? 0, linhas: (f.linhas ?? []) as LinhaOrcamento[],
      })),
    })),
  }));
}

async function migrateLocalToSupabase(list: Orcamento[], userId: string, workspaceId: string | null) {
  if (list.length === 0) return;
  const orcs  = list.map(o => orcToRow(o, userId, workspaceId));
  const projs = list.flatMap(o => o.projetos.map(p => projToRow(p, o.id)));
  const fics  = list.flatMap(o => o.projetos.flatMap(p => p.ficheiros.map(f => ficToRow(f, p.id))));
  await supabase.from('orcamentos').upsert(orcs, { onConflict: 'id' });
  if (projs.length) await supabase.from('orcamento_projetos').upsert(projs, { onConflict: 'id' });
  if (fics.length)  await supabase.from('orcamento_ficheiros').upsert(fics, { onConflict: 'id' });
}

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

function getNivel(numero: string): number {
  const s = (numero ?? '').trim();
  if (!s || !/^\d/.test(s)) return 0;
  return s.split('.').filter(Boolean).length;
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val == null || val === '') return 0;
  const s = String(val).replace(/\s/g, '').replace(/[€%]/g, '')
    .replace(/\.(?=\d{3}(,|$))/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parsearLinhas(rows: unknown[][], mapeamento: ColunaRole[], ficheiroId = ''): LinhaOrcamento[] {
  const hasTotalCol = mapeamento.includes('total');
  const result: LinhaOrcamento[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    if ((row as unknown[]).every(c => c === null || c === '')) continue;
    let numero = '', descricao = '', unidade = '', observacoes = '';
    let quantidade = 0, precoUnitario = 0, total = 0;
    mapeamento.forEach((role, i) => {
      const val = (row as unknown[])[i] ?? null;
      switch (role) {
        case 'capitulo':      numero        = String(val ?? '').trim(); break;
        case 'descricao':     descricao     = String(val ?? '').trim(); break;
        case 'unidade':       unidade       = String(val ?? '').trim(); break;
        case 'quantidade':    quantidade    = toNumber(val); break;
        case 'precoUnitario': precoUnitario = toNumber(val); break;
        case 'total':         total         = toNumber(val); break;
        case 'observacoes':   observacoes   = String(val ?? '').trim(); break;
      }
    });
    if (!numero && !descricao) continue;
    if (!hasTotalCol && quantidade && precoUnitario) total = quantidade * precoUnitario;
    result.push({
      id: v4(), numero, parentNumero: '', descricao, unidade,
      quantidade, precoUnitario, total, observacoes,
      nivel: getNivel(numero), isCapitulo: false, erroHierarquia: false, somaCalculada: 0,
      ficheiroId,
    });
  }
  return result;
}

function processarHierarquia(linhas: LinhaOrcamento[]): LinhaOrcamento[] {
  let ultimoNumero = '';
  let res: LinhaOrcamento[] = linhas.map(l => {
    if (l.numero) { ultimoNumero = l.numero; return { ...l, parentNumero: '' }; }
    return { ...l, parentNumero: ultimoNumero };
  });
  const maxNivel = Math.max(0, ...res.map(l => l.nivel));
  for (let nivel = maxNivel; nivel >= 1; nivel--) {
    res = res.map(l => {
      if (l.nivel !== nivel) return l;
      const numStr    = l.numero.trim();
      const filhosNum = res.filter(f => f.nivel === nivel + 1 &&
        f.numero.trim().split('.').slice(0, nivel).join('.') === numStr);
      const filhosNao = res.filter(f => f.parentNumero === numStr);
      if (filhosNum.length === 0 && filhosNao.length === 0) return { ...l, isCapitulo: false };
      const somaCalculada =
        filhosNum.reduce((s, f) => s + f.total, 0) +
        filhosNao.reduce((s, f) => s + f.total, 0);
      const total          = l.total > 0 ? l.total : somaCalculada;
      const erroHierarquia = l.total > 0 && Math.abs(somaCalculada - l.total) > 0.05;
      return { ...l, total, isCapitulo: true, erroHierarquia, somaCalculada };
    });
  }
  return res;
}

function isLinhaVisivel(linha: LinhaOrcamento, expandidos: Set<string>): boolean {
  if (linha.nivel >= 1) {
    if (linha.nivel === 1) return true;
    const partes = linha.numero.trim().split('.');
    for (let i = 1; i < linha.nivel; i++) {
      if (!expandidos.has(partes.slice(0, i).join('.'))) return false;
    }
    return true;
  }
  if (!linha.parentNumero) return true;
  if (!expandidos.has(linha.parentNumero)) return false;
  const parentNivel = getNivel(linha.parentNumero);
  if (parentNivel > 1) {
    const partes = linha.parentNumero.trim().split('.');
    for (let i = 1; i < parentNivel; i++) {
      if (!expandidos.has(partes.slice(0, i).join('.'))) return false;
    }
  }
  return true;
}

function getProjetoTotal(p: Projeto): number {
  return p.ficheiros.reduce((s, f) => s + f.total, 0);
}
function getOrcamentoTotal(o: Orcamento): number {
  return o.projetos.reduce((s, p) => s + getProjetoTotal(p), 0);
}
function getCapitulosNivel1(p: Projeto): string[] {
  const caps = new Set<string>();
  for (const f of p.ficheiros)
    for (const l of f.linhas)
      if (l.nivel === 1 && l.numero) caps.add(l.numero.trim());
  return Array.from(caps).sort((a, b) => parseFloat(a) - parseFloat(b));
}
function detectarGaps(caps: string[]): string[] {
  if (caps.length < 2) return [];
  const nums = caps.map(c => parseFloat(c)).filter(n => !isNaN(n));
  if (nums.length < 2) return [];
  const presente = new Set(nums);
  const gaps: string[] = [];
  for (let i = Math.min(...nums) + 1; i < Math.max(...nums); i++)
    if (!presente.has(i)) gaps.push(String(i));
  return gaps;
}

// ─── Versão helpers ───────────────────────────────────────────────────────────

function sortVersao(a: string, b: string): number {
  const na = parseInt(a.replace(/\D/g, '') || '0', 10);
  const nb = parseInt(b.replace(/\D/g, '') || '0', 10);
  if (na !== nb) return na - nb;
  return a.localeCompare(b);
}

function getLatestVersao(orc: Orcamento): string {
  const vs = [...new Set(orc.projetos.map(p => p.versao).filter(Boolean))];
  if (vs.length === 0) return '';
  return vs.sort(sortVersao).at(-1) ?? '';
}

function getTotalAtivo(orc: Orcamento): number {
  if (orc.projetos.length === 0) return 0;
  const latest = getLatestVersao(orc);
  const grupo  = latest
    ? orc.projetos.filter(p => p.versao === latest)
    : orc.projetos;
  if (grupo.length === 0) return 0;
  return grupo.reduce((s, p) => s + getProjetoTotal(p), 0) / grupo.length;
}

function calcMediana(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function getEstatisticas(vals: number[]) {
  if (vals.length === 0) return null;
  const s = [...vals].sort((a, b) => a - b);
  return {
    media:   vals.reduce((a, v) => a + v, 0) / vals.length,
    mediana: calcMediana(vals),
    minimo:  s[0],
    maximo:  s[s.length - 1],
  };
}

function getProgressaoVersoes(projsSel: Projeto[]) {
  const map = new Map<string, number[]>();
  for (const p of projsSel) {
    const v = p.versao || '—';
    const arr = map.get(v) ?? [];
    arr.push(getProjetoTotal(p));
    map.set(v, arr);
  }
  return Array.from(map.entries())
    .map(([versao, totais]) => ({
      versao,
      media:   totais.reduce((s, v) => s + v, 0) / totais.length,
      minimo:  Math.min(...totais),
      maximo:  Math.max(...totais),
      n:       totais.length,
    }))
    .sort((a, b) => sortVersao(a.versao, b.versao));
}

const VERSAO_CORES: Record<string, string> = {
  V1: 'bg-blue-100 text-blue-700 border-blue-200',
  V2: 'bg-green-100 text-green-700 border-green-200',
  V3: 'bg-amber-100 text-amber-700 border-amber-200',
  V4: 'bg-purple-100 text-purple-700 border-purple-200',
  V5: 'bg-pink-100 text-pink-700 border-pink-200',
  V6: 'bg-red-100 text-red-700 border-red-200',
};
const versaoCor = (v: string) => VERSAO_CORES[v] ?? 'bg-slate-100 text-slate-600 border-slate-200';

interface CapTotal { numero: string; descricao: string; total: number; }
function getCapituloTotais(proj: Projeto): CapTotal[] {
  const map = new Map<string, { descricao: string; total: number }>();
  for (const f of proj.ficheiros) {
    for (const l of f.linhas) {
      if (l.nivel === 1) {
        const ex = map.get(l.numero);
        if (ex) ex.total += l.total;
        else map.set(l.numero, { descricao: l.descricao, total: l.total });
      }
    }
  }
  return Array.from(map.entries())
    .map(([numero, { descricao, total }]) => ({ numero, descricao, total }))
    .sort((a, b) => parseFloat(a.numero) - parseFloat(b.numero));
}

function sortNumericamente(a: string, b: string): number {
  const ak = a.split('.').map(p => parseInt(p) || 0);
  const bk = b.split('.').map(p => parseInt(p) || 0);
  for (let i = 0; i < Math.max(ak.length, bk.length); i++) {
    const d = (ak[i] || 0) - (bk[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Retorna todas as sub-linhas numeradas (nivel >= 2) de um capítulo num projeto
function getSubLinhasCapitulo(proj: Projeto, capNumero: string): LinhaOrcamento[] {
  const capNum = parseFloat(capNumero);
  const linhas = proj.ficheiros.flatMap(f => f.linhas);
  return linhas
    .filter(l => l.nivel >= 2 && l.numero && parseFloat(l.numero.split('.')[0]) === capNum)
    .sort((a, b) => sortNumericamente(a.numero, b.numero));
}

// Para um número de artigo, devolve a linha de um projeto (agrega duplicados de ficheiros)
function getLinhaTotal(proj: Projeto, numero: string): { total: number; descricao: string; unidade: string; quantidade: number; nivel: number } | null {
  const linhas = proj.ficheiros.flatMap(f => f.linhas);
  const matches = linhas.filter(l => l.numero === numero);
  if (matches.length === 0) return null;
  return {
    total: matches.reduce((s, l) => s + l.total, 0),
    descricao: matches[0].descricao,
    unidade: matches[0].unidade,
    quantidade: matches.reduce((s, l) => s + l.quantidade, 0),
    nivel: matches[0].nivel,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FIC_COLORS = [
  'bg-blue-400', 'bg-green-500', 'bg-orange-400', 'bg-purple-500', 'bg-pink-400',
];
const ORC_PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// ─── LinhaTreeTable ───────────────────────────────────────────────────────────

interface LinhaTreeTableProps {
  linhas: LinhaOrcamento[];
  totalBase: number;
  ficheiroIndex?: Record<string, number>;
  editavel?: boolean;
  onEscolherValor?: (id: string, total: number) => void;
  externalDismissed?: Set<string>;
  onDismiss?: (id: string) => void;
}

function LinhaTreeTable({
  linhas, totalBase, ficheiroIndex, editavel = false,
  onEscolherValor, externalDismissed, onDismiss,
}: LinhaTreeTableProps) {
  const [expandidos, setExpandidos]         = useState<Set<string>>(new Set());
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());
  const dismissed = externalDismissed ?? localDismissed;

  const toggleExpandido = (n: string) =>
    setExpandidos(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });

  const dismiss = (id: string) => {
    onDismiss?.(id);
    if (!externalDismissed) setLocalDismissed(prev => new Set(prev).add(id));
  };
  const escolher = (id: string, total: number) => {
    onEscolherValor?.(id, total);
    dismiss(id);
  };

  const temObs  = linhas.some(l => l.observacoes);
  const visiveis = useMemo(
    () => linhas.filter(l => isLinhaVisivel(l, expandidos)),
    [linhas, expandidos],
  );

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs border-collapse table-fixed">
        <colgroup>
          <col className="w-8" />
          <col className="w-28" />
          <col />{/* Descrição — ocupa o espaço restante */}
          {temObs && <col className="w-40" />}
          <col className="w-14" />
          <col className="w-20" />
          <col className="w-28" />
          <col className="w-28" />
          <col className="w-14" />
          <col className="w-7" />
        </colgroup>
        <thead>
          <tr className="bg-muted/50 border-b text-muted-foreground">
            <th className="w-8 px-1" />
            <th className="px-3 py-2 text-left font-medium">Cap.</th>
            <th className="px-3 py-2 text-left font-medium">Descrição</th>
            {temObs && <th className="px-3 py-2 text-left font-medium">Obs.</th>}
            <th className="px-3 py-2 text-right font-medium">Unid.</th>
            <th className="px-3 py-2 text-right font-medium">Qtd.</th>
            <th className="px-3 py-2 text-right font-medium">P. Unit.</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">%</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {visiveis.map((linha) => {
            const expanded = expandidos.has(linha.numero);
            const temErro  = linha.erroHierarquia && !dismissed.has(linha.id);
            const pct      = totalBase > 0 && linha.total > 0 ? (linha.total / totalBase) * 100 : null;
            const ficIdx   = ficheiroIndex && linha.ficheiroId ? ficheiroIndex[linha.ficheiroId] : undefined;
            const dotColor = ficIdx !== undefined ? FIC_COLORS[ficIdx % FIC_COLORS.length] : null;

            return (
              <tr key={linha.id} className={cn(
                'border-b',
                linha.isCapitulo ? 'bg-slate-50 font-semibold' : 'hover:bg-muted/10',
                temErro ? 'bg-amber-50' : '',
                linha.nivel === 1 ? 'border-t-2 border-t-slate-200' : '',
              )}>
                <td className="px-1 py-1 text-center">
                  {linha.isCapitulo && (
                    <button onClick={() => toggleExpandido(linha.numero)}
                      className={cn(
                        'h-5 w-5 rounded flex items-center justify-center mx-auto transition-colors',
                        expanded ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                          : 'bg-muted text-muted-foreground hover:bg-muted/70',
                      )}>
                      {expanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </button>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] overflow-hidden whitespace-nowrap"
                  title={linha.numero}
                  style={{ paddingLeft: `${Math.max(0, linha.nivel - 1) * 14 + 12}px` }}>
                  {dotColor && (
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 -mb-0.5', dotColor)} />
                  )}
                  {linha.numero}
                </td>
                <td className="px-3 py-1.5 overflow-hidden whitespace-nowrap" title={linha.descricao}>{linha.descricao}</td>
                {temObs && (
                  <td className="px-3 py-1.5 overflow-hidden whitespace-nowrap text-muted-foreground italic"
                    title={linha.observacoes}>{linha.observacoes}</td>
                )}
                <td className="px-3 py-1.5 text-right text-muted-foreground">{linha.unidade}</td>
                <td className="px-3 py-1.5 text-right">{linha.quantidade > 0 ? linha.quantidade : ''}</td>
                <td className="px-3 py-1.5 text-right">
                  {linha.precoUnitario > 0 ? formatCurrency(linha.precoUnitario) : ''}
                </td>
                <td className="px-3 py-1.5 text-right font-medium">
                  {linha.total > 0 ? formatCurrency(linha.total) : ''}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {pct !== null && (
                    <span className={cn('font-medium tabular-nums',
                      linha.nivel === 1 ? 'text-blue-600' : 'text-muted-foreground')}>
                      {pct.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {temErro && editavel ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="inline-flex items-center justify-center rounded hover:bg-amber-100 p-0.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="left" className="w-80 p-0 bg-white" align="center">
                        <div className="p-3 space-y-3">
                          <p className="text-sm font-semibold flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            Inconsistência de valores
                          </p>
                          <div className="text-xs space-y-1.5 text-muted-foreground">
                            <div className="flex justify-between">
                              <span>Total declarado no Excel</span>
                              <span className="font-medium text-foreground tabular-nums">{formatCurrency(linha.total)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Soma calculada dos sub-itens</span>
                              <span className="font-medium text-foreground tabular-nums">{formatCurrency(linha.somaCalculada)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1.5">
                              <span>Diferença</span>
                              <span className="font-medium text-amber-600 tabular-nums">
                                {formatCurrency(Math.abs(linha.somaCalculada - linha.total))}
                              </span>
                            </div>
                          </div>
                          <div className="border-t pt-2.5 space-y-1.5">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Qual valor usar?</p>
                            <Button size="sm" variant="outline"
                              className="w-full justify-between gap-2 text-left h-auto py-2 px-3"
                              onClick={() => escolher(linha.id, linha.total)}>
                              <span className="text-xs"><span className="block font-medium">Total do Excel</span>
                                <span className="text-muted-foreground">Mantém o valor original</span></span>
                              <span className="tabular-nums font-semibold text-xs shrink-0">{formatCurrency(linha.total)}</span>
                            </Button>
                            <Button size="sm" variant="outline"
                              className="w-full justify-between gap-2 text-left h-auto py-2 px-3 border-blue-200 hover:bg-blue-50"
                              onClick={() => escolher(linha.id, linha.somaCalculada)}>
                              <span className="text-xs"><span className="block font-medium text-blue-700">Soma calculada</span>
                                <span className="text-muted-foreground">Substitui pelo calculado</span></span>
                              <span className="tabular-nums font-semibold text-xs text-blue-700 shrink-0">{formatCurrency(linha.somaCalculada)}</span>
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : temErro ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline" />
                  ) : dismissed.has(linha.id) ? (
                    <BadgeCheck className="h-3.5 w-3.5 text-green-500 inline" />
                  ) : linha.isCapitulo ? (
                    <Check className="h-3.5 w-3.5 text-green-500 inline" />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ parts }: { parts: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <div className="flex items-center gap-1 text-sm flex-wrap">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
          {p.onClick ? (
            <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={p.onClick}>
              {p.label}
            </button>
          ) : (
            <span className="font-medium text-foreground">{p.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Inline editable title ────────────────────────────────────────────────────

function EditableTitle({
  value, onSave, className,
}: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const inputRef              = useRef<HTMLInputElement>(null);

  const start = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };
  const save   = () => { const v = draft.trim(); if (v && v !== value) onSave(v); setEditing(false); };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
        className={cn('h-7 text-sm font-semibold', className)}
      />
    );
  }
  return (
    <span className={cn('group flex items-center gap-1.5 font-semibold', className)}>
      <span>{value}</span>
      <button
        onClick={start}
        title="Renomear"
        className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity shrink-0"
      >
        <PencilLine className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

// ─── Tooltip formatters ───────────────────────────────────────────────────────

function fmtTooltip(value: number) {
  return formatCurrency(value);
}

// ─── Main Component ───────────────────────────────────────────────────────────

type View = 'lista' | 'orcamento' | 'projeto' | 'comparar' | 'comparar-orc' | 'batch' | 'folha' | 'mapeamento' | 'preview';

export default function OrcamentosPage() {
  const { user }                    = useAuth();
  const { activeWorkspace }         = useWorkspace();
  const workspaceId                 = activeWorkspace?.id ?? null;

  // Navigation
  const [view, setView]                     = useState<View>('lista');
  const [selectedOrcId, setSelectedOrcId]   = useState<string | null>(null);
  const [selectedProjId, setSelectedProjId] = useState<string | null>(null);

  // Data — start empty; populated by Supabase (or localStorage fallback) on mount
  const [orcamentos, setOrcamentos]   = useState<Orcamento[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ── Load from Supabase on mount (+ migrate localStorage if DB is empty) ───
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      const dbData = await loadOrcamentosDB(user.id, workspaceId);
      if (cancelled) return;

      if (dbData.length > 0) {
        setOrcamentos(dbData);
        saveOrcamentosLS(dbData); // keep localStorage in sync
      } else {
        // First time: migrate whatever exists in localStorage
        const local = loadOrcamentosLS();
        if (local.length > 0) {
          setOrcamentos(local);
          await migrateLocalToSupabase(local, user.id, workspaceId);
        }
      }
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync to Supabase in background after every change ────────────────────
  const syncOrc = useCallback(async (orc: Orcamento) => {
    if (!user) return;
    await supabase.from('orcamentos').upsert(orcToRow(orc, user.id, workspaceId), { onConflict: 'id' });
    const projs = orc.projetos.map(p => projToRow(p, orc.id));
    if (projs.length) await supabase.from('orcamento_projetos').upsert(projs, { onConflict: 'id' });
    const fics = orc.projetos.flatMap(p => p.ficheiros.map(f => ficToRow(f, p.id)));
    if (fics.length) await supabase.from('orcamento_ficheiros').upsert(fics, { onConflict: 'id' });
  }, [user, workspaceId]);

  const deleteOrcDB = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('orcamentos').delete().eq('id', id);
  }, [user]);

  const updateOrcamentos = useCallback((fn: (prev: Orcamento[]) => Orcamento[]) => {
    setOrcamentos(prev => {
      const next = fn(prev);
      saveOrcamentosLS(next);
      // Sync changed/new orcamentos to Supabase in background
      const prevIds = new Set(prev.map(o => o.id));
      next.forEach(o => {
        const old = prev.find(p => p.id === o.id);
        // sync if new or changed (shallow-equal the serialised form)
        if (!old || JSON.stringify(old) !== JSON.stringify(o)) {
          syncOrc(o).catch(console.error);
        }
      });
      // Delete removed orcamentos
      prev.forEach(o => { if (!next.find(n => n.id === o.id)) deleteOrcDB(o.id).catch(console.error); });
      void prevIds;
      return next;
    });
  }, [syncOrc, deleteOrcDB]);

  // Dialogs
  const [showNovoOrc, setShowNovoOrc]   = useState(false);
  const [novoOrcNome, setNovoOrcNome]   = useState('');
  const [showNovoProj, setShowNovoProj] = useState(false);
  const [novoProjNome, setNovoProjNome] = useState('');

  // Projeto sub-view
  const [projetoModo, setProjetoModo] = useState<'ficheiros' | 'consolidado'>('consolidado');

  // Comparison controls
  const [expandedCaps, setExpandedCaps]         = useState<Set<string>>(new Set());
  const [compMode, setCompMode]                 = useState<'single' | 'multi'>('single');
  const [compVersoes, setCompVersoes]           = useState<Set<string>>(new Set());
  const [compOrcExcluded, setCompOrcExcluded]   = useState<Set<string>>(new Set());
  const [compM2Field, setCompM2Field]           = useState<string>('');

  const toggleCapExpand = (cap: string) =>
    setExpandedCaps(prev => { const s = new Set(prev); s.has(cap) ? s.delete(cap) : s.add(cap); return s; });

  // Upload state
  const [nomeFicheiro, setNomeFicheiro]         = useState('');
  const [nomeDisplay, setNomeDisplay]           = useState('');
  const [folhaSelecionada, setFolhaSelecionada] = useState('');
  const [workbook, setWorkbook]                 = useState<XLSX.WorkBook | null>(null);
  const [folhaNomes, setFolhaNomes]             = useState<string[]>([]);
  const [rawRows, setRawRows]                   = useState<unknown[][]>([]);
  const [colLabels, setColLabels]               = useState<string[]>([]);
  const [mapeamento, setMapeamento]             = useState<ColunaRole[]>([]);
  const [linhaInicio, setLinhaInicio]           = useState(1);
  const [isDragging, setIsDragging]             = useState(false);
  const fileRef                                 = useRef<HTMLInputElement>(null);

  // Batch upload state
  const [batchFiles, setBatchFiles]   = useState<FilePendente[]>([]);
  const [batchAtivo, setBatchAtivo]   = useState<string | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);

  // Preview state
  const [linhasProcessadas, setLinhasProcessadas] = useState<LinhaOrcamento[]>([]);
  const [dismissedErrors, setDismissedErrors]     = useState<Set<string>>(new Set());

  // Derived
  const selectedOrc  = orcamentos.find(o => o.id === selectedOrcId) ?? null;
  const selectedProj = selectedOrc?.projetos.find(p => p.id === selectedProjId) ?? null;

  const totalProcessado = useMemo(() => {
    const nivel1 = linhasProcessadas.filter(l => getNivel(l.numero) === 1);
    return nivel1.length > 0
      ? nivel1.reduce((s, l) => s + l.total, 0)
      : linhasProcessadas.filter(l => !l.isCapitulo).reduce((s, l) => s + l.total, 0);
  }, [linhasProcessadas]);

  const numInconsistencias = linhasProcessadas.filter(
    l => l.erroHierarquia && !dismissedErrors.has(l.id),
  ).length;

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const criarOrcamento = () => {
    const nome = novoOrcNome.trim();
    if (!nome) return;
    const novo: Orcamento = {
      id: v4(), nome, criadoEm: new Date().toISOString(), projetos: [],
      m2AcimaSolo: 0, m2AbaixoSolo: 0, numApartamentos: 0,
      m2Retalho: 0, m2AreasComuns: 0, m2Circulacao: 0, m2AreasTecnicas: 0, m2Terracos: 0,
    };
    updateOrcamentos(prev => [novo, ...prev]);
    setNovoOrcNome(''); setShowNovoOrc(false);
    toast.success('Projeto criado!');
  };

  const eliminarOrcamento = (id: string) => {
    updateOrcamentos(prev => prev.filter(o => o.id !== id));
    toast.success('Projeto eliminado.');
  };

  const renomearOrcamento = (id: string, nome: string) => {
    updateOrcamentos(prev => prev.map(o => o.id === id ? { ...o, nome } : o));
  };

  const atualizarCaracteristica = (
    orcId: string,
    field: 'm2AcimaSolo' | 'm2AbaixoSolo' | 'numApartamentos' | 'm2Retalho' | 'm2AreasComuns' | 'm2Circulacao' | 'm2AreasTecnicas' | 'm2Terracos',
    val: number,
  ) => {
    updateOrcamentos(prev => prev.map(o => o.id === orcId ? { ...o, [field]: val } : o));
  };

  const criarProjeto = () => {
    const nome = novoProjNome.trim();
    if (!nome || !selectedOrcId) return;
    const novo: Projeto = { id: v4(), nome, criadoEm: new Date().toISOString(), ficheiros: [], versao: '' };
    updateOrcamentos(prev => prev.map(o =>
      o.id === selectedOrcId ? { ...o, projetos: [...o.projetos, novo] } : o,
    ));
    setNovoProjNome(''); setShowNovoProj(false);
    toast.success('Orçamento criado!');
  };

  const eliminarProjeto = (projId: string) => {
    if (!selectedOrcId) return;
    updateOrcamentos(prev => prev.map(o =>
      o.id === selectedOrcId ? { ...o, projetos: o.projetos.filter(p => p.id !== projId) } : o,
    ));
    toast.success('Orçamento eliminado.');
  };

  const renomearProjeto = (projId: string, nome: string) => {
    if (!selectedOrcId) return;
    updateOrcamentos(prev => prev.map(o =>
      o.id === selectedOrcId
        ? { ...o, projetos: o.projetos.map(p => p.id === projId ? { ...p, nome } : p) }
        : o,
    ));
  };

  const atualizarVersaoProjeto = (projId: string, versao: string) => {
    if (!selectedOrcId) return;
    updateOrcamentos(prev => prev.map(o =>
      o.id === selectedOrcId
        ? { ...o, projetos: o.projetos.map(p => p.id === projId ? { ...p, versao } : p) }
        : o,
    ));
  };

  const definirProjetoDefault = (orcId: string, projId: string) => {
    updateOrcamentos(prev => prev.map(o =>
      o.id === orcId
        ? { ...o, projetoDefault: o.projetoDefault === projId ? null : projId }
        : o,
    ));
  };

  const eliminarFicheiro = (ficId: string) => {
    if (!selectedOrcId || !selectedProjId) return;
    updateOrcamentos(prev => prev.map(o =>
      o.id === selectedOrcId ? { ...o, projetos: o.projetos.map(p =>
        p.id === selectedProjId
          ? { ...p, ficheiros: p.ficheiros.filter(f => f.id !== ficId) }
          : p,
      )} : o,
    ));
    toast.success('Ficheiro removido.');
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const irParaOrcamento = (orcId: string) => {
    setSelectedOrcId(orcId);
    setView('orcamento');
  };
  const irParaProjeto   = (projId: string) => {
    setSelectedProjId(projId);
    setProjetoModo('consolidado');
    setView('projeto');
  };
  const voltarLista     = () => { setSelectedOrcId(null); setSelectedProjId(null); setView('lista'); };
  const voltarOrcamento = () => { setSelectedProjId(null); setView('orcamento'); };
  const voltarProjeto   = () => { setView('projeto'); resetUpload(); };

  const irParaComparacaoOrc = () => {
    setCompMode('single');
    setCompVersoes(new Set());
    setCompOrcExcluded(new Set());
    setCompM2Field('');
    setExpandedCaps(new Set());
    setView('comparar-orc');
  };

  // ── Upload ────────────────────────────────────────────────────────────────

  const resetUpload = () => {
    setNomeFicheiro(''); setNomeDisplay(''); setFolhaSelecionada('');
    setWorkbook(null); setFolhaNomes([]); setRawRows([]);
    setColLabels([]); setMapeamento([]); setLinhaInicio(1);
    setLinhasProcessadas([]); setDismissedErrors(new Set());
  };

  const carregarFolha = useCallback((wb: XLSX.WorkBook, sheetName: string) => {
    const ws   = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    if (rows.length === 0) { toast.error('Folha vazia.'); return; }
    const maxCols = Math.max(...rows.map(r => (r as unknown[]).length));
    const labels  = Array.from({ length: maxCols }, (_, i) => {
      const letter = String.fromCharCode(65 + (i % 26));
      return i >= 26 ? letter + String(Math.floor(i / 26)) : letter;
    });
    setFolhaSelecionada(sheetName);
    setRawRows(rows as unknown[][]); setColLabels(labels);
    setMapeamento(new Array(maxCols).fill('ignorar') as ColunaRole[]);
    setLinhaInicio(1); setView('mapeamento');
  }, []);

  const handleFile = useCallback((file: File) => {
    const isPDF = file.name.toLowerCase().endsWith('.pdf');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buf = e.target!.result as ArrayBuffer;
        if (isPDF) {
          const toastId = toast.loading('A extrair texto do PDF…');
          try {
            const rows = await parsePDF(buf);
            toast.dismiss(toastId);
            if (rows.length === 0) { toast.error('PDF sem texto extraível.'); return; }
            const maxCols = Math.max(...rows.map(r => (r as unknown[]).length));
            const labels  = Array.from({ length: maxCols }, (_, i) => {
              const l = String.fromCharCode(65 + (i % 26));
              return i >= 26 ? l + String(Math.floor(i / 26)) : l;
            });
            setNomeFicheiro(file.name);
            setNomeDisplay(file.name.replace(/\.[^.]+$/, ''));
            setWorkbook(null); setFolhaNomes(['PDF']);
            setFolhaSelecionada('PDF');
            setRawRows(rows as unknown[][]);
            setColLabels(labels);
            setMapeamento(new Array(maxCols).fill('ignorar') as ColunaRole[]);
            setLinhaInicio(1);
            setView('mapeamento');
          } catch (err) {
            toast.dismiss(toastId);
            toast.error('Erro ao processar o PDF.');
            console.error(err);
          }
        } else {
          const wb = XLSX.read(buf, { type: 'array' });
          setNomeFicheiro(file.name); setNomeDisplay(file.name.replace(/\.[^.]+$/, ''));
          setWorkbook(wb); setFolhaNomes(wb.SheetNames);
          if (wb.SheetNames.length === 1) carregarFolha(wb, wb.SheetNames[0]);
          else setView('folha');
        }
      } catch { toast.error('Erro ao ler o ficheiro.'); }
    };
    reader.readAsArrayBuffer(file);
  }, [carregarFolha]);

  // Parses a list of files (Excel or PDF) into FilePendente objects (batch flow)
  const parseParaBatch = useCallback((files: File[]): Promise<FilePendente[]> => {
    const makeLabels = (maxCols: number) =>
      Array.from({ length: maxCols }, (_, i) => {
        const l = String.fromCharCode(65 + (i % 26));
        return i >= 26 ? l + String(Math.floor(i / 26)) : l;
      });

    const promises = files.map(file => new Promise<FilePendente | null>(resolve => {
      const isPDF   = file.name.toLowerCase().endsWith('.pdf');
      const reader  = new FileReader();
      reader.onload = async e => {
        try {
          const buf = e.target!.result as ArrayBuffer;
          if (isPDF) {
            const rows    = await parsePDF(buf);
            if (rows.length === 0) { toast.error(`${file.name}: sem texto extraível.`); resolve(null); return; }
            const maxCols = Math.max(...rows.map(r => (r as unknown[]).length));
            resolve({
              id: v4(), nome: file.name, nomeDisplay: file.name.replace(/\.[^.]+$/, ''),
              workbook: null as unknown as XLSX.WorkBook, folhaNomes: ['PDF'],
              folhaSelecionada: 'PDF', rawRows: rows as unknown[][], colLabels: makeLabels(maxCols),
              mapeamento: new Array(maxCols).fill('ignorar') as ColunaRole[],
              linhaInicio: 1, linhasProcessadas: [], total: 0, configured: false,
            });
          } else {
            const wb      = XLSX.read(buf, { type: 'array' });
            const isSingle = wb.SheetNames.length === 1;
            let rawRows: unknown[][] = [], colLabels: string[] = [];
            let mapeamento: ColunaRole[] = [], folhaSelecionada = '';
            if (isSingle) {
              const ws = wb.Sheets[wb.SheetNames[0]];
              const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
              const maxCols = rows.length > 0 ? Math.max(...rows.map(r => (r as unknown[]).length)) : 0;
              colLabels = makeLabels(maxCols);
              rawRows = rows as unknown[][];
              mapeamento = new Array(maxCols).fill('ignorar') as ColunaRole[];
              folhaSelecionada = wb.SheetNames[0];
            }
            resolve({
              id: v4(), nome: file.name, nomeDisplay: file.name.replace(/\.[^.]+$/, ''),
              workbook: wb, folhaNomes: wb.SheetNames,
              folhaSelecionada, rawRows, colLabels, mapeamento,
              linhaInicio: 1, linhasProcessadas: [], total: 0, configured: false,
            });
          }
        } catch { toast.error(`Erro ao ler ${file.name}.`); resolve(null); }
      };
      reader.readAsArrayBuffer(file);
    }));
    return Promise.all(promises).then(r => r.filter(Boolean) as FilePendente[]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files)
      .filter(f => /\.(xlsx|xls|pdf)$/i.test(f.name));
    if (files.length === 0) return;
    if (files.length === 1) { handleFile(files[0]); return; }
    parseParaBatch(files).then(fps => {
      if (fps.length === 0) return;
      setIsBatchMode(true); setBatchFiles(fps); setView('batch');
    });
  }, [handleFile, parseParaBatch]);

  // Inicia a configuração de um ficheiro do batch no fluxo normal
  const iniciarConfiguracaoBatch = (fileId: string) => {
    const f = batchFiles.find(b => b.id === fileId);
    if (!f) return;
    setBatchAtivo(fileId);
    setNomeFicheiro(f.nome); setNomeDisplay(f.nomeDisplay);
    setFolhaSelecionada(f.folhaSelecionada); setWorkbook(f.workbook);
    setFolhaNomes(f.folhaNomes); setRawRows(f.rawRows); setColLabels(f.colLabels);
    setMapeamento(f.mapeamento.length > 0 ? f.mapeamento : new Array(f.colLabels.length).fill('ignorar') as ColunaRole[]);
    setLinhaInicio(f.linhaInicio); setLinhasProcessadas(f.linhasProcessadas);
    setDismissedErrors(new Set());
    if (f.rawRows.length > 0) setView('mapeamento');
    else if (f.folhaNomes.length > 1) setView('folha');
    else setView('mapeamento');
  };

  // Guarda configuração do ficheiro ativo de volta no batch e volta à vista batch
  const confirmarFileBatch = () => {
    if (!batchAtivo) return;
    if (!nomeDisplay.trim()) { toast.error('Introduza um nome para o ficheiro.'); return; }
    setBatchFiles(prev => prev.map(f =>
      f.id === batchAtivo ? {
        ...f, nomeDisplay: nomeDisplay.trim(), folhaSelecionada,
        rawRows, colLabels, mapeamento, linhaInicio,
        linhasProcessadas, total: totalProcessado, configured: true,
      } : f,
    ));
    setBatchAtivo(null); resetUpload(); setView('batch');
    toast.success('Ficheiro configurado!');
  };

  // Submete todos os ficheiros configurados ao projeto
  const submeterBatch = () => {
    const configurados = batchFiles.filter(f => f.configured);
    if (configurados.length === 0) { toast.error('Configure pelo menos um ficheiro antes de submeter.'); return; }
    if (!selectedOrcId || !selectedProjId) { toast.error('Contexto inválido.'); return; }
    const novos: ExcelFicheiro[] = configurados.map(f => {
      const ficId = v4();
      return {
        id: ficId, nome: f.nomeDisplay, folha: f.folhaSelecionada,
        carregadoEm: new Date().toISOString(), total: f.total,
        linhas: f.linhasProcessadas.map(l => ({ ...l, ficheiroId: ficId })),
      };
    });
    updateOrcamentos(prev => prev.map(o =>
      o.id === selectedOrcId ? { ...o, projetos: o.projetos.map(p =>
        p.id === selectedProjId ? { ...p, ficheiros: [...p.ficheiros, ...novos] } : p,
      )} : o,
    ));
    toast.success(`${novos.length} ficheiro${novos.length !== 1 ? 's' : ''} adicionados!`);
    setIsBatchMode(false); setBatchFiles([]); setBatchAtivo(null);
    setView('projeto');
  };

  const cancelarBatch = () => {
    setIsBatchMode(false); setBatchFiles([]); setBatchAtivo(null);
    resetUpload(); setView('projeto');
  };

  const setMapeamentoCol = (i: number, role: ColunaRole) =>
    setMapeamento(prev => { const n = [...prev]; n[i] = role; return n; });

  const processarOrcamento = () => {
    const linhas    = parsearLinhas(rawRows.slice(linhaInicio - 1), mapeamento);
    const validadas = processarHierarquia(linhas);
    setLinhasProcessadas(validadas); setDismissedErrors(new Set()); setView('preview');
  };

  const guardarFicheiro = () => {
    if (!nomeDisplay.trim())           { toast.error('Introduza um nome para o ficheiro.'); return; }
    if (!selectedOrcId || !selectedProjId) { toast.error('Contexto de projeto inválido.'); return; }
    const ficId = v4();
    const novo: ExcelFicheiro = {
      id: ficId, nome: nomeDisplay.trim(), folha: folhaSelecionada,
      carregadoEm: new Date().toISOString(), total: totalProcessado,
      linhas: linhasProcessadas.map(l => ({ ...l, ficheiroId: ficId })),
    };
    updateOrcamentos(prev => prev.map(o =>
      o.id === selectedOrcId ? { ...o, projetos: o.projetos.map(p =>
        p.id === selectedProjId ? { ...p, ficheiros: [...p.ficheiros, novo] } : p,
      )} : o,
    ));
    toast.success('Ficheiro adicionado ao projeto!');
    setView('projeto'); resetUpload();
  };

  const escolherValor = (id: string, novoTotal: number) => {
    setLinhasProcessadas(prev =>
      prev.map(l => l.id === id ? { ...l, total: novoTotal, erroHierarquia: false } : l),
    );
    setDismissedErrors(prev => new Set(prev).add(id));
  };

  // ── Loading state while fetching from Supabase ──────────────────────────
  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">A carregar orçamentos…</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Batch
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'batch') {
    const nConf = batchFiles.filter(f => f.configured).length;
    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={cancelarBatch}>
            <ArrowLeft className="h-4 w-4" /> Cancelar
          </Button>
          <Breadcrumb parts={[
            { label: 'Orçamentos', onClick: voltarLista },
            { label: selectedOrc?.nome ?? '', onClick: voltarOrcamento },
            { label: selectedProj?.nome ?? '', onClick: cancelarBatch },
            { label: 'Importação em lote' },
          ]} />
        </div>

        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold text-base">Importação em lote</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {nConf} de {batchFiles.length} ficheiros prontos
            </p>
          </div>
          <Button onClick={submeterBatch} disabled={nConf === 0} className="gap-2">
            <Save className="h-4 w-4" />
            Submeter {nConf > 0 ? nConf : ''} ficheiro{nConf !== 1 ? 's' : ''}
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full mb-5 overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${batchFiles.length > 0 ? (nConf / batchFiles.length) * 100 : 0}%` }} />
        </div>

        {/* File list */}
        <div className="space-y-2 mb-4">
          {batchFiles.map((f, idx) => (
            <Card key={f.id} className={cn('transition-all', f.configured ? 'border-green-200' : '')}>
              <CardContent className="py-2.5 px-4 flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 text-center">{idx + 1}</span>
                <FileSpreadsheet className={cn('h-4 w-4 shrink-0',
                  f.configured ? 'text-green-600' : 'text-muted-foreground/50')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.nomeDisplay || f.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {f.nome}
                    {f.folhaSelecionada && ` · ${f.folhaSelecionada}`}
                    {f.configured && ` · ${f.linhasProcessadas.length} linhas`}
                  </p>
                </div>
                {f.configured ? (
                  <span className="text-sm font-bold text-green-700 shrink-0">{formatCurrency(f.total)}</span>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] shrink-0">
                    Por configurar
                  </Badge>
                )}
                <Button size="sm" variant={f.configured ? 'outline' : 'default'}
                  className="h-7 text-xs px-3 shrink-0"
                  onClick={() => iniciarConfiguracaoBatch(f.id)}>
                  {f.configured ? 'Rever' : 'Configurar'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                  onClick={() => setBatchFiles(prev => prev.filter(b => b.id !== f.id))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add more files */}
        <div
          role="button" tabIndex={0}
          className={cn(
            'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all select-none outline-none',
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-muted-foreground/20 hover:border-blue-400 hover:bg-muted/10',
          )}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault(); setIsDragging(false);
            const files = Array.from(e.dataTransfer.files).filter(f => !f.name.toLowerCase().endsWith('.pdf'));
            if (files.length === 0) return;
            parseParaBatch(files).then(fps => setBatchFiles(prev => [...prev, ...fps]));
          }}
        >
          <p className="text-sm text-muted-foreground">
            <span className="text-blue-600 font-medium">+ Adicionar mais ficheiros</span>
            <span className="ml-1">ao lote</span>
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf" multiple className="hidden"
            onChange={(e) => {
              if (!e.target.files) return;
              const files = Array.from(e.target.files);
              parseParaBatch(files).then(fps => setBatchFiles(prev => [...prev, ...fps]));
              e.target.value = '';
            }} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Folha
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'folha') {
    const voltarDeFolha = () => {
      if (isBatchMode) { setBatchAtivo(null); resetUpload(); setView('batch'); }
      else voltarProjeto();
    };
    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltarDeFolha}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Breadcrumb parts={[
            { label: 'Orçamentos', onClick: voltarLista },
            { label: selectedOrc?.nome ?? '', onClick: voltarOrcamento },
            { label: selectedProj?.nome ?? '', onClick: isBatchMode ? cancelarBatch : voltarProjeto },
            ...(isBatchMode ? [{ label: 'Lote', onClick: () => { setBatchAtivo(null); resetUpload(); setView('batch'); } }] : []),
            { label: 'Selecionar Folha' },
          ]} />
        </div>
        <p className="text-sm text-muted-foreground mb-4">{nomeFicheiro} · {folhaNomes.length} folhas</p>
        <div className="grid gap-3 max-w-lg">
          {folhaNomes.map((nome, i) => {
            const ws      = workbook!.Sheets[nome];
            const ref     = ws['!ref'];
            const nLinhas = ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0;
            const nCols   = ref ? XLSX.utils.decode_range(ref).e.c + 1 : 0;
            return (
              <button key={nome}
                className={cn(
                  'flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all',
                  'hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none',
                  i === 0 ? 'border-blue-300 bg-blue-50/60' : 'border-muted bg-white',
                )}
                onClick={() => workbook && carregarFolha(workbook, nome)}>
                <FileSpreadsheet className={cn('h-8 w-8 shrink-0',
                  i === 0 ? 'text-blue-500' : 'text-muted-foreground/60')} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {nLinhas > 0 ? `${nLinhas} linhas · ${nCols} colunas` : 'Folha vazia'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Mapeamento
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'mapeamento') {
    const voltarDeMapeamento = () => {
      if (folhaNomes.length > 1) { setView('folha'); return; }
      if (isBatchMode) { setBatchAtivo(null); resetUpload(); setView('batch'); }
      else voltarProjeto();
    };
    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltarDeMapeamento}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Breadcrumb parts={[
            { label: 'Orçamentos', onClick: voltarLista },
            { label: selectedOrc?.nome ?? '', onClick: voltarOrcamento },
            { label: selectedProj?.nome ?? '', onClick: isBatchMode ? cancelarBatch : voltarProjeto },
            { label: 'Mapear Colunas' },
          ]} />
        </div>
        <Card className="mb-4">
          <CardContent className="py-4 flex flex-wrap items-center gap-4">
            <Label className="shrink-0 font-medium">Dados começam na linha:</Label>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                onClick={() => setLinhaInicio(l => Math.max(1, l - 1))}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <span className="w-10 text-center font-mono font-semibold text-sm">{linhaInicio}</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                onClick={() => setLinhaInicio(l => Math.min(rawRows.length, l + 1))}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Linha azul = início dos dados.</p>
          </CardContent>
        </Card>
        <Card className="mb-4 overflow-hidden">
          <div className="overflow-auto max-h-[55vh]">
            <table className="text-xs border-collapse table-fixed" style={{ width: `${32 + colLabels.length * 160}px` }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/80 border-b">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                  {colLabels.map((lbl, i) => (
                    <th key={i} className="px-2 py-2 w-40 align-top">
                      <div className="mb-1 text-muted-foreground font-normal text-center text-[11px]">Col. {lbl}</div>
                      <Select value={mapeamento[i] ?? 'ignorar'}
                        onValueChange={(v) => setMapeamentoCol(i, v as ColunaRole)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(ROLE_LABELS) as [ColunaRole, string][]).map(([role, label]) => (
                            <SelectItem key={role} value={role} className="text-xs">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawRows.slice(0, 16).map((row, ri) => {
                  const arr = row as unknown[];
                  const isIgnored = ri + 1 < linhaInicio;
                  const isStart   = ri + 1 === linhaInicio;
                  return (
                    <tr key={ri} className={cn(
                      'border-b transition-colors',
                      isIgnored ? 'opacity-35 bg-muted/20' : 'hover:bg-muted/10',
                      isStart   ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : '',
                    )}>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{ri + 1}</td>
                      {colLabels.map((_, ci) => (
                        <td key={ci} className="px-2 py-1.5 overflow-hidden whitespace-nowrap"
                          title={String(arr[ci] ?? '')}>
                          {arr[ci] !== null && arr[ci] !== undefined ? String(arr[ci]) : ''}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {rawRows.length > 16 && (
                  <tr>
                    <td colSpan={colLabels.length + 1}
                      className="px-3 py-2 text-center text-muted-foreground italic">
                      … e mais {rawRows.length - 16} linhas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="flex justify-between">
          <Button variant="outline" onClick={voltarDeMapeamento}>
            {folhaNomes.length > 1 ? 'Mudar de folha' : isBatchMode ? 'Voltar ao lote' : 'Cancelar'}
          </Button>
          <Button onClick={processarOrcamento} className="gap-2">
            Processar <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Preview
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'preview') {
    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setView('mapeamento')}>
            <ArrowLeft className="h-4 w-4" /> Voltar ao mapeamento
          </Button>
          <Breadcrumb parts={[
            { label: 'Orçamentos', onClick: voltarLista },
            { label: selectedOrc?.nome ?? '', onClick: voltarOrcamento },
            { label: selectedProj?.nome ?? '', onClick: isBatchMode ? cancelarBatch : voltarProjeto },
            ...(isBatchMode ? [{ label: 'Lote', onClick: () => { setBatchAtivo(null); resetUpload(); setView('batch'); } }] : []),
            { label: 'Pré-visualização' },
          ]} />
        </div>
        <Card className="mb-4">
          <CardContent className="py-4 flex flex-wrap items-center gap-4">
            <Label htmlFor="nome-fic" className="shrink-0 font-medium">Nome do ficheiro:</Label>
            <Input id="nome-fic" value={nomeDisplay}
              onChange={(e) => setNomeDisplay(e.target.value)}
              className="max-w-sm flex-1" placeholder="Ex: Capítulo 3 – Estrutura" />
            {isBatchMode ? (
              <Button onClick={confirmarFileBatch} className="gap-2 ml-auto shrink-0 bg-green-600 hover:bg-green-700">
                <Check className="h-4 w-4" /> Confirmar ficheiro
              </Button>
            ) : (
              <Button onClick={guardarFicheiro} className="gap-2 ml-auto shrink-0">
                <Save className="h-4 w-4" /> Adicionar ao Orçamento
              </Button>
            )}
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card>
            <CardContent className="py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-bold text-base">{formatCurrency(totalProcessado)}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Inconsistências</span>
              <span className={cn('font-bold text-base',
                numInconsistencias > 0 ? 'text-amber-600' : 'text-green-600')}>
                {numInconsistencias === 0 ? '✓ Nenhuma' : `${numInconsistencias} capítulo(s)`}
              </span>
            </CardContent>
          </Card>
        </div>
        <Card>
          <LinhaTreeTable linhas={linhasProcessadas} totalBase={totalProcessado} editavel
            onEscolherValor={escolherValor}
            externalDismissed={dismissedErrors}
            onDismiss={(id) => setDismissedErrors(prev => new Set(prev).add(id))} />
        </Card>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Comparação entre orçamentos dentro de um projeto
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'comparar-orc' && selectedOrc) {
    // ── Derive pool from version selection ──
    const allVersoes = [...new Set(selectedOrc.projetos.map(p => p.versao).filter(Boolean))].sort(sortVersao);
    const projsPool  = compVersoes.size === 0
      ? selectedOrc.projetos
      : selectedOrc.projetos.filter(p => compVersoes.has(p.versao));
    const projsSel   = projsPool.filter(p => !compOrcExcluded.has(p.id));
    const totais     = projsSel.map(p => ({ name: p.nome, total: getProjetoTotal(p), proj: p }));
    const totaisVals = totais.map(t => t.total);
    const maxTotal   = Math.max(...totaisVals, 1);
    const minTotal   = Math.min(...totaisVals);
    const poupanca   = maxTotal - minTotal;

    // m² helper — '__none__' and '' both mean "no m² analysis"
    const getM2Val = (field: string) => {
      if (!field || field === '__none__') return 0;
      if (field === '__total__') return selectedOrc.m2AcimaSolo + selectedOrc.m2AbaixoSolo;
      return (selectedOrc[field as keyof Orcamento] as number) ?? 0;
    };
    const m2Val = getM2Val(compM2Field);
    const temM2 = m2Val > 0;

    const m2Options = [
      { v: '__none__', label: 'Sem análise de custo/m²' },
      ...(selectedOrc.m2AcimaSolo + selectedOrc.m2AbaixoSolo > 0 ? [{ v: '__total__', label: `Total (${selectedOrc.m2AcimaSolo + selectedOrc.m2AbaixoSolo} m²)` }] : []),
      ...(selectedOrc.m2AcimaSolo   > 0 ? [{ v: 'm2AcimaSolo',   label: `Acima solo (${selectedOrc.m2AcimaSolo} m²)` }] : []),
      ...(selectedOrc.m2AbaixoSolo  > 0 ? [{ v: 'm2AbaixoSolo',  label: `Abaixo solo (${selectedOrc.m2AbaixoSolo} m²)` }] : []),
      ...(selectedOrc.m2Retalho     > 0 ? [{ v: 'm2Retalho',     label: `Retalho (${selectedOrc.m2Retalho} m²)` }] : []),
      ...(selectedOrc.m2AreasComuns > 0 ? [{ v: 'm2AreasComuns', label: `Áreas comuns (${selectedOrc.m2AreasComuns} m²)` }] : []),
      ...(selectedOrc.m2Circulacao  > 0 ? [{ v: 'm2Circulacao',  label: `Circulação (${selectedOrc.m2Circulacao} m²)` }] : []),
      ...(selectedOrc.m2AreasTecnicas > 0 ? [{ v: 'm2AreasTecnicas', label: `Áreas técnicas (${selectedOrc.m2AreasTecnicas} m²)` }] : []),
      ...(selectedOrc.m2Terracos    > 0 ? [{ v: 'm2Terracos',    label: `Terraços (${selectedOrc.m2Terracos} m²)` }] : []),
    ];

    // Version analysis
    const versoesSel        = new Set(projsSel.map(p => p.versao).filter(Boolean));
    const mesmaVersao       = versoesSel.size <= 1;
    const stats             = getEstatisticas(totaisVals);
    const progressao        = mesmaVersao ? [] : getProgressaoVersoes(projsSel);
    const progressaoChartData = progressao.map((p, i, arr) => {
      const prev  = arr[i - 1];
      const delta = prev ? ((p.media - prev.media) / prev.media) * 100 : null;
      return { versao: p.versao, Média: Math.round(p.media), delta };
    });

    // Chapter data
    const allCapsSet = new Set<string>();
    projsSel.forEach(p => getCapituloTotais(p).forEach(c => allCapsSet.add(c.numero)));
    const allCaps    = Array.from(allCapsSet).sort((a, b) => parseFloat(a) - parseFloat(b));
    const capDescricao: Record<string, string> = {};
    for (const cap of allCaps) {
      for (const p of projsSel) {
        const found = getCapituloTotais(p).find(c => c.numero === cap);
        if (found?.descricao) { capDescricao[cap] = found.descricao; break; }
      }
    }

    const capChartData = allCaps.map(cap => {
      const row: Record<string, unknown> = { cap, descricao: capDescricao[cap] ?? '' };
      projsSel.forEach(p => {
        const found = getCapituloTotais(p).find(c => c.numero === cap);
        row[p.nome] = found?.total ?? 0;
      });
      return row;
    });
    const totaisChartData = totais.map(t => ({
      name: t.name,
      Total: t.total,
      ...(temM2 ? { 'Por m²': Math.round(t.total / m2Val) } : {}),
    }));

    const temProjsSel = projsSel.length > 0;

    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltarOrcamento}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Breadcrumb parts={[
            { label: 'Orçamentos', onClick: voltarLista },
            { label: selectedOrc.nome, onClick: voltarOrcamento },
            { label: 'Análise' },
          ]} />
        </div>

        {/* ── Painel de controlos ── */}
        <Card className="mb-5">
          <CardContent className="py-4 px-5 space-y-3.5">

            {/* Modo */}
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold text-muted-foreground w-28 shrink-0">Modo</p>
              <div className="flex gap-1.5">
                {(['single', 'multi'] as const).map(m => (
                  <Button key={m} size="sm"
                    variant={compMode === m ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => { setCompMode(m); setCompOrcExcluded(new Set()); }}>
                    {m === 'single' ? 'Uma versão' : 'Várias versões'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Versão */}
            {allVersoes.length > 0 && (
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-muted-foreground w-28 shrink-0">Versão</p>
                <div className="flex flex-wrap gap-1.5">
                  {allVersoes.map(v => {
                    const active = compVersoes.has(v);
                    return (
                      <button key={v}
                        onClick={() => {
                          setCompVersoes(prev => {
                            const s = compMode === 'single' ? new Set<string>() : new Set(prev);
                            active && compMode === 'multi' ? s.delete(v) : s.add(v);
                            return s;
                          });
                          setCompOrcExcluded(new Set());
                        }}
                        className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                          active ? versaoCor(v) : 'bg-muted/40 text-muted-foreground border-muted/60 hover:bg-muted')}>
                        {v}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setCompVersoes(new Set()); setCompOrcExcluded(new Set()); }}
                    className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                      compVersoes.size === 0
                        ? 'bg-slate-200 text-slate-700 border-slate-300'
                        : 'bg-muted/40 text-muted-foreground border-muted/60 hover:bg-muted')}>
                    Todas
                  </button>
                </div>
              </div>
            )}

            {/* Orçamentos */}
            <div className="flex items-start gap-3">
              <p className="text-xs font-semibold text-muted-foreground w-28 shrink-0 pt-1">Orçamentos</p>
              <div className="flex flex-wrap gap-1.5">
                {projsPool.map((p, i) => {
                  const excl = compOrcExcluded.has(p.id);
                  return (
                    <button key={p.id}
                      onClick={() => setCompOrcExcluded(prev => {
                        const s = new Set(prev);
                        excl ? s.delete(p.id) : s.add(p.id);
                        return s;
                      })}
                      className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        excl ? 'bg-muted/30 text-muted-foreground/40 border-muted line-through' : 'border')}
                      style={excl ? {} : {
                        background: ORC_PALETTE[i % ORC_PALETTE.length] + '18',
                        color: ORC_PALETTE[i % ORC_PALETTE.length],
                        borderColor: ORC_PALETTE[i % ORC_PALETTE.length] + '50',
                      }}>
                      {p.nome}
                      {p.versao && !excl && (
                        <span className={cn('px-1 rounded text-[9px] font-bold border', versaoCor(p.versao))}>{p.versao}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Analisar por m² */}
            {m2Options.length > 1 && (
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-muted-foreground w-28 shrink-0">Custo por</p>
                <Select
                  value={compM2Field || '__none__'}
                  onValueChange={v => setCompM2Field(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="h-7 text-xs w-72"><SelectValue placeholder="Escolher área…" /></SelectTrigger>
                  <SelectContent>
                    {m2Options.map(o => (
                      <SelectItem key={o.v} value={o.v} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Dados do Projeto ── */}
        {(() => {
          const orc = selectedOrc;
          const temDados = orc.m2AcimaSolo + orc.m2AbaixoSolo + orc.numApartamentos
            + orc.m2Retalho + orc.m2AreasComuns + orc.m2Circulacao
            + orc.m2AreasTecnicas + orc.m2Terracos > 0;
          if (!temDados) return null;
          const m2Total = orc.m2AcimaSolo + orc.m2AbaixoSolo;
          const totalRef = getTotalAtivo(orc);
          return (
            <Card className="mb-5 bg-slate-50/60">
              <CardContent className="py-3 px-5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">{orc.nome}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                  {([
                    ['m² acima solo', orc.m2AcimaSolo],
                    ['m² abaixo solo', orc.m2AbaixoSolo],
                    ['Retalho', orc.m2Retalho],
                    ['Apartamentos', orc.numApartamentos],
                    ['Áreas comuns', orc.m2AreasComuns],
                    ['Circulação', orc.m2Circulacao],
                    ['Áreas técnicas', orc.m2AreasTecnicas],
                    ['Terraços', orc.m2Terracos],
                  ] as [string, number][]).filter(([, v]) => v > 0).map(([label, val]) => (
                    <div key={label}>
                      <span className="text-muted-foreground">{label}: </span>
                      <span className="font-semibold">{label === 'Apartamentos' ? val : `${val.toLocaleString('pt-PT')} m²`}</span>
                    </div>
                  ))}
                </div>
                {m2Total > 0 && totalRef > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>Média activa: <span className="font-semibold text-foreground">{formatCurrency(totalRef)}</span></span>
                    <span>Custo/m²: <span className="font-semibold text-foreground">{formatCurrency(Math.round(totalRef / m2Total))}/m²</span></span>
                    {orc.numApartamentos > 0 && <span>Custo/apt.: <span className="font-semibold text-foreground">{formatCurrency(Math.round(totalRef / orc.numApartamentos))}</span></span>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Badges with version */}
        <div className="mb-5 flex flex-wrap gap-2">
          {projsSel.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: ORC_PALETTE[i % ORC_PALETTE.length] + '20', color: ORC_PALETTE[i % ORC_PALETTE.length] }}>
              <span className="h-2 w-2 rounded-full inline-block"
                style={{ background: ORC_PALETTE[i % ORC_PALETTE.length] }} />
              {p.nome}
              {p.versao && (
                <span className={cn('px-1.5 py-0 rounded text-[10px] font-bold border ml-1', versaoCor(p.versao))}>
                  {p.versao}
                </span>
              )}
            </span>
          ))}
        </div>

        {/* Empty state — keep control panel visible */}
        {projsSel.length === 0 && (
          <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl mb-6">
            <p className="text-sm font-medium">Nenhum orçamento corresponde aos filtros seleccionados.</p>
            <p className="text-xs mt-1">Escolha uma versão diferente ou seleccione "Todas" acima.</p>
          </div>
        )}

        {/* ── Estatísticas (mesma versão) ── */}
        {projsSel.length > 0 && mesmaVersao && stats && (
          <Card className="mb-6 border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-600" />
                Estatísticas — {versoesSel.size === 1 ? [...versoesSel][0] : 'sem versão definida'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Média',   val: stats.media,   color: 'text-blue-700' },
                  { label: 'Mediana', val: stats.mediana, color: 'text-blue-700' },
                  { label: 'Mínimo', val: stats.minimo,  color: 'text-green-700' },
                  { label: 'Máximo', val: stats.maximo,  color: 'text-red-600' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-white rounded-lg px-3 py-2.5 border">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className={cn('text-sm font-bold mt-0.5 tabular-nums', color)}>
                      {formatCurrency(val)}
                    </p>
                    {temM2 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatCurrency(Math.round(val / m2Val))}/m²
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {/* Spread bar */}
              {stats.maximo > stats.minimo && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    Dispersão: <span className="font-semibold text-foreground">{formatCurrency(stats.maximo - stats.minimo)}</span>
                    {' '}({((stats.maximo - stats.minimo) / stats.media * 100).toFixed(1)}% da média)
                  </p>
                  <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                    {totais.map((t, i) => {
                      const pct = ((t.total - stats.minimo) / (stats.maximo - stats.minimo)) * 90 + 5;
                      return (
                        <div key={t.proj.id}
                          className="absolute top-0.5 w-3 h-3 rounded-full -ml-1.5 border-2 border-white"
                          style={{ left: `${pct}%`, background: ORC_PALETTE[i % ORC_PALETTE.length] }}
                          title={`${t.name}: ${formatCurrency(t.total)}`}
                        />
                      );
                    })}
                    {/* Median line */}
                    <div className="absolute top-0 h-full w-0.5 bg-blue-400 opacity-60"
                      style={{ left: `${((stats.mediana - stats.minimo) / (stats.maximo - stats.minimo)) * 90 + 5}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>{formatCurrency(stats.minimo)}</span>
                    <span className="text-blue-600">mediana</span>
                    <span>{formatCurrency(stats.maximo)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Progressão entre versões ── */}
        {projsSel.length > 0 && !mesmaVersao && progressao.length >= 2 && (
          <Card className="mb-6">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Evolução por Versão</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              {/* Version delta badges */}
              <div className="flex items-center gap-2 flex-wrap mb-4">
                {progressao.map((p, i) => {
                  const prev  = progressao[i - 1];
                  const delta = prev ? ((p.media - prev.media) / prev.media) * 100 : null;
                  return (
                    <div key={p.versao} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <span className={cn('text-sm font-bold', delta! > 0 ? 'text-red-500' : 'text-green-600')}>
                          {delta! > 0 ? '▲' : '▼'} {Math.abs(delta!).toFixed(1)}%
                        </span>
                      )}
                      <div className={cn('px-2.5 py-1 rounded-full text-xs font-bold border', versaoCor(p.versao))}>
                        {p.versao}
                        <span className="ml-1.5 font-normal opacity-80">{formatCurrency(Math.round(p.media))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Line chart */}
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={progressaoChartData} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="versao" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(v: number) => fmtTooltip(v)} labelFormatter={(v) => `Versão ${v}`} />
                  <Bar dataKey="Média" radius={[4, 4, 0, 0]}>
                    {progressaoChartData.map((entry, i) => {
                      const prev = progressaoChartData[i - 1];
                      const up   = prev && entry.Média > prev.Média;
                      const dn   = prev && entry.Média < prev.Média;
                      return <Cell key={i} fill={up ? '#ef4444' : dn ? '#22c55e' : '#3b82f6'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        {temProjsSel && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {totais.map((t, i) => (
            <Card key={t.proj.id} className="overflow-hidden">
              <div className="h-1" style={{ background: ORC_PALETTE[i % ORC_PALETTE.length] }} />
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-xs text-muted-foreground truncate flex-1">{t.name}</p>
                  {t.proj.versao && (
                    <span className={cn('text-[10px] px-1 rounded border font-semibold shrink-0', versaoCor(t.proj.versao))}>
                      {t.proj.versao}
                    </span>
                  )}
                </div>
                <p className="text-base font-bold">{formatCurrency(t.total)}</p>
                {temM2 && <p className="text-xs text-muted-foreground">{formatCurrency(Math.round(t.total / m2Val))}/m²</p>}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">Diferença máx.</p>
              <p className="text-base font-bold mt-0.5 text-amber-600">{formatCurrency(poupanca)}</p>
              <p className="text-xs text-muted-foreground">{poupanca > 0 ? ((poupanca / maxTotal) * 100).toFixed(1) + '%' : '—'}</p>
            </CardContent>
          </Card>
        </div>}

        {/* Bar chart: Totais */}
        {temProjsSel && <Card className="mb-6">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Total por Orçamento</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={totaisChartData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} tick={{ fontSize: 11 }} width={50} />
                <Tooltip formatter={(v: number) => fmtTooltip(v)} />
                <Bar dataKey="Total" radius={[4, 4, 0, 0]}>
                  {totaisChartData.map((_, i) => (
                    <Cell key={i} fill={ORC_PALETTE[i % ORC_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>}

        {/* Chapter comparison table — expandable + mean + diff */}
        {temProjsSel && allCaps.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Comparação por Capítulo</CardTitle>
            </CardHeader>
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b text-muted-foreground">
                    <th className="w-8 px-1" />
                    <th className="px-3 py-2 text-left font-medium w-14">Cap.</th>
                    <th className="px-3 py-2 text-left font-medium">Descrição</th>
                    {projsSel.map((p, i) => (
                      <th key={p.id} className="px-3 py-2 text-right font-medium whitespace-nowrap"
                        style={{ color: ORC_PALETTE[i % ORC_PALETTE.length] }}>
                        {p.nome}
                        {p.versao && <span className={cn('ml-1 px-1 rounded border text-[9px]', versaoCor(p.versao))}>{p.versao}</span>}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium text-blue-600 whitespace-nowrap">Média</th>
                  </tr>
                </thead>
                <tbody>
                  {allCaps.map(cap => {
                    const isExp = expandedCaps.has(cap);
                    const vals  = projsSel.map(p => {
                      const found = getCapituloTotais(p).find(c => c.numero === cap);
                      return found?.total ?? 0;
                    });
                    const valsNonZero = vals.filter(v => v > 0);
                    const capMedia    = valsNonZero.length > 0
                      ? valsNonZero.reduce((s, v) => s + v, 0) / valsNonZero.length
                      : 0;

                    const subNumSet = new Set<string>();
                    projsSel.forEach(p => getSubLinhasCapitulo(p, cap).forEach(l => subNumSet.add(l.numero)));
                    const subNums = Array.from(subNumSet).sort(sortNumericamente);

                    return (
                      <>
                        <tr key={cap} className={cn('border-b', isExp ? 'bg-blue-50/40' : 'hover:bg-muted/10')}>
                          <td className="px-1 py-1.5 text-center">
                            {subNums.length > 0 && (
                              <button onClick={() => toggleCapExpand(cap)}
                                className={cn('h-5 w-5 rounded flex items-center justify-center mx-auto transition-colors',
                                  isExp ? 'bg-blue-200 text-blue-700' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
                                {isExp ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono font-bold">{cap}</td>
                          <td className="px-3 py-1.5 font-semibold max-w-[200px] truncate">{capDescricao[cap] ?? '—'}</td>
                          {vals.map((v, i) => {
                            const diff = capMedia > 0 ? v - capMedia : 0;
                            const pct  = capMedia > 0 && v > 0 ? (diff / capMedia) * 100 : null;
                            return (
                              <td key={i} className="px-3 py-1.5 text-right">
                                <div className="font-bold tabular-nums">
                                  {v > 0 ? formatCurrency(v) : <span className="text-muted-foreground/30">—</span>}
                                </div>
                                {v > 0 && pct !== null && Math.abs(pct) > 0.05 && (
                                  <div className={cn('text-[10px] tabular-nums',
                                    diff > 0 ? 'text-red-500' : 'text-green-600')}>
                                    {diff > 0 ? '+' : ''}{formatCurrency(diff)} ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-right font-bold tabular-nums text-blue-600">
                            {capMedia > 0 ? formatCurrency(capMedia) : '—'}
                          </td>
                        </tr>

                        {/* Article rows */}
                        {isExp && subNums.map(num => {
                          const arts     = projsSel.map(p => getLinhaTotal(p, num));
                          const desc     = arts.find(a => a?.descricao)?.descricao ?? '';
                          const unid     = arts.find(a => a?.unidade)?.unidade ?? '';
                          const nivel    = arts.find(a => a)?.nivel ?? 2;
                          const artVals  = arts.map(a => a?.total ?? 0);
                          const artNZ    = artVals.filter(v => v > 0);
                          const artMedia = artNZ.length > 0 ? artNZ.reduce((s, v) => s + v, 0) / artNZ.length : 0;
                          const indent   = (nivel - 2) * 12 + 12;
                          return (
                            <tr key={`${cap}-${num}`} className="border-b bg-white hover:bg-blue-50/20">
                              <td className="px-1 py-1" />
                              <td className="py-1.5 font-mono text-[11px] text-blue-700/70 whitespace-nowrap"
                                style={{ paddingLeft: `${indent + 12}px` }}>{num}</td>
                              <td className="px-3 py-1.5 max-w-[200px]">
                                <p className="truncate text-[11px]" title={desc}>{desc}</p>
                                {unid && <p className="text-[10px] text-muted-foreground/60">{unid}</p>}
                              </td>
                              {arts.map((art, i) => {
                                const v    = art?.total ?? 0;
                                const diff = artMedia > 0 ? v - artMedia : 0;
                                const pct  = artMedia > 0 && v > 0 ? (diff / artMedia) * 100 : null;
                                return (
                                  <td key={i} className="px-3 py-1.5 text-right">
                                    <div className="text-[11px] font-medium tabular-nums">
                                      {v > 0 ? formatCurrency(v) : <span className="text-muted-foreground/25">—</span>}
                                    </div>
                                    {v > 0 && pct !== null && Math.abs(pct) > 0.05 && (
                                      <div className={cn('text-[10px] tabular-nums',
                                        diff > 0 ? 'text-red-400' : 'text-green-500')}>
                                        {diff > 0 ? '+' : ''}{pct.toFixed(1)}%
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-1.5 text-right text-[11px] font-medium tabular-nums text-blue-600">
                                {artMedia > 0 ? formatCurrency(artMedia) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}

                  {/* Totals row */}
                  <tr className="border-t-2 bg-muted/30 font-bold">
                    <td className="px-1" />
                    <td className="px-3 py-2 font-semibold" colSpan={2}>Total</td>
                    {projsSel.map((p, i) => {
                      const v    = getProjetoTotal(p);
                      const diff = stats ? v - stats.media : 0;
                      const pct  = stats && stats.media > 0 ? (diff / stats.media) * 100 : null;
                      return (
                        <td key={p.id} className="px-3 py-2 text-right">
                          <div className="tabular-nums" style={{ color: ORC_PALETTE[i % ORC_PALETTE.length] }}>
                            {formatCurrency(v)}
                          </div>
                          {pct !== null && Math.abs(pct) > 0.05 && (
                            <div className={cn('text-[10px] tabular-nums font-normal',
                              diff > 0 ? 'text-red-500' : 'text-green-600')}>
                              {diff > 0 ? '+' : ''}{formatCurrency(diff)} ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums text-blue-600">
                      {stats ? formatCurrency(stats.media) : '—'}
                      {temM2 && stats && (
                        <div className="text-[10px] font-normal text-blue-500">
                          {formatCurrency(Math.round(stats.media / m2Val))}/m²
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Chapter grouped bar chart */}
        {temProjsSel && allCaps.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Distribuição por Capítulo</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              <ResponsiveContainer width="100%" height={Math.max(200, allCaps.length * 40)}>
                <BarChart
                  data={capChartData}
                  layout="vertical"
                  margin={{ left: 20, right: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="cap" tick={{ fontSize: 11 }} width={30} />
                  <Tooltip
                    formatter={(v: number, name: string) => [fmtTooltip(v), name]}
                    labelFormatter={(cap) => `Cap. ${cap} — ${capDescricao[cap as string] ?? ''}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {projsSel.map((p, i) => (
                    <Bar key={p.id} dataKey={p.nome} fill={ORC_PALETTE[i % ORC_PALETTE.length]}
                      radius={[0, 3, 3, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Price per m² chart */}
        {temProjsSel && temM2 && (
          <Card className="mb-6">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Custo por m² ({m2Val} m²)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={totaisChartData} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${v}€`} tick={{ fontSize: 11 }} width={55} />
                  <Tooltip formatter={(v: number) => [`${v} €/m²`, 'Custo/m²']} />
                  <Bar dataKey="Por m²" radius={[4, 4, 0, 0]}>
                    {totaisChartData.map((_, i) => (
                      <Cell key={i} fill={ORC_PALETTE[i % ORC_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Comparar projetos (top level)
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'comparar') {
    const maxTotal = Math.max(...orcamentos.map(getOrcamentoTotal), 1);
    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltarLista}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="section-title">Comparação de Projetos</h1>
            <p className="section-subtitle">{orcamentos.length} projetos</p>
          </div>
        </div>
        <div className="space-y-4">
          {orcamentos.map((orc) => {
            const total = getOrcamentoTotal(orc);
            const pct   = (total / maxTotal) * 100;
            return (
              <Card key={orc.id} className="overflow-hidden">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold text-base">{orc.nome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {orc.projetos.length} orçamento(s) ·{' '}
                        {orc.projetos.reduce((s, p) => s + p.ficheiros.length, 0)} ficheiro(s)
                      </p>
                    </div>
                    <p className="text-lg font-bold shrink-0">{formatCurrency(total)}</p>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  {orc.projetos.length > 0 && (
                    <div className="space-y-1.5 border-t pt-3">
                      {orc.projetos.map(proj => (
                        <div key={proj.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate flex-1">{proj.nome}</span>
                          <span className="font-medium ml-4 shrink-0">{formatCurrency(getProjetoTotal(proj))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Orcamento (detalhe — o que o utilizador chama "Projeto")
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'orcamento' && selectedOrc) {
    const totalOrc    = getOrcamentoTotal(selectedOrc);
    const totalAtivo  = getTotalAtivo(selectedOrc);
    const latestVersao = getLatestVersao(selectedOrc);
    const versoesOpcoes = [...new Set([
      ...['V1','V2','V3','V4','V5','V6'],
      ...selectedOrc.projetos.map(p => p.versao).filter(Boolean),
    ])].sort(sortVersao);

    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltarLista}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Breadcrumb parts={[
            { label: 'Orçamentos', onClick: voltarLista },
            { label: selectedOrc.nome },
          ]} />
        </div>

        {/* Editable title */}
        <div className="mb-5">
          <EditableTitle
            value={selectedOrc.nome}
            onSave={(nome) => renomearOrcamento(selectedOrc.id, nome)}
            className="text-2xl"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">
                Média {latestVersao ? <span className={cn('px-1 py-0 rounded text-[10px] font-semibold border', versaoCor(latestVersao))}>{latestVersao}</span> : 'geral'}
              </p>
              <p className="text-lg font-bold mt-0.5">{formatCurrency(totalAtivo)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">Orçamentos</p>
              <p className="text-lg font-bold mt-0.5">{selectedOrc.projetos.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">Ficheiros</p>
              <p className="text-lg font-bold mt-0.5">
                {selectedOrc.projetos.reduce((s, p) => s + p.ficheiros.length, 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Características do projeto */}
        <Card className="mb-5">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              Características do Projeto
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-5 space-y-4">
            {/* Áreas principais */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Áreas construídas
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  ['m2AcimaSolo',   'm² acima do solo'],
                  ['m2AbaixoSolo',  'm² abaixo do solo'],
                  ['m2Retalho',     'm² retalho'],
                  ['numApartamentos','Nº apartamentos'],
                ] as const).map(([field, label]) => (
                  <div key={field}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type="number" min={0} className="mt-1 h-8"
                      value={(selectedOrc[field] as number) || ''}
                      placeholder="0"
                      onChange={(e) => atualizarCaracteristica(
                        selectedOrc.id, field,
                        field === 'numApartamentos'
                          ? parseInt(e.target.value) || 0
                          : parseFloat(e.target.value) || 0,
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Áreas complementares */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Áreas complementares (m²)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  ['m2AreasComuns',   'Áreas comuns'],
                  ['m2Circulacao',    'Circulação'],
                  ['m2AreasTecnicas', 'Áreas técnicas'],
                  ['m2Terracos',      'Terraços'],
                ] as const).map(([field, label]) => (
                  <div key={field}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type="number" min={0} className="mt-1 h-8"
                      value={(selectedOrc[field] as number) || ''}
                      placeholder="0"
                      onChange={(e) => atualizarCaracteristica(
                        selectedOrc.id, field, parseFloat(e.target.value) || 0,
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Derived metrics */}
            {(() => {
              const m2Total = selectedOrc.m2AcimaSolo + selectedOrc.m2AbaixoSolo;
              const m2Util  = selectedOrc.m2AcimaSolo + selectedOrc.m2AbaixoSolo
                - selectedOrc.m2AreasComuns - selectedOrc.m2Circulacao
                - selectedOrc.m2AreasTecnicas;
              if (totalOrc === 0 || m2Total === 0) return null;
              return (
                <div className="pt-3 border-t flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
                  <span>Custo/m² total: <span className="font-semibold text-foreground">
                    {formatCurrency(Math.round(totalOrc / m2Total))}/m²
                  </span></span>
                  {m2Util > 0 && (
                    <span>Custo/m² útil: <span className="font-semibold text-foreground">
                      {formatCurrency(Math.round(totalOrc / m2Util))}/m²
                    </span></span>
                  )}
                  {selectedOrc.numApartamentos > 0 && (
                    <span>Custo/apartamento: <span className="font-semibold text-foreground">
                      {formatCurrency(Math.round(totalOrc / selectedOrc.numApartamentos))}
                    </span></span>
                  )}
                  {selectedOrc.m2Retalho > 0 && (
                    <span>Custo/m² retalho: <span className="font-semibold text-foreground">
                      {formatCurrency(Math.round(totalOrc / selectedOrc.m2Retalho))}/m²
                    </span></span>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Orçamentos list */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Orçamentos ({selectedOrc.projetos.length})
          </h2>
          <div className="flex gap-2">
            {selectedOrc.projetos.length >= 2 && (
              <Button size="sm" variant="outline" className="gap-1.5 h-8 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={irParaComparacaoOrc}>
                <BarChart2 className="h-3.5 w-3.5" />
                Analisar
              </Button>
            )}
            <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowNovoProj(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo Orçamento
            </Button>
          </div>
        </div>

        {selectedOrc.projetos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Ainda não há orçamentos neste projeto.</p>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setShowNovoProj(true)}>
              <Plus className="h-3.5 w-3.5" /> Criar primeiro orçamento
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedOrc.projetos.map((proj, idx) => {
              const caps       = getCapitulosNivel1(proj);
              const gaps       = detectarGaps(caps);
              const totalProj  = getProjetoTotal(proj);
              const isDefault  = selectedOrc.projetoDefault === proj.id;
              return (
                <Card key={proj.id}
                  className={cn('hover:shadow-sm transition-all cursor-pointer', isDefault && 'ring-1 ring-amber-400')}
                  onClick={() => irParaProjeto(proj.id)}>
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: ORC_PALETTE[idx % ORC_PALETTE.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <EditableTitle
                        value={proj.nome}
                        onSave={(nome) => renomearProjeto(proj.id, nome)}
                        className="text-sm"
                      />
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {proj.ficheiros.length} ficheiro(s)
                        </span>
                        {caps.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {caps.map(c => (
                              <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                Cap. {c}
                              </Badge>
                            ))}
                            {gaps.length > 0 && (
                              <Badge variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-300">
                                <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                                {gaps.join(', ')} em falta
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Version selector */}
                    <Select
                      value={proj.versao || '__none__'}
                      onValueChange={(v) => atualizarVersaoProjeto(proj.id, v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger
                        className={cn(
                          'h-6 text-[11px] w-20 px-2 border rounded-full font-semibold shrink-0',
                          proj.versao ? versaoCor(proj.versao) : 'text-muted-foreground border-muted',
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SelectValue placeholder="Versão" />
                      </SelectTrigger>
                      <SelectContent onClick={(e) => e.stopPropagation()}>
                        <SelectItem value="__none__" className="text-xs text-muted-foreground">Sem versão</SelectItem>
                        {versoesOpcoes.map(v => (
                          <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm font-bold shrink-0">{formatCurrency(totalProj)}</p>
                    {selectedOrc.m2AcimaSolo + selectedOrc.m2AbaixoSolo > 0 && totalProj > 0 && (
                      <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                        {formatCurrency(Math.round(totalProj / (selectedOrc.m2AcimaSolo + selectedOrc.m2AbaixoSolo)))}/m²
                      </p>
                    )}
                    <Button variant="ghost" size="sm"
                      title={isDefault ? 'Remover como principal' : 'Definir como principal'}
                      className={cn('h-8 w-8 p-0 shrink-0', isDefault ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground hover:text-amber-500')}
                      onClick={(e) => { e.stopPropagation(); definirProjetoDefault(selectedOrc.id, proj.id); }}>
                      <Star className={cn('h-4 w-4', isDefault && 'fill-amber-500')} />
                    </Button>
                    <Button variant="ghost" size="sm"
                      className="text-muted-foreground hover:text-red-600 h-8 w-8 p-0 shrink-0"
                      onClick={(e) => { e.stopPropagation(); eliminarProjeto(proj.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Dialog: Novo Orçamento */}
        <Dialog open={showNovoProj} onOpenChange={setShowNovoProj}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Novo Orçamento</DialogTitle></DialogHeader>
            <div className="py-2">
              <Label htmlFor="proj-nome" className="text-sm">Nome do orçamento</Label>
              <Input id="proj-nome" className="mt-1.5" placeholder="Ex: Concorrente X"
                value={novoProjNome} onChange={(e) => setNovoProjNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && criarProjeto()} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNovoProj(false)}>Cancelar</Button>
              <Button onClick={criarProjeto} disabled={!novoProjNome.trim()}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Projeto (detalhe — o que o utilizador chama "Orçamento")
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'projeto' && selectedProj) {
    const totalProj = getProjetoTotal(selectedProj);
    const caps      = getCapitulosNivel1(selectedProj);
    const gaps      = detectarGaps(caps);
    const ficheiroIndex: Record<string, number> = {};
    selectedProj.ficheiros.forEach((f, i) => { ficheiroIndex[f.id] = i; });
    const mergedLinhas = selectedProj.ficheiros
      .slice().sort((a, b) => a.carregadoEm.localeCompare(b.carregadoEm))
      .flatMap(f => f.linhas);

    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltarOrcamento}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Breadcrumb parts={[
            { label: 'Orçamentos', onClick: voltarLista },
            { label: selectedOrc?.nome ?? '', onClick: voltarOrcamento },
            { label: selectedProj.nome },
          ]} />
        </div>

        {/* Editable title */}
        <div className="mb-5">
          <EditableTitle
            value={selectedProj.nome}
            onSave={(nome) => renomearProjeto(selectedProj.id, nome)}
            className="text-2xl"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold mt-0.5">{formatCurrency(totalProj)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">Ficheiros</p>
              <p className="text-lg font-bold mt-0.5">{selectedProj.ficheiros.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">Estado</p>
              <p className={cn('text-sm font-bold mt-0.5',
                gaps.length > 0 ? 'text-amber-600' : caps.length > 0 ? 'text-green-600' : 'text-muted-foreground')}>
                {caps.length === 0 ? 'Sem dados' : gaps.length > 0 ? 'Incompleto' : 'Completo'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Chapter badges */}
        {caps.length > 0 && (
          <Card className="mb-4">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground font-medium mb-2">Capítulos presentes</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {caps.map(c => <Badge key={c} variant="secondary" className="text-xs">Cap. {c}</Badge>)}
                {gaps.map(g => (
                  <Badge key={g} variant="outline"
                    className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                    <AlertCircle className="h-3 w-3 mr-1" /> Cap. {g} em falta
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload zone */}
        <div
          role="button" tabIndex={0} aria-label="Carregar ficheiro Excel"
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-6 select-none outline-none',
            isDragging
              ? 'border-blue-500 bg-blue-50 scale-[1.01]'
              : 'border-muted-foreground/25 hover:border-blue-400 hover:bg-muted/20',
          )}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <FileSpreadsheet className={cn('h-10 w-10 mx-auto mb-2 transition-colors',
            isDragging ? 'text-blue-500' : 'text-muted-foreground/40')} />
          <p className="font-medium text-sm mb-0.5">Adicionar ficheiro(s)</p>
          <p className="text-xs text-muted-foreground">.xlsx · .xls · .pdf · arraste um ou vários</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf" multiple className="hidden"
            onChange={(e) => {
              if (!e.target.files) return;
              const files = Array.from(e.target.files);
              if (files.length === 1) handleFile(files[0]);
              else parseParaBatch(files).then(fps => { if (fps.length) { setIsBatchMode(true); setBatchFiles(fps); setView('batch'); } });
              e.target.value = '';
            }} />
        </div>

        {/* Ficheiros list + toggle */}
        {selectedProj.ficheiros.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Ficheiros ({selectedProj.ficheiros.length})
              </h2>
              <div className="flex gap-1.5">
                <Button size="sm" variant={projetoModo === 'consolidado' ? 'default' : 'outline'}
                  className="h-7 text-xs gap-1.5" onClick={() => setProjetoModo('consolidado')}>
                  <Layers className="h-3.5 w-3.5" /> Consolidado
                </Button>
                <Button size="sm" variant={projetoModo === 'ficheiros' ? 'default' : 'outline'}
                  className="h-7 text-xs gap-1.5" onClick={() => setProjetoModo('ficheiros')}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Ficheiros
                </Button>
              </div>
            </div>

            {projetoModo === 'ficheiros' ? (
              <div className="space-y-2">
                {selectedProj.ficheiros.map((fic, idx) => {
                  const ficCaps = new Set<string>();
                  fic.linhas.filter(l => l.nivel === 1 && l.numero).forEach(l => ficCaps.add(l.numero.trim()));
                  return (
                    <Card key={fic.id}>
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', FIC_COLORS[idx % FIC_COLORS.length])} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{fic.nome}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fic.folha} · {fic.linhas.length} linhas ·{' '}
                            {new Date(fic.carregadoEm).toLocaleDateString('pt-PT')}
                            {ficCaps.size > 0 && (
                              <span> · Cap. {Array.from(ficCaps).sort((a, b) => parseFloat(a) - parseFloat(b)).join(', ')}</span>
                            )}
                          </p>
                        </div>
                        <p className="text-sm font-bold shrink-0">{formatCurrency(fic.total)}</p>
                        <Button variant="ghost" size="sm"
                          className="text-muted-foreground hover:text-red-600 h-8 w-8 p-0 shrink-0"
                          onClick={() => eliminarFicheiro(fic.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <LinhaTreeTable
                  linhas={mergedLinhas}
                  totalBase={totalProj}
                  ficheiroIndex={ficheiroIndex}
                />
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Lista (default)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Orçamentos</h1>
          <p className="section-subtitle mt-1">Gerencie projetos e compare propostas</p>
        </div>
        <div className="flex gap-2">
          {orcamentos.length >= 2 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setView('comparar')}>
              <BarChart2 className="h-4 w-4" /> Comparar
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setShowNovoOrc(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo Projeto
          </Button>
        </div>
      </div>

      {orcamentos.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium">Ainda não tem projetos.</p>
          <p className="text-xs mt-1 mb-4">Crie um projeto para começar a organizar orçamentos.</p>
          <Button variant="outline" className="gap-1.5" onClick={() => setShowNovoOrc(true)}>
            <Plus className="h-4 w-4" /> Criar primeiro projeto
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {orcamentos.map(orc => {
            const nFics       = orc.projetos.reduce((s, p) => s + p.ficheiros.length, 0);
            const defaultProj = orc.projetoDefault ? orc.projetos.find(p => p.id === orc.projetoDefault) : null;
            const displayTotal = defaultProj ? getProjetoTotal(defaultProj) : getTotalAtivo(orc);
            const displayLabel = defaultProj ? defaultProj.nome : null;
            return (
              <Card key={orc.id} className="hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => irParaOrcamento(orc.id)}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <FolderOpen className="h-5 w-5 text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{orc.nome}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {orc.projetos.length} orçamento(s) · {nFics} ficheiro(s) ·{' '}
                      {new Date(orc.criadoEm).toLocaleDateString('pt-PT')}
                      {(orc.m2AcimaSolo + orc.m2AbaixoSolo) > 0 && (
                        <span> · {orc.m2AcimaSolo + orc.m2AbaixoSolo} m²</span>
                      )}
                      {orc.numApartamentos > 0 && (
                        <span> · {orc.numApartamentos} apt.</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">{formatCurrency(displayTotal)}</p>
                    {displayLabel && (
                      <p className="text-[10px] text-amber-600 font-medium flex items-center justify-end gap-0.5 mt-0.5">
                        <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                        {displayLabel}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm"
                    className="text-muted-foreground hover:text-red-600 h-8 w-8 p-0 shrink-0"
                    onClick={(e) => { e.stopPropagation(); eliminarOrcamento(orc.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog: Novo Projeto */}
      <Dialog open={showNovoOrc} onOpenChange={setShowNovoOrc}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Projeto</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label htmlFor="orc-nome" className="text-sm">Nome do projeto</Label>
            <Input id="orc-nome" className="mt-1.5" placeholder="Ex: Moradia T3 – Lote 5"
              value={novoOrcNome} onChange={(e) => setNovoOrcNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && criarOrcamento()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovoOrc(false)}>Cancelar</Button>
            <Button onClick={criarOrcamento} disabled={!novoOrcNome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
