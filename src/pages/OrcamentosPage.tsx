import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { v4, formatCurrency, cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useApp } from '@/contexts/AppContext';
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
  EyeOff, Eye, Link2, FileDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
  LineChart, Line, ReferenceLine,
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

type TipoAlteracao = 'otimizacao' | 'por_adicionar' | 'remover';

interface CenarioAlteracao {
  id: string;
  tipo: TipoAlteracao;
  capitulo: string; // chapter number e.g. "1", "2"
  descricao: string;
  valor: number; // positive = cost increase, negative = savings/removal
}

interface CenarioCapitulo {
  numero: string;
  descricao: string;
  fonte: 'media' | string; // 'media' or projetoId
  totalBase: number;
}

interface CenarioConfig {
  capitulos: CenarioCapitulo[];
  projetosBase: string[];
  alteracoes: CenarioAlteracao[];
  capitulosOcultos?: string[];
}

interface AnaliseGuardada {
  id: string;
  nome: string;
  criadoEm: string;
  versoes: string[];
  projIdsExcluded: string[];
  ignoredCaps: string[];
  m2Field: string;
}

interface Projeto {
  id: string; nome: string; criadoEm: string; ficheiros: ExcelFicheiro[];
  versao: string;
  tipo?: 'orcamento' | 'cenario';
  cenarioConfig?: CenarioConfig;
}

interface OrcamentoFracao {
  id: string;
  nome: string;   // e.g. "Fração A", "T2 – Piso 1"
  m2: number;
  quantidade?: number; // number of units of this fraction type
}

interface Orcamento {
  id: string; nome: string; criadoEm: string; projetos: Projeto[];
  m2AcimaSolo: number; m2AbaixoSolo: number; numApartamentos: number;
  m2Retalho: number; m2AreasComuns: number; m2Circulacao: number;
  m2AreasTecnicas: number; m2Terracos: number;
  projetoDefault: string | null;
  projetoId: string | null;
  fracoes: OrcamentoFracao[];
}

interface FilePendente {
  id: string; nome: string; nomeDisplay: string;
  workbook: XLSX.WorkBook; folhaNomes: string[];
  folhaSelecionada: string; rawRows: unknown[][]; colLabels: string[];
  mapeamento: ColunaRole[]; linhaInicio: number; linhaFim: number;
  linhasProcessadas: LinhaOrcamento[]; total: number; configured: boolean;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const LS_KEY      = 'orcamentos_v2';
const DELETED_KEY = 'orc_deleted_ids';
// Module-level set — survives component unmount/remount within the same browser session
const _deletedIdsModule = new Set<string>(
  (() => { try { return JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]'); } catch { return []; } })()
);
function loadDeletedIds(): Set<string> { return _deletedIdsModule; }
function markDeletedId(id: string) {
  _deletedIdsModule.add(id);
  try { localStorage.setItem(DELETED_KEY, JSON.stringify([..._deletedIdsModule])); } catch {}
}
function loadOrcamentosLS(): Orcamento[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    return raw.map((o: Orcamento) => ({
      m2AcimaSolo: 0, m2AbaixoSolo: 0, numApartamentos: 0,
      m2Retalho: 0, m2AreasComuns: 0, m2Circulacao: 0, m2AreasTecnicas: 0, m2Terracos: 0,
      projetoDefault: null, projetoId: null, fracoes: [],
      ...o,
      projetos: (o.projetos ?? []).map((p: Projeto) => ({ versao: '', tipo: 'orcamento' as const, ...p })),
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
  projeto_id: string | null;
  fracoes: OrcamentoFracao[] | null;
};
type DbProjeto  = { id: string; orcamento_id: string; nome: string; versao: string; criado_em: string; tipo: string; cenario_config: CenarioConfig | null; };
type DbFicheiro = { id: string; projeto_id: string; nome: string; folha: string; carregado_em: string; total: number; linhas: LinhaOrcamento[]; };

function orcToRow(o: Orcamento, userId: string, workspaceId: string | null): DbOrcamento {
  return {
    id: o.id, user_id: userId, workspace_id: workspaceId,
    nome: o.nome, criado_em: o.criadoEm,
    m2_acima_solo: o.m2AcimaSolo, m2_abaixo_solo: o.m2AbaixoSolo, num_apartamentos: o.numApartamentos,
    m2_retalho: o.m2Retalho, m2_areas_comuns: o.m2AreasComuns, m2_circulacao: o.m2Circulacao,
    m2_areas_tecnicas: o.m2AreasTecnicas, m2_terracos: o.m2Terracos,
    projeto_default: o.projetoDefault ?? null,
    projeto_id: o.projetoId ?? null,
    fracoes: o.fracoes?.length ? o.fracoes : null,
  };
}
function projToRow(p: Projeto, orcId: string): DbProjeto {
  return {
    id: p.id, orcamento_id: orcId, nome: p.nome, versao: p.versao, criado_em: p.criadoEm,
    tipo: p.tipo ?? 'orcamento',
    cenario_config: p.cenarioConfig ?? null,
  };
}
function ficToRow(f: ExcelFicheiro, projId: string): DbFicheiro {
  return { id: f.id, projeto_id: projId, nome: f.nome, folha: f.folha, carregado_em: f.carregadoEm, total: f.total, linhas: f.linhas };
}

async function loadOrcamentosDB(userId: string, workspaceId: string | null): Promise<Orcamento[]> {
  const q = supabase
    .from('orcamentos')
    .select(`id,nome,criado_em,m2_acima_solo,m2_abaixo_solo,num_apartamentos,m2_retalho,m2_areas_comuns,m2_circulacao,m2_areas_tecnicas,m2_terracos,projeto_id,projeto_default,fracoes,
      orcamento_projetos(id,nome,versao,criado_em,tipo,cenario_config,
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
    projetoId: row.projeto_id ?? null,
    fracoes: (row.fracoes ?? []) as OrcamentoFracao[],
    projetos: (row.orcamento_projetos ?? []).map((p: any) => ({
      id: p.id, nome: p.nome, versao: p.versao ?? '', criadoEm: p.criado_em,
      tipo: (p.tipo ?? 'orcamento') as 'orcamento' | 'cenario',
      cenarioConfig: p.cenario_config ?? undefined,
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

// Remove pontos finais e espaços: "4.2." → "4.2", "1.1.1." → "1.1.1"
function normalizeNumero(n: string): string {
  return (n ?? '').trim().replace(/\.+$/, '');
}

function getNivel(numero: string): number {
  const s = normalizeNumero(numero);
  if (!s || !/^\d/.test(s)) return 0;
  // Only treat as hierarchy if the number is purely digits separated by dots (e.g. "1.2.3").
  // Numbers like "7.1 + 7.2" contain extra chars and should be treated as top-level.
  if (!/^\d+(\.\d+)*$/.test(s)) return 1;
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
  const hasTotalCol    = mapeamento.includes('total');
  const hasCapituloCol = mapeamento.includes('capitulo');
  const result: LinhaOrcamento[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    if ((row as unknown[]).every(c => c === null || c === '')) continue;
    let numero = '', descricao = '', unidade = '', observacoes = '';
    let quantidade = 0, precoUnitario = 0, total = 0;
    mapeamento.forEach((role, i) => {
      const val = (row as unknown[])[i] ?? null;
      switch (role) {
        case 'capitulo':      numero        = normalizeNumero(String(val ?? '')); break;
        case 'descricao':     descricao     = String(val ?? '').trim(); break;
        case 'unidade':       unidade       = String(val ?? '').trim(); break;
        case 'quantidade':    quantidade    = toNumber(val); break;
        case 'precoUnitario': precoUnitario = toNumber(val); break;
        case 'total':         total         = toNumber(val); break;
        case 'observacoes':   observacoes   = String(val ?? '').trim(); break;
      }
    });
    // Se a coluna capitulo está mapeada, só aceita linhas com numeração válida (começa por dígito).
    // Linhas com categoria vazia, símbolos (>, >>, -, *…) ou texto livre são descartadas.
    if (hasCapituloCol ? !/^\d/.test(numero) : (!numero && !descricao)) continue;
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
      const numStr    = normalizeNumero(l.numero);
      const filhosNum = res.filter(f => f.nivel === nivel + 1 &&
        normalizeNumero(f.numero).split('.').slice(0, nivel).join('.') === numStr);
      const filhosNao = res.filter(f => normalizeNumero(f.parentNumero) === numStr);
      if (filhosNum.length === 0 && filhosNao.length === 0) return { ...l, isCapitulo: false };
      const somaCalculada =
        filhosNum.reduce((s, f) => s + f.total, 0) +
        filhosNao.reduce((s, f) => s + f.total, 0);
      // Se os filhos têm valores, usa a soma calculada (ignora total do Excel no pai).
      // Se os filhos têm total=0 (linhas descritivas sem preço), mantém o valor do Excel no pai.
      const total = somaCalculada > 0 ? somaCalculada : l.total;
      return { ...l, total, isCapitulo: true, erroHierarquia: false, somaCalculada };
    });
  }
  return res;
}

function isLinhaVisivel(linha: LinhaOrcamento, expandidos: Set<string>): boolean {
  if (linha.nivel >= 1) {
    if (linha.nivel === 1) return true;
    const partes = normalizeNumero(linha.numero).split('.');
    for (let i = 1; i < linha.nivel; i++) {
      if (!expandidos.has(partes.slice(0, i).join('.'))) return false;
    }
    return true;
  }
  const pn = normalizeNumero(linha.parentNumero);
  if (!pn) return true;
  if (!expandidos.has(pn)) return false;
  const parentNivel = getNivel(pn);
  if (parentNivel > 1) {
    const partes = pn.split('.');
    for (let i = 1; i < parentNivel; i++) {
      if (!expandidos.has(partes.slice(0, i).join('.'))) return false;
    }
  }
  return true;
}

function calcLinhasTotal(linhas: LinhaOrcamento[]): number {
  const processed = processarHierarquia(linhas.map(l => ({ ...l, nivel: getNivel(l.numero) })));
  return processed.filter(l => l.nivel === 1 && l.numero).reduce((s, l) => s + l.total, 0);
}
function getCenarioCapituloTotal(cap: CenarioCapitulo, alteracoes: CenarioAlteracao[]): number {
  // Include alterações targeting this chapter OR any of its sub-chapters (e.g. "1" includes "1.1", "1.2")
  return cap.totalBase + alteracoes
    .filter(a => a.capitulo === cap.numero || a.capitulo.startsWith(cap.numero + '.'))
    .reduce((s, a) => s + a.valor, 0);
}
function getProjetoTotal(p: Projeto): number {
  if (p.tipo === 'cenario' && p.cenarioConfig) {
    const alt     = p.cenarioConfig.alteracoes ?? [];
    const ocultos = new Set(p.cenarioConfig.capitulosOcultos ?? []);
    return p.cenarioConfig.capitulos
      .filter(cap => !ocultos.has(cap.numero))
      .reduce((s, cap) => s + getCenarioCapituloTotal(cap, alt), 0);
  }
  const allLinhas = p.ficheiros.flatMap(f => f.linhas);
  if (allLinhas.length === 0) return p.ficheiros.reduce((s, f) => s + f.total, 0);
  return calcLinhasTotal(allLinhas);
}
function getOrcamentoTotal(o: Orcamento): number {
  return o.projetos.reduce((s, p) => s + getProjetoTotal(p), 0);
}
function getCapitulosNivel1(p: Projeto): string[] {
  const caps = new Set<string>();
  for (const f of p.ficheiros)
    for (const l of f.linhas) {
      const num = normalizeNumero(l.numero);
      if (getNivel(num) === 1 && num) caps.add(num);
    }
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

interface CapTotal { numero: string; descricao: string; total: number; nivel: number; }
// Returns totals for all levels (nivel 1, 2, 3...) from a project's linhas
function getCapituloTotaisAll(proj: Projeto): CapTotal[] {
  if (proj.tipo === 'cenario') return [];
  const map = new Map<string, { descricao: string; total: number; nivel: number }>();
  for (const f of proj.ficheiros) {
    const processed = processarHierarquia(
      f.linhas.map(l => ({ ...l, numero: normalizeNumero(l.numero), nivel: getNivel(l.numero) }))
    );
    for (const l of processed) {
      if (l.numero && l.nivel >= 1) {
        const ex = map.get(l.numero);
        if (ex) ex.total += l.total;
        else map.set(l.numero, { descricao: l.descricao, total: l.total, nivel: l.nivel });
      }
    }
  }
  return Array.from(map.entries())
    .map(([numero, { descricao, total, nivel }]) => ({ numero, descricao, total, nivel }))
    .sort((a, b) => sortNumericamente(a.numero, b.numero));
}

function getCapituloTotais(proj: Projeto): CapTotal[] {
  if (proj.tipo === 'cenario' && proj.cenarioConfig) {
    const alt     = proj.cenarioConfig.alteracoes ?? [];
    const ocultos = new Set(proj.cenarioConfig.capitulosOcultos ?? []);
    return proj.cenarioConfig.capitulos
      .filter(cap => !ocultos.has(cap.numero))
      .map(cap => ({ numero: cap.numero, descricao: cap.descricao, total: getCenarioCapituloTotal(cap, alt), nivel: 1 }))
      .sort((a, b) => parseFloat(a.numero) - parseFloat(b.numero));
  }
  const map = new Map<string, { descricao: string; total: number }>();
  for (const f of proj.ficheiros) {
    const processed = processarHierarquia(
      f.linhas.map(l => ({ ...l, numero: normalizeNumero(l.numero), nivel: getNivel(l.numero) }))
    );
    for (const l of processed) {
      if (getNivel(l.numero) === 1 && l.numero) {
        const ex = map.get(l.numero);
        if (ex) ex.total += l.total;
        else map.set(l.numero, { descricao: l.descricao, total: l.total });
      }
    }
  }
  return Array.from(map.entries())
    .map(([numero, { descricao, total }]) => ({ numero, descricao, total, nivel: 1 }))
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
    .filter(l => {
      const num = normalizeNumero(l.numero);
      return getNivel(num) >= 2 && num && parseFloat(num.split('.')[0]) === capNum;
    })
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
  onRemoverLinha?: (id: string) => void;
}

function LinhaTreeTable({
  linhas, totalBase, ficheiroIndex, editavel = false,
  onEscolherValor, externalDismissed, onDismiss, onRemoverLinha,
}: LinhaTreeTableProps) {
  // Todos os prefixos ancestrais necessários para visibilidade total
  const todosAncestores = useMemo(() => {
    const s = new Set<string>();
    for (const l of linhas) {
      if (!l.numero || l.nivel < 1) continue;
      const partes = l.numero.trim().split('.');
      for (let i = 1; i <= partes.length; i++) s.add(partes.slice(0, i).join('.'));
    }
    return s;
  }, [linhas]);

  const [expandidos, setExpandidos] = useState<Set<string>>(() =>
    editavel ? new Set((() => {
      const s = new Set<string>();
      for (const l of linhas) {
        if (!l.numero || l.nivel < 1) continue;
        const partes = l.numero.trim().split('.');
        for (let i = 1; i <= partes.length; i++) s.add(partes.slice(0, i).join('.'));
      }
      return s;
    })()) : new Set()
  );
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());
  const dismissed = externalDismissed ?? localDismissed;

  const tudo = todosAncestores.size > 0 && [...todosAncestores].every(n => expandidos.has(n));
  const expandirTudo = () => setExpandidos(new Set(todosAncestores));
  const colapsarTudo = () => setExpandidos(new Set());

  const toggleExpandido = (n: string) => {
    const key = normalizeNumero(n);
    setExpandidos(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  };

  const dismiss = (id: string) => {
    onDismiss?.(id);
    if (!externalDismissed) setLocalDismissed(prev => new Set(prev).add(id));
  };
  const escolher = (id: string, total: number) => {
    onEscolherValor?.(id, total);
    dismiss(id);
  };

  const temObs  = linhas.some(l => l.observacoes);
  const numerosComFilhos = useMemo(() => {
    const s = new Set<string>();
    for (const l of linhas) {
      if (l.nivel >= 2) {
        const partes = normalizeNumero(l.numero).split('.');
        for (let i = 1; i < l.nivel; i++) s.add(partes.slice(0, i).join('.'));
      }
      if (l.parentNumero) s.add(normalizeNumero(l.parentNumero));
    }
    return s;
  }, [linhas]);
  const visiveis = useMemo(
    () => linhas.filter(l => isLinhaVisivel(l, expandidos)),
    [linhas, expandidos],
  );

  return (
    <div className="overflow-auto">
      {todosAncestores.size > 0 && (
        <div className="flex justify-end px-3 py-1.5 border-b bg-muted/20">
          <button onClick={tudo ? colapsarTudo : expandirTudo}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            {tudo ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {tudo ? 'Colapsar tudo' : 'Expandir tudo'}
          </button>
        </div>
      )}
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
          <col className="w-12" />
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

            const eCapitulo = linha.isCapitulo || numerosComFilhos.has(linha.numero);
            const eNivel1 = linha.nivel === 1;
            const eNivel2Cap = linha.nivel === 2 && eCapitulo;
            return (
              <tr key={linha.id} className={cn(
                'border-b group',
                eNivel1 ? 'bg-slate-200 font-bold border-t-2 border-t-slate-400 text-slate-900'
                  : eNivel2Cap ? 'bg-slate-50 font-semibold'
                  : eCapitulo ? 'font-semibold hover:bg-muted/20'
                  : 'hover:bg-muted/10',
                temErro ? 'bg-amber-50' : '',
              )}>
                <td className="px-1 py-1 text-center">
                  {eCapitulo && (
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
                <td className="px-1 py-1.5">
                  <div className="flex items-center justify-end gap-0.5">
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
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    ) : dismissed.has(linha.id) ? (
                      <BadgeCheck className="h-3.5 w-3.5 text-green-500" />
                    ) : linha.isCapitulo ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : null}
                    {onRemoverLinha && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoverLinha(linha.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-4 w-4 rounded flex items-center justify-center text-muted-foreground hover:text-red-600"
                        title="Remover linha permanentemente"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
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
  const { projetos: _allProjetos, atualizarProjeto } = useApp();
  const topProjetos = _allProjetos.filter(p => p.tipo === 'projeto');
  const workspaceId                 = activeWorkspace?.id ?? null;

  // Navigation — restore from localStorage on mount so closing/reopening the site restores position
  const NAV_KEY = 'orc_nav';
  const savedNav = (() => { try { return JSON.parse(localStorage.getItem(NAV_KEY) ?? '{}'); } catch { return {}; } })();
  const STABLE_VIEWS: View[] = ['lista', 'orcamento', 'projeto', 'comparar-orc', 'comparar'];
  const initialView: View = STABLE_VIEWS.includes(savedNav.view) ? savedNav.view : 'lista';

  const [view, setView]                     = useState<View>(initialView);
  const [selectedOrcId, setSelectedOrcId]   = useState<string | null>(savedNav.orcId ?? null);
  const [selectedProjId, setSelectedProjId] = useState<string | null>(savedNav.projId ?? null);

  // Persist nav state so leaving and returning to this page restores position
  useEffect(() => {
    if (STABLE_VIEWS.includes(view)) {
      localStorage.setItem(NAV_KEY, JSON.stringify({ view, orcId: selectedOrcId, projId: selectedProjId }));
    }
  }, [view, selectedOrcId, selectedProjId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Data — start empty; populated by Supabase (or localStorage fallback) on mount
  const [_orcamentos, setOrcamentos]  = useState<Orcamento[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ── Load from Supabase on mount (+ migrate localStorage if DB is empty) ───
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      const raw    = await loadOrcamentosDB(user.id, workspaceId);
      if (cancelled) return;
      const deletedIds = loadDeletedIds();
      const dbData = raw.filter(o => !deletedIds.has(o.id));

      if (dbData.length > 0) {
        setOrcamentos(dbData);
        saveOrcamentosLS(dbData);
      } else {
        // First time / DB empty for this context: migrate local-only records
        const local = loadOrcamentosLS().filter(o => !deletedIds.has(o.id));
        if (local.length > 0) {
          setOrcamentos(local);
          await migrateLocalToSupabase(local, user.id, workspaceId);
        } else {
          setOrcamentos([]);
        }
      }
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // React-state layer of deleted IDs — survives any setOrcamentos() call within the session
  const [deletedIdsState, setDeletedIdsState] = useState<Set<string>>(() => loadDeletedIds());
  // The true visible list: always filter by both localStorage tombstone + React state
  const orcamentos = useMemo(
    () => _orcamentos.filter(o => !deletedIdsState.has(o.id)),
    [_orcamentos, deletedIdsState],
  );

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
    const { data: projs } = await supabase.from('orcamento_projetos').select('id').eq('orcamento_id', id);
    const projIds = (projs ?? []).map((p: { id: string }) => p.id);
    if (projIds.length > 0) {
      await supabase.from('orcamento_ficheiros').delete().in('projeto_id', projIds);
      await supabase.from('orcamento_projetos').delete().in('id', projIds);
    }
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
  const [showNovoOrc, setShowNovoOrc]         = useState(false);
  const [novoOrcNome, setNovoOrcNome]         = useState('');
  const [novoOrcProjetoId, setNovoOrcProjetoId] = useState<string>('');
  const [showNovoProj, setShowNovoProj]       = useState(false);
  const [novoProjNome, setNovoProjNome]       = useState('');

  // Handle navigation from ProjetoDetalhe (open a specific orcamento or open create dialog pre-linked)
  useEffect(() => {
    if (loadingData) return;
    const targetId = sessionStorage.getItem('targetOrcId');
    if (targetId) {
      sessionStorage.removeItem('targetOrcId');
      const found = orcamentos.find(o => o.id === targetId);
      if (found) { setSelectedOrcId(targetId); setView('orcamento'); return; }
    }
    const newForProjId = sessionStorage.getItem('newOrcProjetoId');
    if (newForProjId) {
      sessionStorage.removeItem('newOrcProjetoId');
      setNovoOrcProjetoId(newForProjId);
      setShowNovoOrc(true);
    }
  }, [loadingData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Projeto sub-view
  const [projetoModo, setProjetoModo] = useState<'ficheiros' | 'consolidado'>('consolidado');
  const [expandedCenarioCaps, setExpandedCenarioCaps] = useState<Set<string>>(new Set());
  const toggleCenarioCap = (num: string) =>
    setExpandedCenarioCaps(prev => { const s = new Set(prev); s.has(num) ? s.delete(num) : s.add(num); return s; });

  // Local draft for orcamento characteristics (avoid auto-saving on every keystroke)
  const emptyCarac = { m2AcimaSolo: 0, m2AbaixoSolo: 0, numApartamentos: 0, m2Retalho: 0, m2AreasComuns: 0, m2Circulacao: 0, m2AreasTecnicas: 0, m2Terracos: 0 };
  const [caracDraft, setCaracDraft] = useState(emptyCarac);
  // Compute a stable key from the linked project's m² values so the draft
  // re-initialises whenever the project data changes (e.g. loads from Supabase)
  const _linkedProjForDraft = selectedOrcId
    ? (() => { const o = orcamentos.find(x => x.id === selectedOrcId); return o?.projetoId ? topProjetos.find(p => p.id === o.projetoId) : null; })()
    : null;
  const _caracSyncKey = `${selectedOrcId}|${_linkedProjForDraft
    ? [_linkedProjForDraft.m2AcimaSolo, _linkedProjForDraft.m2AbaixoSolo, _linkedProjForDraft.numApartamentos,
       _linkedProjForDraft.m2Retalho, _linkedProjForDraft.m2AreasComuns, _linkedProjForDraft.m2Circulacao,
       _linkedProjForDraft.m2AreasTecnicas, _linkedProjForDraft.m2Terracos].join(',')
    : 'none'}`;
  useEffect(() => {
    const o = orcamentos.find(x => x.id === selectedOrcId);
    if (!o) return;
    const linkedP = o.projetoId ? topProjetos.find(p => p.id === o.projetoId) : null;
    const src = linkedP ?? o;
    setCaracDraft({ m2AcimaSolo: src.m2AcimaSolo ?? 0, m2AbaixoSolo: src.m2AbaixoSolo ?? 0, numApartamentos: src.numApartamentos ?? 0, m2Retalho: src.m2Retalho ?? 0, m2AreasComuns: src.m2AreasComuns ?? 0, m2Circulacao: src.m2Circulacao ?? 0, m2AreasTecnicas: src.m2AreasTecnicas ?? 0, m2Terracos: src.m2Terracos ?? 0 });
  }, [_caracSyncKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Comparison controls
  const [expandedCaps, setExpandedCaps]         = useState<Set<string>>(new Set());
  const [ignoredCaps, setIgnoredCaps]           = useState<Set<string>>(new Set());
  const [ignoredSubNums, setIgnoredSubNums]     = useState<Set<string>>(new Set());
  const [compMode, setCompMode]                 = useState<'single' | 'multi'>('single');
  const [compVersoes, setCompVersoes]           = useState<Set<string>>(new Set());
  const [compOrcExcluded, setCompOrcExcluded]   = useState<Set<string>>(new Set());
  const [compM2Field, setCompM2Field]           = useState<string>('');
  const [fracaoVersao, setFracaoVersao]         = useState<string>('__latest__');

  // Saved analyses
  const getAnaliseKey = (orcId: string) => `analises_${orcId}`;
  const loadAnalises = (orcId: string): AnaliseGuardada[] => {
    try { return JSON.parse(localStorage.getItem(getAnaliseKey(orcId)) ?? '[]'); } catch { return []; }
  };
  const [analises, setAnalises]                 = useState<AnaliseGuardada[]>([]);
  const [showGravarAnalise, setShowGravarAnalise] = useState(false);
  const [nomeAnalise, setNomeAnalise]           = useState('');

  // Scenario creation
  const [showCriarCenario, setShowCriarCenario] = useState(false);
  const [nomeCenario, setNomeCenario]           = useState('');
  const [versaoCenario, setVersaoCenario]       = useState('');
  const [cenarioCaps, setCenarioCaps]           = useState<CenarioCapitulo[]>([]);

  // Cenario editor state (when viewing a cenario)
  const [cenarioEditCaps, setCenarioEditCaps]         = useState<CenarioCapitulo[]>([]);
  const [cenarioEditAlteracoes, setCenarioEditAlteracoes] = useState<CenarioAlteracao[]>([]);
  const [cenarioEditOcultos, setCenarioEditOcultos]   = useState<Set<string>>(new Set());

  const toggleCapExpand = (cap: string) =>
    setExpandedCaps(prev => { const s = new Set(prev); s.has(cap) ? s.delete(cap) : s.add(cap); return s; });
  const toggleIgnoredCap = (cap: string) =>
    setIgnoredCaps(prev => { const s = new Set(prev); s.has(cap) ? s.delete(cap) : s.add(cap); return s; });

  const buildCenarioCaps = (projs: Projeto[]): CenarioCapitulo[] => {
    const realProjs = projs.filter(p => p.tipo !== 'cenario');
    const allCapsSet = new Set<string>();
    realProjs.forEach(p => getCapituloTotais(p).forEach(c => allCapsSet.add(c.numero)));
    return Array.from(allCapsSet).sort((a, b) => parseFloat(a) - parseFloat(b)).map(num => {
      const capDescricao = realProjs.map(p => getCapituloTotais(p).find(c => c.numero === num)?.descricao ?? '').find(d => d) ?? '';
      const vals = realProjs.map(p => getCapituloTotais(p).find(c => c.numero === num)?.total ?? 0).filter(v => v > 0);
      const media = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      return { numero: num, descricao: capDescricao, fonte: 'media', totalBase: Math.round(media) };
    });
  };

  const gravarAnalise = (orcId: string, nome: string) => {
    const analise: AnaliseGuardada = {
      id: v4(), nome, criadoEm: new Date().toISOString(),
      versoes: Array.from(compVersoes),
      projIdsExcluded: Array.from(compOrcExcluded),
      ignoredCaps: Array.from(ignoredCaps),
      m2Field: compM2Field,
    };
    const updated = [...loadAnalises(orcId), analise];
    localStorage.setItem(getAnaliseKey(orcId), JSON.stringify(updated));
    setAnalises(updated);
  };

  const carregarAnalise = (a: AnaliseGuardada) => {
    setCompVersoes(new Set(a.versoes));
    setCompOrcExcluded(new Set(a.projIdsExcluded));
    setIgnoredCaps(new Set(a.ignoredCaps));
    setCompM2Field(a.m2Field);
  };

  const eliminarAnalise = (orcId: string, id: string) => {
    const updated = loadAnalises(orcId).filter(a => a.id !== id);
    localStorage.setItem(getAnaliseKey(orcId), JSON.stringify(updated));
    setAnalises(updated);
  };

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
  const [linhaFim, setLinhaFim]                 = useState(0); // 0 = sem limite
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

  // Memoize heavy chapter totals per project — avoids re-running processarHierarquia
  // on every state change (e.g. ignoredSubNums toggle)
  const capTotaisCache = useMemo(() => {
    const map = new Map<string, CapTotal[]>();
    (selectedOrc?.projetos ?? []).forEach(p => map.set(p.id, getCapituloTotais(p)));
    return map;
  }, [selectedOrc]);

  const capTotaisAllCache = useMemo(() => {
    const map = new Map<string, CapTotal[]>();
    (selectedOrc?.projetos ?? []).forEach(p => map.set(p.id, getCapituloTotaisAll(p)));
    return map;
  }, [selectedOrc]);

  const getCapTotais    = (p: Projeto) => capTotaisCache.get(p.id)    ?? getCapituloTotais(p);
  const getCapTotaisAll = (p: Projeto) => capTotaisAllCache.get(p.id) ?? getCapituloTotaisAll(p);

  // Subcapítulos do cenário activo — só recomputa quando o projeto ou orçamento mudam
  const cenarioSubcaps = useMemo(() => {
    if (!selectedProj || selectedProj.tipo !== 'cenario' || !selectedProj.cenarioConfig) {
      return { allSubcapsMap: new Map<string, { descricao: string; mediaTotal: number; nivel: number }>(), allSelectableNums: [] as [string, { descricao: string; mediaTotal: number; nivel: number }][] };
    }
    const bProjs = (selectedOrc?.projetos ?? []).filter(
      p => p.tipo !== 'cenario' && selectedProj.cenarioConfig!.projetosBase.includes(p.id)
    );
    const map = new Map<string, { descricao: string; mediaTotal: number; nivel: number }>();
    bProjs.forEach(p => getCapTotaisAll(p).forEach(c => {
      if (!map.has(c.numero)) map.set(c.numero, { descricao: c.descricao, mediaTotal: 0, nivel: c.nivel });
    }));
    map.forEach((val, num) => {
      const vals = bProjs.map(p => getCapTotaisAll(p).find(c => c.numero === num)?.total ?? 0).filter(v => v > 0);
      val.mediaTotal = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    });
    const allSelectableNums = Array.from(map.entries()).sort((a, b) => sortNumericamente(a[0], b[0]));
    return { allSubcapsMap: map, allSelectableNums };
  }, [selectedProj?.id, selectedOrc?.projetos]); // eslint-disable-line react-hooks/exhaustive-deps

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
      projetoDefault: null, projetoId: novoOrcProjetoId || null, fracoes: [],
    };
    updateOrcamentos(prev => [novo, ...prev]);
    setNovoOrcNome(''); setNovoOrcProjetoId(''); setShowNovoOrc(false);
    toast.success('Projeto criado!');
  };

  const eliminarOrcamento = (id: string) => {
    markDeletedId(id);
    setDeletedIdsState(prev => new Set([...prev, id]));
    saveOrcamentosLS(loadOrcamentosLS().filter(o => o.id !== id));
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
    const proj = selectedOrc?.projetos.find(p => p.id === projId);
    if (proj?.tipo === 'cenario' && proj.cenarioConfig) {
      setCenarioEditCaps(JSON.parse(JSON.stringify(proj.cenarioConfig.capitulos)));
      setCenarioEditAlteracoes(JSON.parse(JSON.stringify(proj.cenarioConfig.alteracoes ?? [])));
      setCenarioEditOcultos(new Set(proj.cenarioConfig.capitulosOcultos ?? []));
    }
    setView('projeto');
  };
  const voltarLista     = () => { setSelectedOrcId(null); setSelectedProjId(null); setView('lista'); };
  const voltarOrcamento = () => { setSelectedProjId(null); setView('orcamento'); };
  const voltarProjeto   = () => { setView('projeto'); resetUpload(); };

  const irParaComparacaoOrc = (orcId?: string) => {
    const id = orcId ?? selectedOrcId ?? '';
    setCompMode('single');
    setCompVersoes(new Set());
    setCompOrcExcluded(new Set());
    setCompM2Field('');
    setExpandedCaps(new Set());
    setIgnoredCaps(new Set());
    setAnalises(loadAnalises(id));
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
              linhaInicio: 1, linhaFim: 0, linhasProcessadas: [], total: 0, configured: false,
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
              linhaInicio: 1, linhaFim: 0, linhasProcessadas: [], total: 0, configured: false,
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
    setLinhaInicio(f.linhaInicio); setLinhaFim(f.linhaFim ?? 0); setLinhasProcessadas(f.linhasProcessadas);
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
        rawRows, colLabels, mapeamento, linhaInicio, linhaFim,
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
    const linhas    = parsearLinhas(rawRows.slice(linhaInicio - 1, linhaFim > 0 ? linhaFim : undefined), mapeamento);
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
            { label: 'Propostas', onClick: voltarLista },
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
            { label: 'Propostas', onClick: voltarLista },
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
            { label: 'Propostas', onClick: voltarLista },
            { label: selectedOrc?.nome ?? '', onClick: voltarOrcamento },
            { label: selectedProj?.nome ?? '', onClick: isBatchMode ? cancelarBatch : voltarProjeto },
            { label: 'Mapear Colunas' },
          ]} />
        </div>
        <Card className="mb-4">
          <CardContent className="py-4 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Label className="shrink-0 font-medium text-sm">Dados começam na linha:</Label>
              <input
                type="number"
                min={1}
                max={rawRows.length}
                value={linhaInicio}
                onChange={e => setLinhaInicio(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm font-mono text-center"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="shrink-0 font-medium text-sm">Acabam na linha:</Label>
              <input
                type="number"
                min={linhaInicio}
                max={rawRows.length}
                value={linhaFim || ''}
                placeholder="fim"
                onChange={e => {
                  const v = parseInt(e.target.value);
                  setLinhaFim(isNaN(v) ? 0 : Math.min(rawRows.length, Math.max(linhaInicio, v)));
                }}
                className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm font-mono text-center"
              />
            </div>
            <p className="text-xs text-muted-foreground">Azul = início · Laranja = fim · Vazio = até ao final.</p>
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
                {rawRows.slice(0, linhaFim > 0 ? Math.min(linhaFim + 2, rawRows.length) : Math.min(20, rawRows.length)).map((row, ri) => {
                  const arr = row as unknown[];
                  const isIgnoredBefore = ri + 1 < linhaInicio;
                  const isIgnoredAfter  = linhaFim > 0 && ri + 1 > linhaFim;
                  const isStart = ri + 1 === linhaInicio;
                  const isEnd   = linhaFim > 0 && ri + 1 === linhaFim;
                  return (
                    <tr key={ri} className={cn(
                      'border-b transition-colors',
                      isIgnoredBefore || isIgnoredAfter ? 'opacity-35 bg-muted/20' : 'hover:bg-muted/10',
                      isStart ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : '',
                      isEnd   ? 'bg-orange-50 ring-1 ring-inset ring-orange-300' : '',
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
                {(() => {
                  const shown = linhaFim > 0 ? Math.min(linhaFim + 2, rawRows.length) : Math.min(20, rawRows.length);
                  return rawRows.length > shown ? (
                    <tr>
                      <td colSpan={colLabels.length + 1}
                        className="px-3 py-2 text-center text-muted-foreground italic">
                        … e mais {rawRows.length - shown} linhas (total: {rawRows.length})
                      </td>
                    </tr>
                  ) : null;
                })()}
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
            { label: 'Propostas', onClick: voltarLista },
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
    const projsSel   = projsPool
      .filter(p => !compOrcExcluded.has(p.id))
      .sort((a, b) => sortVersao(a.versao || '', b.versao || '') || a.criadoEm.localeCompare(b.criadoEm));
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
    const isEvolucao        = !mesmaVersao && versoesSel.size > 1; // comparing versions of same budget
    const stats             = getEstatisticas(totaisVals);
    const progressao        = mesmaVersao ? [] : getProgressaoVersoes(projsSel);
    const progressaoChartData = progressao.map((p, i, arr) => {
      const prev  = arr[i - 1];
      const delta = prev ? ((p.media - prev.media) / prev.media) * 100 : null;
      return { versao: p.versao, Total: Math.round(p.media), delta };
    });

    // Evolution-specific data
    const versaoDeltaRows = progressao.map((p, i) => {
      const prev     = progressao[i - 1];
      const deltaAbs = prev != null ? p.media - prev.media : null;
      const deltaPct = prev != null && prev.media > 0 ? ((p.media - prev.media) / prev.media) * 100 : null;
      return { versao: p.versao, total: p.media, n: p.n, deltaAbs, deltaPct };
    });
    const primeiraVersao  = progressao[0];
    const ultimaVersao    = progressao[progressao.length - 1];
    const evolDeltaAbs    = primeiraVersao && ultimaVersao ? ultimaVersao.media - primeiraVersao.media : 0;
    const evolDeltaPct    = primeiraVersao?.media > 0 ? (evolDeltaAbs / primeiraVersao.media) * 100 : 0;

    // Chapter data
    const allCapsSet = new Set<string>();
    projsSel.forEach(p => getCapTotais(p).forEach(c => allCapsSet.add(c.numero)));
    const allCaps    = Array.from(allCapsSet).sort((a, b) => parseFloat(a) - parseFloat(b));
    // Helper: chapter total adjusted for ignored sub-chapters.
    // Only subtract the "root" ignored items — if "1.1" is ignored, don't also subtract
    // "1.1.1" / "1.1.2" because those are already included in "1.1"'s value.
    const getAdjustedCapVal = (p: Projeto, cap: string) => {
      const base = getCapTotais(p).find(c => c.numero === cap)?.total ?? 0;
      if (ignoredSubNums.size === 0) return base;
      const capDepth = cap.split('.').length;
      const ignoredDeduct = Array.from(ignoredSubNums)
        .filter(n => {
          if (!n.startsWith(cap + '.')) return false;
          // Only deduct if no ancestor (between cap and n) is also in ignoredSubNums
          const parts = n.split('.');
          for (let i = capDepth + 1; i < parts.length; i++) {
            if (ignoredSubNums.has(parts.slice(0, i).join('.'))) return false;
          }
          return true;
        })
        .reduce((s, n) => s + (getLinhaTotal(p, n)?.total ?? 0), 0);
      return Math.max(0, base - ignoredDeduct);
    };

    const capDescricao: Record<string, string> = {};
    for (const cap of allCaps) {
      for (const p of projsSel) {
        const found = getCapTotais(p).find(c => c.numero === cap);
        if (found?.descricao) { capDescricao[cap] = found.descricao; break; }
      }
    }

    const capChartData = allCaps.map(cap => {
      const row: Record<string, unknown> = { cap, descricao: capDescricao[cap] ?? '' };
      projsSel.forEach(p => { row[p.nome] = getAdjustedCapVal(p, cap); });
      return row;
    });
    const totaisChartData = totais.map(t => ({
      name: t.name,
      Total: t.total,
      ...(temM2 ? { 'Por m²': Math.round(t.total / m2Val) } : {}),
    }));

    const temProjsSel = projsSel.length > 0;

    const printAnalise = () => {
      const existing = document.getElementById('__analise_print_style');
      if (existing) existing.remove();
      const style = document.createElement('style');
      style.id = '__analise_print_style';
      style.textContent = `
        @media print {
          @page { margin: 12mm 14mm; size: A4 portrait; }

          /* Hide everything except the print area */
          body { visibility: hidden !important; background: white !important; }
          #analise-print-area { visibility: visible !important; position: absolute; inset: 0; }
          #analise-print-area * { visibility: visible !important; }

          /* Base typography */
          #analise-print-area {
            font-size: 9.5px !important;
            line-height: 1.4 !important;
            color: #111827 !important;
            width: 100% !important;
          }

          /* Hide interactive controls */
          #analise-print-area button,
          #analise-print-area [role="button"],
          #analise-print-area [data-radix-select-trigger],
          #analise-print-area [data-state="closed"],
          #analise-print-area select { display: none !important; }

          /* Cards: avoid breaking in the middle, add border */
          #analise-print-area [class*="rounded"] {
            break-inside: avoid;
            page-break-inside: avoid;
            border: 1px solid #e5e7eb !important;
            box-shadow: none !important;
            margin-bottom: 6mm !important;
          }

          /* Tables */
          #analise-print-area table {
            border-collapse: collapse !important;
            width: 100% !important;
            font-size: 8.5px !important;
          }
          #analise-print-area thead { display: table-header-group; }
          #analise-print-area th {
            background: #f1f5f9 !important;
            padding: 3px 6px !important;
            border: 1px solid #cbd5e1 !important;
            font-weight: 600 !important;
            text-align: inherit;
          }
          #analise-print-area td {
            padding: 2.5px 6px !important;
            border: 1px solid #e2e8f0 !important;
          }
          #analise-print-area tbody tr:nth-child(even) { background: #f8fafc !important; }

          /* Charts: keep together, fixed height */
          #analise-print-area .recharts-responsive-container {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
          #analise-print-area .recharts-wrapper { overflow: visible !important; }

          /* Major sections: allow page break BEFORE but not inside */
          #analise-print-area > div > [class*="mb-6"],
          #analise-print-area > div > [class*="mb-5"] {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Grids */
          #analise-print-area [class*="grid"] {
            display: grid !important;
          }
          #analise-print-area [class*="gap-3"] { gap: 4px !important; }
          #analise-print-area [class*="gap-4"] { gap: 6px !important; }
          #analise-print-area [class*="gap-6"] { gap: 8px !important; }

          /* Text sizes */
          #analise-print-area [class*="text-lg"]  { font-size: 12px !important; }
          #analise-print-area [class*="text-sm"]  { font-size: 9px !important; }
          #analise-print-area [class*="text-xs"]  { font-size: 8px !important; }
          #analise-print-area [class*="text-base"]{ font-size: 10px !important; }
          #analise-print-area [class*="text-2xl"] { font-size: 14px !important; }
          #analise-print-area [class*="text-xl"]  { font-size: 13px !important; }

          /* Padding reductions */
          #analise-print-area [class*="px-5"] { padding-left: 8px !important; padding-right: 8px !important; }
          #analise-print-area [class*="px-4"] { padding-left: 6px !important; padding-right: 6px !important; }
          #analise-print-area [class*="py-4"] { padding-top: 4px !important; padding-bottom: 4px !important; }
          #analise-print-area [class*="py-3"] { padding-top: 3px !important; padding-bottom: 3px !important; }
          #analise-print-area [class*="mb-5"] { margin-bottom: 4mm !important; }
          #analise-print-area [class*="mb-6"] { margin-bottom: 5mm !important; }
          #analise-print-area [class*="mt-4"] { margin-top: 3mm !important; }
        }
      `;
      document.head.appendChild(style);
      window.print();
      setTimeout(() => style.remove(), 3000);
    };

    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltarOrcamento}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Breadcrumb parts={[
            { label: 'Propostas', onClick: voltarLista },
            { label: selectedOrc.nome, onClick: voltarOrcamento },
            { label: 'Análise' },
          ]} />
          <div className="ml-auto flex items-center gap-2">
            {analises.length > 0 && (
              <Select onValueChange={id => { const a = analises.find(x => x.id === id); if (a) carregarAnalise(a); }}>
                <SelectTrigger className="h-7 text-xs w-40 border-dashed">
                  <SelectValue placeholder="Carregar análise…" />
                </SelectTrigger>
                <SelectContent>
                  {analises.map(a => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      <span className="flex items-center justify-between gap-4 w-full">
                        <span>{a.nome}</span>
                        <button className="text-muted-foreground hover:text-red-600 ml-2"
                          onClick={e => { e.stopPropagation(); eliminarAnalise(selectedOrc.id, a.id); }}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={printAnalise}>
              <FileDown className="h-3 w-3" /> PDF
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
              onClick={() => { setNomeAnalise(''); setShowGravarAnalise(true); }}>
              <Save className="h-3 w-3" /> Guardar análise
            </Button>
            {projsSel.filter(p => p.tipo !== 'cenario').length >= 1 && (
              <Button size="sm" className="h-7 text-xs gap-1.5"
                onClick={() => {
                  setCenarioCaps(buildCenarioCaps(projsSel));
                  setNomeCenario('Cenário'); setVersaoCenario('');
                  setShowCriarCenario(true);
                }}>
                <Plus className="h-3 w-3" /> Criar Cenário
              </Button>
            )}
          </div>
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
                    <div key={p.id} className="flex items-center gap-0.5">
                      <button
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
                      <button
                        onClick={() => irParaProjeto(p.id)}
                        title="Ver só este orçamento"
                        className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                        <Eye className="h-3 w-3" />
                      </button>
                    </div>
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

        {/* ══ ÁREA DE IMPRESSÃO ══ */}
        <div id="analise-print-area">

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

        {/* ── Evolução entre versões ── */}
        {temProjsSel && isEvolucao && progressao.length >= 2 && (
          <Card className="mb-6">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Evolução por Versão</CardTitle>
                <div className={cn('flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full',
                  evolDeltaAbs > 0 ? 'bg-red-50 text-red-600' : evolDeltaAbs < 0 ? 'bg-green-50 text-green-600' : 'bg-muted text-muted-foreground')}>
                  {evolDeltaAbs > 0 ? '▲' : evolDeltaAbs < 0 ? '▼' : '='}{' '}
                  {formatCurrency(Math.abs(evolDeltaAbs))}
                  <span className="font-normal text-xs opacity-75 ml-1">
                    ({evolDeltaPct > 0 ? '+' : ''}{evolDeltaPct.toFixed(1)}% total)
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4 px-5">
              {/* Line chart */}
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={progressaoChartData} margin={{ left: 10, right: 30, top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="versao" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} tick={{ fontSize: 11 }} width={52} />
                  <Tooltip
                    formatter={(v: number) => [fmtTooltip(v), 'Total']}
                    labelFormatter={(v) => `Versão ${v}`}
                  />
                  <ReferenceLine y={progressaoChartData[0]?.Total} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
                  <Line
                    type="monotone" dataKey="Total" stroke="#3b82f6" strokeWidth={2.5}
                    dot={(props: any) => {
                      const { cx, cy, index, payload } = props;
                      const prev = progressaoChartData[index - 1];
                      const fill = !prev ? '#3b82f6' : payload.Total > prev.Total ? '#ef4444' : '#22c55e';
                      return <circle key={index} cx={cx} cy={cy} r={5} fill={fill} stroke="#fff" strokeWidth={2} />;
                    }}
                    label={(props: any) => {
                      const { x, y, index, value } = props;
                      const prev = progressaoChartData[index - 1];
                      if (!prev) return null;
                      const pct = ((value - prev.Total) / prev.Total * 100);
                      const color = pct > 0 ? '#ef4444' : '#22c55e';
                      return (
                        <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fill={color} fontWeight={600}>
                          {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                        </text>
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* Version-to-version delta table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Versão</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Δ vs. anterior</th>
                      <th className="px-3 py-2 text-right font-medium">Δ vs. {primeiraVersao?.versao}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versaoDeltaRows.map((row, i) => {
                      const isBase       = i === 0;
                      const deltaVsFirst = isBase ? 0 : row.total - primeiraVersao!.media;
                      const pctVsFirst   = isBase ? 0 : (primeiraVersao!.media > 0 ? (deltaVsFirst / primeiraVersao!.media) * 100 : 0);
                      const isLast       = i === versaoDeltaRows.length - 1;
                      return (
                        <tr key={row.versao} className={cn('border-b', isBase ? 'bg-slate-50/60' : isLast && 'font-semibold bg-muted/20')}>
                          <td className="px-3 py-2">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold border', versaoCor(row.versao))}>
                              {row.versao}
                            </span>
                            {isBase && <span className="ml-1.5 text-[10px] text-muted-foreground">referência</span>}
                            {!isBase && row.n > 1 && <span className="ml-1.5 text-muted-foreground text-[10px]">média de {row.n}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(Math.round(row.total))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {isBase ? (
                              <span className="text-muted-foreground font-normal">referência</span>
                            ) : (
                              <span className={cn('font-semibold', row.deltaAbs! > 0 ? 'text-red-600' : row.deltaAbs! < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                                {row.deltaAbs! > 0 ? '+' : ''}{formatCurrency(row.deltaAbs!)}
                                <span className="font-normal text-[10px] ml-1 opacity-75">
                                  ({row.deltaPct! > 0 ? '+' : ''}{row.deltaPct!.toFixed(1)}%)
                                </span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {isBase ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className={cn('font-semibold', deltaVsFirst > 0 ? 'text-red-600' : deltaVsFirst < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                                {deltaVsFirst > 0 ? '+' : ''}{formatCurrency(deltaVsFirst)}
                                <span className="font-normal text-[10px] ml-1 opacity-75">
                                  ({pctVsFirst > 0 ? '+' : ''}{pctVsFirst.toFixed(1)}%)
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary cards — only show in competitor mode; in evolution mode the line chart is the summary */}
        {temProjsSel && !isEvolucao && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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

        {/* Bar chart: Totais — only in competitor mode */}
        {temProjsSel && !isEvolucao && <Card className="mb-6">
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

        {/* Chapter comparison table — expandable + mean/diff */}
        {temProjsSel && allCaps.length > 0 && (() => {
          // isDiff: show difference column for exactly 2 competitors (not in evolution mode)
          const isDiff       = !isEvolucao && projsSel.length === 2;
          const activeCaps   = allCaps.filter(cap => !ignoredCaps.has(cap));
          const adjTotal     = (p: Projeto) => activeCaps.reduce((sum, cap) => sum + getAdjustedCapVal(p, cap), 0);
          const adjTotais    = projsSel.map(p => adjTotal(p));
          const adjStats     = getEstatisticas(adjTotais);
          return (
          <>
          <Card className="mb-6">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Comparação por Capítulo</CardTitle>
                <div className="flex items-center gap-2">
                  {ignoredCaps.size > 0 && (
                    <button onClick={() => setIgnoredCaps(new Set())}
                      className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                      <Eye className="h-3 w-3" /> Mostrar todos ({ignoredCaps.size} ocultos)
                    </button>
                  )}
                  {ignoredCaps.size < allCaps.length && (
                    <button onClick={() => setIgnoredCaps(new Set(allCaps))}
                      className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                      <EyeOff className="h-3 w-3" /> Ocultar todos
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b text-muted-foreground">
                    <th className="w-6 px-1" />
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
                    {isEvolucao
                      ? <th className="px-3 py-2 text-right font-medium text-indigo-600 whitespace-nowrap">
                          Δ {primeiraVersao?.versao}→{ultimaVersao?.versao}
                        </th>
                      : isDiff
                        ? <th className="px-3 py-2 text-right font-medium text-purple-600 whitespace-nowrap">Diferença</th>
                        : <th className="px-3 py-2 text-right font-medium text-blue-600 whitespace-nowrap">Média</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  {allCaps.map(cap => {
                    const isIgnored = ignoredCaps.has(cap);
                    const isExp = !isIgnored && expandedCaps.has(cap);
                    const vals  = projsSel.map(p => getAdjustedCapVal(p, cap));
                    const valsNonZero = vals.filter(v => v > 0);
                    const capMedia    = valsNonZero.length > 0
                      ? valsNonZero.reduce((s, v) => s + v, 0) / valsNonZero.length
                      : 0;

                    const subNumSet = new Set<string>();
                    projsSel.forEach(p => getSubLinhasCapitulo(p, cap).forEach(l => subNumSet.add(l.numero)));
                    const subNums = Array.from(subNumSet).sort(sortNumericamente);

                    const capDiff    = isDiff ? vals[1] - vals[0] : 0;
                    const capDiffPct = isDiff && vals[0] > 0 ? (capDiff / vals[0]) * 100 : null;
                    // Evolution: delta from first to last version for this chapter
                    const capEvolDelta    = isEvolucao ? vals[vals.length - 1] - vals[0] : 0;
                    const capEvolDeltaPct = isEvolucao && vals[0] > 0 ? (capEvolDelta / vals[0]) * 100 : null;

                    return (
                      <>
                        <tr key={cap} className={cn('border-b',
                          isIgnored ? 'opacity-40 bg-slate-50' : isExp ? 'bg-blue-50/40' : 'hover:bg-muted/10',
                        )}>
                          <td className="px-1 py-1.5 text-center">
                            <button onClick={() => toggleIgnoredCap(cap)}
                              title={isIgnored ? 'Incluir na soma' : 'Ignorar capítulo'}
                              className={cn('h-5 w-5 rounded flex items-center justify-center mx-auto transition-colors',
                                isIgnored
                                  ? 'bg-slate-200 text-slate-400 hover:bg-slate-300'
                                  : 'text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground')}>
                              {isIgnored ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            </button>
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            {!isIgnored && subNums.length > 0 && (
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
                            // In evolution mode: show % vs previous version in each cell
                            const prevV   = isEvolucao && i > 0 ? vals[i - 1] : null;
                            const isBase  = isEvolucao && i === 0;
                            const evolPct = prevV != null && prevV > 0 ? ((v - prevV) / prevV) * 100 : null;
                            // In competitor mode: show % vs mean
                            const diff = capMedia > 0 ? v - capMedia : 0;
                            const pct  = !isDiff && !isEvolucao && !isIgnored && capMedia > 0 && v > 0 ? (diff / capMedia) * 100 : null;
                            return (
                              <td key={i} className="px-3 py-1.5 text-right">
                                <div className="font-bold tabular-nums">
                                  {v > 0 ? formatCurrency(v) : <span className="text-muted-foreground/30">—</span>}
                                </div>
                                {/* Evolution: V1 = reference baseline; V2+ = delta from previous */}
                                {isBase && v > 0 && (
                                  <div className="text-[10px] text-muted-foreground">referência</div>
                                )}
                                {!isBase && evolPct !== null && v > 0 && (
                                  <div className={cn('text-[10px] tabular-nums font-medium',
                                    evolPct > 0 ? 'text-red-500' : 'text-green-600')}>
                                    {evolPct > 0 ? '+' : ''}{evolPct.toFixed(1)}%
                                    <span className="opacity-60 ml-0.5">vs ant.</span>
                                  </div>
                                )}
                                {/* Competitor: delta from mean */}
                                {pct !== null && Math.abs(pct) > 0.05 && (
                                  <div className={cn('text-[10px] tabular-nums',
                                    diff > 0 ? 'text-red-500' : 'text-green-600')}>
                                    {diff > 0 ? '+' : ''}{formatCurrency(diff)} ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          {/* Last column: evolution Δ first→last | competitor diff | mean */}
                          {isEvolucao ? (
                            <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                              {!isIgnored && (vals[0] > 0 || vals[vals.length - 1] > 0) && (
                                <>
                                  <div className={cn(capEvolDelta > 0 ? 'text-red-600' : capEvolDelta < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                                    {capEvolDelta === 0 ? '—' : (capEvolDelta > 0 ? '+' : '') + formatCurrency(capEvolDelta)}
                                  </div>
                                  {capEvolDeltaPct !== null && Math.abs(capEvolDeltaPct) > 0.05 && (
                                    <div className={cn('text-[10px] font-normal tabular-nums',
                                      capEvolDelta > 0 ? 'text-red-400' : 'text-green-500')}>
                                      {capEvolDeltaPct > 0 ? '+' : ''}{capEvolDeltaPct.toFixed(1)}%
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          ) : isDiff ? (
                            <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                              {!isIgnored && (
                                <>
                                  <div className={cn(capDiff > 0 ? 'text-red-600' : capDiff < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                                    {vals[0] === 0 && vals[1] === 0 ? '—' : (capDiff >= 0 ? '+' : '') + formatCurrency(capDiff)}
                                  </div>
                                  {capDiffPct !== null && Math.abs(capDiffPct) > 0.05 && (
                                    <div className={cn('text-[10px] tabular-nums font-normal',
                                      capDiff > 0 ? 'text-red-400' : 'text-green-500')}>
                                      {capDiffPct > 0 ? '+' : ''}{capDiffPct.toFixed(1)}%
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          ) : (
                            <td className="px-3 py-1.5 text-right font-bold tabular-nums text-blue-600">
                              {!isIgnored && (capMedia > 0 ? formatCurrency(capMedia) : '—')}
                            </td>
                          )}
                        </tr>

                        {/* Article rows */}
                        {isExp && subNums.map(num => {
                          const isSubIgnored = ignoredSubNums.has(num);
                          const arts     = projsSel.map(p => getLinhaTotal(p, num));
                          const desc     = arts.find(a => a?.descricao)?.descricao ?? '';
                          const unid     = arts.find(a => a?.unidade)?.unidade ?? '';
                          const nivel    = arts.find(a => a)?.nivel ?? 2;
                          const artVals  = arts.map(a => a?.total ?? 0);
                          const artNZ    = artVals.filter(v => v > 0);
                          const artMedia = artNZ.length > 0 ? artNZ.reduce((s, v) => s + v, 0) / artNZ.length : 0;
                          const indent   = (nivel - 2) * 12 + 12;
                          const artDiff    = isDiff ? artVals[1] - artVals[0] : 0;
                          const artDiffPct = isDiff && artVals[0] > 0 ? (artDiff / artVals[0]) * 100 : null;
                          return (
                            <tr key={`${cap}-${num}`} className={cn('border-b hover:bg-blue-50/20', isSubIgnored ? 'opacity-30 bg-slate-50' : 'bg-white')}>
                              <td className="px-1 py-1 text-center">
                                <button
                                  title={isSubIgnored ? 'Mostrar' : 'Ocultar'}
                                  onClick={() => setIgnoredSubNums(prev => {
                                    const s = new Set(prev);
                                    // cascade: affect this num and all descendants
                                    const affected = subNums.filter(n => n === num || n.startsWith(num + '.'));
                                    isSubIgnored ? affected.forEach(n => s.delete(n)) : affected.forEach(n => s.add(n));
                                    return s;
                                  })}
                                  className="h-4 w-4 flex items-center justify-center mx-auto text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                                  {isSubIgnored ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                </button>
                              </td>
                              <td className="px-1 py-1" />
                              <td className="py-1.5 font-mono text-[11px] text-blue-700/70 whitespace-nowrap"
                                style={{ paddingLeft: `${indent + 12}px` }}>{num}</td>
                              <td className="px-3 py-1.5 max-w-[200px]">
                                <p className="truncate text-[11px]" title={desc}>{desc}</p>
                                {unid && <p className="text-[10px] text-muted-foreground/60">{unid}</p>}
                              </td>
                              {arts.map((art, i) => {
                                const v        = art?.total ?? 0;
                                const prevArt  = isEvolucao && i > 0 ? (artVals[i - 1]) : null;
                                const isArtBase = isEvolucao && i === 0;
                                const evolPct  = prevArt != null && prevArt > 0 ? ((v - prevArt) / prevArt) * 100 : null;
                                const diff    = artMedia > 0 ? v - artMedia : 0;
                                const pct     = !isDiff && !isEvolucao && artMedia > 0 && v > 0 ? (diff / artMedia) * 100 : null;
                                return (
                                  <td key={i} className="px-3 py-1.5 text-right">
                                    <div className="text-[11px] font-medium tabular-nums">
                                      {v > 0 ? formatCurrency(v) : <span className="text-muted-foreground/25">—</span>}
                                    </div>
                                    {isArtBase && v > 0 && (
                                      <div className="text-[10px] text-muted-foreground">ref.</div>
                                    )}
                                    {!isArtBase && evolPct !== null && v > 0 && (
                                      <div className={cn('text-[10px] tabular-nums font-medium',
                                        evolPct > 0 ? 'text-red-400' : 'text-green-500')}>
                                        {evolPct > 0 ? '+' : ''}{evolPct.toFixed(1)}%
                                      </div>
                                    )}
                                    {pct !== null && Math.abs(pct) > 0.05 && (
                                      <div className={cn('text-[10px] tabular-nums',
                                        diff > 0 ? 'text-red-400' : 'text-green-500')}>
                                        {diff > 0 ? '+' : ''}{pct.toFixed(1)}%
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              {isEvolucao ? (() => {
                                const a0 = artVals[0]; const aN = artVals[artVals.length - 1];
                                const d  = aN - a0; const p = a0 > 0 ? (d / a0) * 100 : null;
                                return (
                                  <td className="px-3 py-1.5 text-right text-[11px] font-medium tabular-nums">
                                    <div className={cn(d > 0 ? 'text-red-600' : d < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                                      {a0 === 0 && aN === 0 ? '—' : (d >= 0 ? '+' : '') + formatCurrency(d)}
                                    </div>
                                    {p !== null && Math.abs(p) > 0.05 && (
                                      <div className={cn('text-[10px] font-normal', d > 0 ? 'text-red-400' : 'text-green-500')}>
                                        {p > 0 ? '+' : ''}{p.toFixed(1)}%
                                      </div>
                                    )}
                                  </td>
                                );
                              })() : isDiff ? (
                                <td className="px-3 py-1.5 text-right text-[11px] font-medium tabular-nums">
                                  <div className={cn(artDiff > 0 ? 'text-red-600' : artDiff < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                                    {artVals[0] === 0 && artVals[1] === 0 ? '—' : (artDiff >= 0 ? '+' : '') + formatCurrency(artDiff)}
                                  </div>
                                  {artDiffPct !== null && Math.abs(artDiffPct) > 0.05 && (
                                    <div className={cn('text-[10px] font-normal',
                                      artDiff > 0 ? 'text-red-400' : 'text-green-500')}>
                                      {artDiffPct > 0 ? '+' : ''}{artDiffPct.toFixed(1)}%
                                    </div>
                                  )}
                                </td>
                              ) : (
                                <td className="px-3 py-1.5 text-right text-[11px] font-medium tabular-nums text-blue-600">
                                  {artMedia > 0 ? formatCurrency(artMedia) : '—'}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}

                  {/* Totals row */}
                  <tr className="border-t-2 bg-muted/30 font-bold">
                    <td className="px-1" />
                    <td className="px-1" />
                    <td className="px-3 py-2 font-semibold" colSpan={2}>
                      Total{ignoredCaps.size > 0 && <span className="text-[10px] font-normal text-muted-foreground ml-1.5">({ignoredCaps.size} cap. excluído{ignoredCaps.size !== 1 ? 's' : ''})</span>}
                    </td>
                    {projsSel.map((p, i) => {
                      const v          = adjTotais[i];
                      const isTotBase  = isEvolucao && i === 0;
                      const totVsPrev  = isEvolucao && i > 0 ? v - adjTotais[i - 1] : null;
                      const totVsPrevPct = totVsPrev != null && adjTotais[i - 1] > 0 ? (totVsPrev / adjTotais[i - 1]) * 100 : null;
                      const diff = adjStats ? v - adjStats.media : 0;
                      const pct  = !isDiff && !isEvolucao && adjStats && adjStats.media > 0 ? (diff / adjStats.media) * 100 : null;
                      return (
                        <td key={p.id} className="px-3 py-2 text-right">
                          <div className="tabular-nums" style={{ color: ORC_PALETTE[i % ORC_PALETTE.length] }}>
                            {formatCurrency(v)}
                          </div>
                          {/* Evolution: V1 = ref, V2+ = delta from V1 */}
                          {isTotBase && (
                            <div className="text-[10px] text-muted-foreground">referência</div>
                          )}
                          {totVsPrev != null && (
                            <div className={cn('text-[10px] tabular-nums font-normal',
                              totVsPrev > 0 ? 'text-red-500' : 'text-green-600')}>
                              {totVsPrev > 0 ? '+' : ''}{formatCurrency(totVsPrev)}
                              {totVsPrevPct != null && <span className="ml-0.5 opacity-75">({totVsPrevPct > 0 ? '+' : ''}{totVsPrevPct.toFixed(1)}%)</span>}
                              <span className="opacity-50 ml-0.5">vs ant.</span>
                            </div>
                          )}
                          {/* Competitor: delta from mean */}
                          {pct !== null && Math.abs(pct) > 0.05 && (
                            <div className={cn('text-[10px] tabular-nums font-normal',
                              diff > 0 ? 'text-red-500' : 'text-green-600')}>
                              {diff > 0 ? '+' : ''}{formatCurrency(diff)} ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {isEvolucao ? (() => {
                      const t0   = adjTotais[0];
                      const tN   = adjTotais[adjTotais.length - 1];
                      const diff = tN - t0;
                      const pct  = t0 > 0 ? (diff / t0) * 100 : null;
                      return (
                        <td className="px-3 py-2 text-right tabular-nums">
                          <div className={cn('font-bold', diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                            {diff === 0 ? '—' : (diff >= 0 ? '+' : '') + formatCurrency(diff)}
                          </div>
                          {pct !== null && Math.abs(pct) > 0.05 && (
                            <div className={cn('text-[10px] font-normal', diff > 0 ? 'text-red-400' : 'text-green-500')}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                            </div>
                          )}
                        </td>
                      );
                    })() : isDiff ? (() => {
                      const t0   = adjTotais[0];
                      const t1   = adjTotais[1];
                      const diff = t1 - t0;
                      const pct  = t0 > 0 ? (diff / t0) * 100 : null;
                      return (
                        <td className="px-3 py-2 text-right tabular-nums">
                          <div className={cn('font-bold', diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                            {(diff >= 0 ? '+' : '') + formatCurrency(diff)}
                          </div>
                          {pct !== null && Math.abs(pct) > 0.05 && (
                            <div className={cn('text-[10px] font-normal', diff > 0 ? 'text-red-400' : 'text-green-500')}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                            </div>
                          )}
                        </td>
                      );
                    })() : (
                      <td className="px-3 py-2 text-right tabular-nums text-blue-600">
                        {adjStats ? formatCurrency(adjStats.media) : '—'}
                        {temM2 && adjStats && (
                          <div className="text-[10px] font-normal text-blue-500">
                            {formatCurrency(Math.round(adjStats.media / m2Val))}/m²
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Chapter evolution line chart — only in evolution mode */}
          {isEvolucao && activeCaps.length > 0 && (() => {
            const CAP_COLORS = [
              '#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6',
              '#ec4899','#06b6d4','#f97316','#84cc16','#6366f1',
            ];
            // Build data: one point per version, one key per active chapter
            const capEvolData = progressao.map(p => {
              const row: Record<string, number | string> = { versao: p.versao };
              activeCaps.forEach(cap => {
                const projsV = projsSel.filter(pr => pr.versao === p.versao);
                const vals = projsV.map(pr => getCapituloTotais(pr).find(c => c.numero === cap)?.total ?? 0).filter(v => v > 0);
                row[`Cap ${cap}`] = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
              });
              return row;
            });
            const chartH = Math.max(220, activeCaps.length > 6 ? 260 : 220);
            return (
              <Card className="mt-4 mb-6">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold">
                    Evolução por Capítulo
                    {activeCaps.length < allCaps.length && (
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {activeCaps.length} de {allCaps.length} capítulos visíveis
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-5">
                  <ResponsiveContainer width="100%" height={chartH}>
                    <LineChart data={capEvolData} margin={{ left: 10, right: 20, top: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="versao" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} tick={{ fontSize: 11 }} width={52} />
                      <Tooltip
                        formatter={(v: number, name: string) => [fmtTooltip(v), name]}
                        labelFormatter={(v) => `Versão ${v}`}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {activeCaps.map((cap, ci) => (
                        <Line
                          key={cap}
                          type="monotone"
                          dataKey={`Cap ${cap}`}
                          stroke={CAP_COLORS[ci % CAP_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            );
          })()}
          </>
          );
        })()}

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

        {/* ── Custo por Fração ── */}
        {temProjsSel && (() => {
          // Fractions: use proposta's own fracoes, or fall back to linked project's unidades
          const linkedProjAna = selectedOrc.projetoId ? topProjetos.find(p => p.id === selectedOrc.projetoId) : null;
          const fracoes: { id: string; nome: string; m2: number; quantidade?: number }[] =
            (selectedOrc.fracoes?.length ? selectedOrc.fracoes : null) ??
            (linkedProjAna?.unidades?.length ? linkedProjAna.unidades : null) ??
            [];
          if (fracoes.length === 0) return null;
          const totalFracM2 = fracoes.reduce((s, f) => s + f.m2, 0);
          if (totalFracM2 === 0) return null;
          // Build list of all versions available in projsSel
          const versoesDispFrac = [...new Set(projsSel.map(p => p.versao).filter(Boolean))].sort(sortVersao);
          const latestVersaoFrac = versoesDispFrac.at(-1);
          const versaoEfetiva = fracaoVersao === '__latest__' ? (latestVersaoFrac ?? null) : fracaoVersao;
          // Adjusted total: respects hidden chapters and sub-chapters
          const activeCapsAdj = allCaps.filter(cap => !ignoredCaps.has(cap));
          const adjTotalFrac = (p: Projeto) => activeCapsAdj.reduce((sum, cap) => sum + getAdjustedCapVal(p, cap), 0);
          const refProjsSel = versaoEfetiva
            ? projsSel.filter(p => p.versao === versaoEfetiva)
            : projsSel;
          const refTotais = refProjsSel.map(adjTotalFrac);
          const refTotal = refTotais.length > 0 ? refTotais.reduce((s, v) => s + v, 0) / refTotais.length : 0;
          if (refTotal === 0) return null;
          const custoM2 = refTotal / totalFracM2;
          const hasQtd = fracoes.some(f => (f.quantidade ?? 1) > 1);
          return (
            <Card className="mb-6">
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Custo por Fração</CardTitle>
                  {versoesDispFrac.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">Versão:</span>
                      <div className="flex gap-1">
                        {versoesDispFrac.map(v => (
                          <button key={v}
                            onClick={() => setFracaoVersao(v === latestVersaoFrac && fracaoVersao === '__latest__' ? '__latest__' : v)}
                            className={cn(
                              'px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                              (fracaoVersao === '__latest__' ? v === latestVersaoFrac : fracaoVersao === v)
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-input hover:border-primary/50'
                            )}>
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-4 px-5">
                <p className="text-[11px] text-muted-foreground mb-3">
                  Base: {formatCurrency(Math.round(refTotal))} ({versaoEfetiva ?? 'versão activa'}) · {formatCurrency(Math.round(custoM2))}/m² · {totalFracM2} m² total
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">Fração</th>
                        <th className="px-3 py-2 text-right font-medium">m²</th>
                        {hasQtd && <th className="px-3 py-2 text-right font-medium">Unidades</th>}
                        <th className="px-3 py-2 text-right font-medium">% área</th>
                        <th className="px-3 py-2 text-right font-medium">Custo estimado</th>
                        {hasQtd && <th className="px-3 py-2 text-right font-medium">Custo/unidade</th>}
                        <th className="px-3 py-2 text-right font-medium">€/m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fracoes.filter(f => f.m2 > 0).map(f => {
                        const custo = Math.round((f.m2 / totalFracM2) * refTotal);
                        const pctArea = (f.m2 / totalFracM2) * 100;
                        const qtd = f.quantidade && f.quantidade > 1 ? f.quantidade : null;
                        return (
                          <tr key={f.id} className="border-b hover:bg-muted/10">
                            <td className="px-3 py-2 font-medium">{f.nome || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{f.m2} m²</td>
                            {hasQtd && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{qtd ?? 1}</td>}
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pctArea.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(custo)}</td>
                            {hasQtd && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{qtd ? formatCurrency(Math.round(custo / qtd)) : '—'}</td>}
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(Math.round(custoM2))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 bg-muted/30">
                      <tr>
                        <td className="px-3 py-2 font-bold">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{totalFracM2} m²</td>
                        {hasQtd && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fracoes.reduce((s, f) => s + (f.quantidade ?? 1), 0)}</td>}
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">100%</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{formatCurrency(Math.round(refTotal))}</td>
                        {hasQtd && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>}
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(Math.round(custoM2))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Dialog: Guardar análise */}
        <Dialog open={showGravarAnalise} onOpenChange={setShowGravarAnalise}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Guardar análise</DialogTitle></DialogHeader>
            <div className="py-2">
              <Label className="text-sm">Nome</Label>
              <Input className="mt-1.5" placeholder="Ex: Comparação final" autoFocus
                value={nomeAnalise} onChange={e => setNomeAnalise(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && nomeAnalise.trim() && (gravarAnalise(selectedOrc.id, nomeAnalise.trim()), setShowGravarAnalise(false))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGravarAnalise(false)}>Cancelar</Button>
              <Button disabled={!nomeAnalise.trim()} onClick={() => { gravarAnalise(selectedOrc.id, nomeAnalise.trim()); setShowGravarAnalise(false); }}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Criar Cenário */}
        <Dialog open={showCriarCenario} onOpenChange={setShowCriarCenario}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader><DialogTitle>Criar Cenário</DialogTitle></DialogHeader>
            <div className="flex gap-3 py-2">
              <div className="flex-1">
                <Label className="text-xs">Nome</Label>
                <Input className="mt-1 h-8 text-sm" value={nomeCenario} onChange={e => setNomeCenario(e.target.value)} />
              </div>
              <div className="w-24">
                <Label className="text-xs">Versão</Label>
                <Input className="mt-1 h-8 text-sm" placeholder="C1" value={versaoCenario} onChange={e => setVersaoCenario(e.target.value)} />
              </div>
            </div>
            <div className="overflow-auto flex-1 border rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-muted/80">
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left w-14">Cap.</th>
                    <th className="px-3 py-2 text-left">Descrição</th>
                    <th className="px-3 py-2 text-left w-40">Fonte</th>
                    <th className="px-3 py-2 text-right w-28">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {cenarioCaps.map((cap, idx) => {
                    const realProjs = projsSel.filter(p => p.tipo !== 'cenario');
                    const vals = realProjs.map(p => ({
                      id: p.id, nome: p.nome, versao: p.versao,
                      total: getCapituloTotais(p).find(c => c.numero === cap.numero)?.total ?? 0,
                    }));
                    const media = vals.filter(v => v.total > 0).length > 0
                      ? vals.filter(v => v.total > 0).reduce((s, v) => s + v.total, 0) / vals.filter(v => v.total > 0).length : 0;
                    return (
                      <tr key={cap.numero} className="border-b hover:bg-muted/10">
                        <td className="px-3 py-2 font-mono font-bold">{cap.numero}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate max-w-[180px]">{cap.descricao}</td>
                        <td className="px-3 py-2">
                          <Select value={cap.fonte} onValueChange={v => {
                            const total = v === 'media' ? Math.round(media) : (vals.find(x => x.id === v)?.total ?? 0);
                            setCenarioCaps(prev => prev.map((c, i) => i === idx ? { ...c, fonte: v, totalBase: total } : c));
                          }}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="media" className="text-xs">Média ({formatCurrency(Math.round(media))})</SelectItem>
                              {vals.map(v => (
                                <SelectItem key={v.id} value={v.id} className="text-xs">
                                  {v.nome}{v.versao && ` (${v.versao})`} — {formatCurrency(v.total)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(cap.totalBase)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 bg-muted/80 border-t-2">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 font-semibold text-sm">Total</td>
                    <td className="px-3 py-2 text-right font-bold text-sm tabular-nums">
                      {formatCurrency(cenarioCaps.reduce((s, c) => s + c.totalBase, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <DialogFooter className="mt-3">
              <Button variant="outline" onClick={() => setShowCriarCenario(false)}>Cancelar</Button>
              <Button disabled={!nomeCenario.trim() || cenarioCaps.length === 0} onClick={() => {
                const novoCenario: Projeto = {
                  id: v4(), nome: nomeCenario.trim(), versao: versaoCenario.trim(),
                  criadoEm: new Date().toISOString(), ficheiros: [],
                  tipo: 'cenario',
                  cenarioConfig: { capitulos: cenarioCaps, projetosBase: projsSel.filter(p => p.tipo !== 'cenario').map(p => p.id), alteracoes: [] },
                };
                updateOrcamentos(prev => prev.map(o =>
                  o.id === selectedOrc.id ? { ...o, projetos: [...o.projetos, novoCenario] } : o
                ));
                setShowCriarCenario(false);
                toast.success('Cenário criado com sucesso');
              }}>Criar Cenário</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>{/* ══ FIM ÁREA DE IMPRESSÃO ══ */}
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
            <h1 className="section-title">Comparação de Propostas</h1>
            <p className="section-subtitle">{orcamentos.length} proposta(s)</p>
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
            { label: 'Propostas', onClick: voltarLista },
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
        {(() => {
          const linkedProj = selectedOrc.projetoId ? topProjetos.find(p => p.id === selectedOrc.projetoId) : null;
          const isSynced   = !!linkedProj;

          const saveCarac = () => {
            // Always save to orcamento
            updateOrcamentos(prev => prev.map(o => o.id === selectedOrc.id ? { ...o, ...caracDraft } : o));
            // If linked to a project, also update the project's m² fields
            if (linkedProj) {
              atualizarProjeto({ ...linkedProj, ...caracDraft });
            }
            toast.success('Características guardadas');
          };

          return (
        <Card className="mb-5">
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  Características do Projeto
                </CardTitle>
                {isSynced && (
                  <p className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-1">
                    <Link2 className="h-3 w-3" /> Sincronizado com "{linkedProj.nome}"
                  </p>
                )}
              </div>
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={saveCarac}>
                <Save className="h-3 w-3" /> Guardar
              </Button>
            </div>
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
                      value={caracDraft[field] || ''}
                      placeholder="0"
                      onChange={(e) => setCaracDraft(prev => ({
                        ...prev,
                        [field]: field === 'numApartamentos' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0,
                      }))}
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
                      value={caracDraft[field] || ''}
                      placeholder="0"
                      onChange={(e) => setCaracDraft(prev => ({
                        ...prev,
                        [field]: parseFloat(e.target.value) || 0,
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Derived metrics — use totalAtivo (mean of latest version) not sum of all */}
            {(() => {
              const m2Total = caracDraft.m2AcimaSolo + caracDraft.m2AbaixoSolo;
              const m2Util  = caracDraft.m2AcimaSolo + caracDraft.m2AbaixoSolo
                - caracDraft.m2AreasComuns - caracDraft.m2Circulacao
                - caracDraft.m2AreasTecnicas;
              if (totalAtivo === 0 || m2Total === 0) return null;
              return (
                <div className="pt-3 border-t flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="text-[10px] text-muted-foreground w-full">Índices sobre a média da versão activa</span>
                  <span>Custo/m² total: <span className="font-semibold text-foreground">
                    {formatCurrency(Math.round(totalAtivo / m2Total))}/m²
                  </span></span>
                  {m2Util > 0 && (
                    <span>Custo/m² útil: <span className="font-semibold text-foreground">
                      {formatCurrency(Math.round(totalAtivo / m2Util))}/m²
                    </span></span>
                  )}
                  {caracDraft.numApartamentos > 0 && (
                    <span>Custo/apartamento: <span className="font-semibold text-foreground">
                      {formatCurrency(Math.round(totalAtivo / caracDraft.numApartamentos))}
                    </span></span>
                  )}
                  {caracDraft.m2Retalho > 0 && (
                    <span>Custo/m² retalho: <span className="font-semibold text-foreground">
                      {formatCurrency(Math.round(totalAtivo / caracDraft.m2Retalho))}/m²
                    </span></span>
                  )}
                </div>
              );
            })()}

            {/* ── Frações ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Frações / Unidades</p>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                  onClick={() => updateOrcamentos(prev => prev.map(o => o.id === selectedOrc.id
                    ? { ...o, fracoes: [...(o.fracoes ?? []), { id: v4(), nome: '', m2: 0, quantidade: 1 }] }
                    : o))}>
                  <Plus className="h-3 w-3" /> Adicionar fração
                </Button>
              </div>
              {(!selectedOrc.fracoes || selectedOrc.fracoes.length === 0) ? (
                <p className="text-xs text-muted-foreground italic">Sem frações definidas.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedOrc.fracoes.map((fr, fi) => (
                    <div key={fr.id} className="flex items-center gap-2">
                      <Input className="h-7 text-xs flex-1" placeholder="Nome (ex: T2 – Piso 1)"
                        value={fr.nome}
                        onChange={e => updateOrcamentos(prev => prev.map(o => o.id === selectedOrc.id
                          ? { ...o, fracoes: o.fracoes.map((f, i) => i === fi ? { ...f, nome: e.target.value } : f) }
                          : o))} />
                      <Input className="h-7 text-xs w-20 text-right" type="number" min={0} placeholder="m²"
                        value={fr.m2 || ''}
                        onChange={e => updateOrcamentos(prev => prev.map(o => o.id === selectedOrc.id
                          ? { ...o, fracoes: o.fracoes.map((f, i) => i === fi ? { ...f, m2: parseFloat(e.target.value) || 0 } : f) }
                          : o))} />
                      <span className="text-xs text-muted-foreground shrink-0">m²</span>
                      <Input className="h-7 text-xs w-16 text-right" type="number" min={1} placeholder="un."
                        value={fr.quantidade ?? 1}
                        onChange={e => updateOrcamentos(prev => prev.map(o => o.id === selectedOrc.id
                          ? { ...o, fracoes: o.fracoes.map((f, i) => i === fi ? { ...f, quantidade: parseInt(e.target.value) || 1 } : f) }
                          : o))} />
                      <span className="text-xs text-muted-foreground shrink-0">un.</span>
                      <button className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 shrink-0"
                        onClick={() => updateOrcamentos(prev => prev.map(o => o.id === selectedOrc.id
                          ? { ...o, fracoes: o.fracoes.filter((_, i) => i !== fi) }
                          : o))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Cost per fraction */}
              {selectedOrc.fracoes?.length > 0 && totalAtivo > 0 && (() => {
                const totalFracM2 = selectedOrc.fracoes.reduce((s, f) => s + f.m2, 0);
                if (totalFracM2 === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide font-semibold">Custo por fração (média versão activa)</p>
                    <div className="space-y-1">
                      {selectedOrc.fracoes.filter(f => f.m2 > 0).map(fr => {
                        const custo = Math.round((fr.m2 / totalFracM2) * totalAtivo);
                        const qtd = fr.quantidade && fr.quantidade > 1 ? fr.quantidade : null;
                        return (
                          <div key={fr.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground truncate">
                              {fr.nome || 'Sem nome'} <span className="text-[10px]">({fr.m2} m²{qtd ? ` × ${qtd}` : ''})</span>
                            </span>
                            <div className="flex flex-col items-end">
                              <span className="font-semibold tabular-nums">{formatCurrency(custo)}</span>
                              {qtd && <span className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(Math.round(custo / qtd))}/un.</span>}
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between text-xs pt-1 border-t font-semibold">
                        <span>Total ({totalFracM2} m²)</span>
                        <span className="tabular-nums">{formatCurrency(totalAtivo)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
          ); // closes return(
        })(/* closes characteristics IIFE */)}

        {/* Orçamentos list */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Orçamentos ({selectedOrc.projetos.length})
          </h2>
          <div className="flex gap-2">
            {selectedOrc.projetos.length >= 1 && (
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
            <p className="text-sm">Ainda não há orçamentos nesta proposta.</p>
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
                        {proj.tipo === 'cenario' ? (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-purple-100 text-purple-700 border-purple-200 border">
                            Cenário · {proj.cenarioConfig?.capitulos.length ?? 0} cap.
                          </Badge>
                        ) : (
                          <>
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
                          </>
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
    const mergedLinhas = processarHierarquia(
      selectedProj.ficheiros
        .slice().sort((a, b) => a.carregadoEm.localeCompare(b.carregadoEm))
        .flatMap(f => f.linhas)
        .map(l => ({ ...l, numero: l.numero ? normalizeNumero(l.numero) : l.numero, nivel: getNivel(l.numero) }))
    );

    return (
      <div className="page-container animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltarOrcamento}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Breadcrumb parts={[
            { label: 'Propostas', onClick: voltarLista },
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
          {selectedProj.tipo === 'cenario' ? (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">Capítulos</p>
                <p className="text-lg font-bold mt-0.5">{selectedProj.cenarioConfig?.capitulos.length ?? 0}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">Ficheiros</p>
                <p className="text-lg font-bold mt-0.5">{selectedProj.ficheiros.length}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">Tipo</p>
              <p className={cn('text-sm font-bold mt-0.5',
                selectedProj.tipo === 'cenario' ? 'text-purple-600'
                  : gaps.length > 0 ? 'text-amber-600' : caps.length > 0 ? 'text-green-600' : 'text-muted-foreground')}>
                {selectedProj.tipo === 'cenario' ? 'Cenário'
                  : caps.length === 0 ? 'Sem dados' : gaps.length > 0 ? 'Incompleto' : 'Completo'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Cenario editor — replaces upload/files for cenario type */}
        {selectedProj.tipo === 'cenario' && selectedProj.cenarioConfig && (() => {
          const baseProjs = selectedOrc?.projetos.filter(p => p.tipo !== 'cenario' && selectedProj.cenarioConfig!.projetosBase.includes(p.id)) ?? [];
          const editCaps   = cenarioEditCaps.length > 0 ? cenarioEditCaps : selectedProj.cenarioConfig.capitulos;
          const editAlt    = cenarioEditAlteracoes;
          const editOcultos = cenarioEditOcultos;

          const toggleOculto = (num: string) =>
            setCenarioEditOcultos(prev => { const s = new Set(prev); s.has(num) ? s.delete(num) : s.add(num); return s; });

          const saveCenario = () => {
            const updated: Projeto = {
              ...selectedProj,
              cenarioConfig: {
                ...selectedProj.cenarioConfig!,
                capitulos: editCaps,
                alteracoes: editAlt,
                capitulosOcultos: [...editOcultos],
              },
            };
            updateOrcamentos(prev => prev.map(o =>
              o.id === selectedOrc?.id ? { ...o, projetos: o.projetos.map(p => p.id === updated.id ? updated : p) } : o
            ));
            toast.success('Cenário guardado');
          };

          const capsVisiveis = editCaps.filter(c => !editOcultos.has(c.numero));
          const totalCenario = capsVisiveis.reduce((s, c) => s + getCenarioCapituloTotal(c, editAlt), 0);
          const totalAlteracoes = editAlt
            .filter(a => !editOcultos.has(a.capitulo.split('.')[0]))
            .reduce((s, a) => s + a.valor, 0);

          // Use memoized subcap data (computed at component level)
          const { allSubcapsMap, allSelectableNums } = cenarioSubcaps;

          const TIPOS_ALT: { tipo: TipoAlteracao; label: string; cor: string; defaultSignal: number }[] = [
            { tipo: 'otimizacao',   label: 'Otimizações',  cor: 'text-green-700 bg-green-50 border-green-200', defaultSignal: -1 },
            { tipo: 'por_adicionar', label: 'Por adicionar', cor: 'text-blue-700 bg-blue-50 border-blue-200',   defaultSignal: 1 },
            { tipo: 'remover',      label: 'Remover',       cor: 'text-red-700 bg-red-50 border-red-200',       defaultSignal: -1 },
          ];

          const addAlteracao = (tipo: TipoAlteracao) => {
            setCenarioEditAlteracoes(prev => [...prev, {
              id: v4(), tipo, capitulo: editCaps[0]?.numero ?? '1', descricao: '', valor: 0,
            }]);
          };

          return (
            <div className="mb-6 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cenário</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                    onClick={() => {
                      setCenarioEditCaps(JSON.parse(JSON.stringify(selectedProj.cenarioConfig!.capitulos)));
                      setCenarioEditAlteracoes(JSON.parse(JSON.stringify(selectedProj.cenarioConfig!.alteracoes ?? [])));
                      setCenarioEditOcultos(new Set(selectedProj.cenarioConfig!.capitulosOcultos ?? []));
                      toast.success('Cenário restaurado');
                    }}>Restaurar</Button>
                  <Button size="sm" className="h-7 text-xs gap-1.5" onClick={saveCenario}>
                    <Save className="h-3 w-3" /> Guardar
                  </Button>
                </div>
              </div>

              {/* ── Tabela de capítulos + subcapítulos ── */}
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50 border-b text-muted-foreground">
                        <th className="w-6 px-1" />
                        <th className="px-3 py-2 text-left w-14">Cap.</th>
                        <th className="px-3 py-2 text-left">Descrição</th>
                        <th className="px-3 py-2 text-left w-44">Fonte</th>
                        <th className="px-3 py-2 text-right w-28">Base</th>
                        <th className="px-3 py-2 text-right w-28">Alterações</th>
                        <th className="px-3 py-2 text-right w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // A subcap is visible only when all ancestor nodes are expanded
                        const isVisible = (num: string) => {
                          const parts = num.split('.');
                          for (let i = 1; i < parts.length; i++) {
                            if (!expandedCenarioCaps.has(parts.slice(0, i).join('.'))) return false;
                          }
                          return true;
                        };
                        // A node has children if any other node starts with its prefix
                        const hasChildren = (num: string) =>
                          allSelectableNums.some(([n]) => n.startsWith(num + '.'));

                        return editCaps.map((cap, idx) => {
                          const oculto = editOcultos.has(cap.numero);
                          if (oculto) return null; // hidden caps rendered separately below
                          const capAlt = editAlt.filter(a => a.capitulo === cap.numero || a.capitulo.startsWith(cap.numero + '.'));
                          const altTotal = capAlt.reduce((s, a) => s + a.valor, 0);
                          const capTotal = getCenarioCapituloTotal(cap, editAlt);
                          const capHasChildren = hasChildren(cap.numero);
                          const capExpanded = expandedCenarioCaps.has(cap.numero);
                          // All descendants of this cap, in order, filtered by visibility
                          const descendants = allSelectableNums.filter(([num]) =>
                            num.startsWith(cap.numero + '.') && isVisible(num)
                          );
                          return (
                            <React.Fragment key={cap.numero}>
                              {/* Chapter row */}
                              <tr className="border-b bg-slate-50 font-semibold hover:bg-slate-100 group">
                                <td className="px-1 py-1.5 text-center">
                                  {capHasChildren && (
                                    <button onClick={() => toggleCenarioCap(cap.numero)}
                                      className="h-4 w-4 rounded flex items-center justify-center mx-auto text-muted-foreground hover:text-foreground">
                                      {capExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-mono font-bold text-slate-700">{cap.numero}</td>
                                <td className="px-3 py-2 truncate max-w-[200px]">{cap.descricao}</td>
                                <td className="px-3 py-2">
                                  <Select value={cap.fonte} onValueChange={v => {
                                    const vals = baseProjs.map(p => getCapituloTotais(p).find(c => c.numero === cap.numero)?.total ?? 0).filter(x => x > 0);
                                    const total = v === 'media'
                                      ? Math.round(vals.reduce((s, x) => s + x, 0) / (vals.length || 1))
                                      : (getCapituloTotais(baseProjs.find(p => p.id === v)!).find(c => c.numero === cap.numero)?.total ?? 0);
                                    setCenarioEditCaps(prev => prev.map((c, i) => i === idx ? { ...c, fonte: v, totalBase: total } : c));
                                  }}>
                                    <SelectTrigger className="h-7 text-xs font-normal"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="media" className="text-xs">Média</SelectItem>
                                      {baseProjs.map(p => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome}{p.versao && ` (${p.versao})`}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(cap.totalBase)}</td>
                                <td className={cn('px-3 py-2 text-right tabular-nums',
                                  altTotal > 0 ? 'text-red-600' : altTotal < 0 ? 'text-green-600' : 'text-muted-foreground/40')}>
                                  {altTotal !== 0 ? `${altTotal > 0 ? '+' : ''}${formatCurrency(altTotal)}` : '—'}
                                  {capAlt.length > 0 && <span className="ml-1 text-[10px]">({capAlt.length})</span>}
                                </td>
                                <td className="py-2 text-right tabular-nums font-bold">
                                  <div className="flex items-center justify-end gap-1 pr-2">
                                    <span>{formatCurrency(capTotal)}</span>
                                    <button
                                      onClick={() => toggleOculto(cap.numero)}
                                      title="Ocultar capítulo"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity h-4 w-4 rounded flex items-center justify-center text-muted-foreground hover:text-orange-600 shrink-0">
                                      <EyeOff className="h-3 w-3" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {/* Descendant rows — any depth */}
                              {descendants.map(([subNum, subInfo]) => {
                                const subAlt = editAlt.filter(a => a.capitulo === subNum || a.capitulo.startsWith(subNum + '.'));
                                const subAltTotal = subAlt.reduce((s, a) => s + a.valor, 0);
                                const subHasChildren = hasChildren(subNum);
                                const subExpanded = expandedCenarioCaps.has(subNum);
                                const indent = (subInfo.nivel - 1) * 14;
                                return (
                                  <tr key={subNum} className="border-b hover:bg-muted/10">
                                    <td className="px-1 py-1 text-center">
                                      {subHasChildren && (
                                        <button onClick={() => toggleCenarioCap(subNum)}
                                          className="h-4 w-4 rounded flex items-center justify-center mx-auto text-muted-foreground hover:text-foreground">
                                          {subExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-1.5 font-mono text-slate-500" style={{ paddingLeft: `${indent}px` }}>{subNum}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">{subInfo.descricao}</td>
                                    <td className="px-3 py-1.5 text-xs text-muted-foreground italic">Média</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{subInfo.mediaTotal > 0 ? formatCurrency(subInfo.mediaTotal) : '—'}</td>
                                    <td className={cn('px-3 py-1.5 text-right tabular-nums text-xs',
                                      subAltTotal > 0 ? 'text-red-600' : subAltTotal < 0 ? 'text-green-600' : 'text-muted-foreground/40')}>
                                      {subAltTotal !== 0 ? `${subAltTotal > 0 ? '+' : ''}${formatCurrency(subAltTotal)}` : '—'}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                      {subInfo.mediaTotal + subAltTotal !== 0 ? formatCurrency(subInfo.mediaTotal + subAltTotal) : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        });
                      })()}
                      {/* Hidden chapters row */}
                      {editOcultos.size > 0 && editCaps.filter(c => editOcultos.has(c.numero)).map(cap => (
                        <tr key={cap.numero} className="border-b bg-muted/20 opacity-50">
                          <td />
                          <td className="px-3 py-1.5 font-mono text-xs line-through text-muted-foreground">{cap.numero}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground line-through truncate max-w-[200px]">{cap.descricao}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground italic">Oculto</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-xs text-muted-foreground line-through">{formatCurrency(cap.totalBase)}</td>
                          <td />
                          <td className="py-1.5 pr-2 text-right">
                            <button onClick={() => toggleOculto(cap.numero)} title="Tornar visível"
                              className="h-4 w-4 rounded flex items-center justify-center ml-auto text-orange-500 hover:text-foreground">
                              <Eye className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 bg-muted/30">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 font-bold text-sm">Total</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-sm">
                          {formatCurrency(capsVisiveis.reduce((s, c) => s + c.totalBase, 0))}
                        </td>
                        <td className={cn('px-3 py-2 text-right font-semibold tabular-nums text-sm',
                          totalAlteracoes > 0 ? 'text-red-600' : totalAlteracoes < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                          {totalAlteracoes !== 0 ? `${totalAlteracoes > 0 ? '+' : ''}${formatCurrency(totalAlteracoes)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-sm">{formatCurrency(totalCenario)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>

              {/* ── Alterações ao Orçamento ── */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Alterações ao Orçamento
                </h3>
                <div className="space-y-4">
                  {TIPOS_ALT.map(({ tipo, label, cor }) => {
                    const items = editAlt.filter(a => a.tipo === tipo);
                    const subtotal = items.reduce((s, a) => s + a.valor, 0);
                    return (
                      <Card key={tipo} className={cn('border', cor.split(' ')[2])}>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', cor)}>{label}</span>
                              {items.length > 0 && (
                                <span className={cn('text-xs font-semibold tabular-nums',
                                  subtotal > 0 ? 'text-red-600' : subtotal < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                                  {subtotal > 0 ? '+' : ''}{formatCurrency(subtotal)}
                                </span>
                              )}
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                              onClick={() => addAlteracao(tipo)}>
                              <Plus className="h-3 w-3" /> Adicionar
                            </Button>
                          </div>
                          {items.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-1">Sem {label.toLowerCase()}. Clique em Adicionar.</p>
                          ) : (
                            <div className="space-y-1">
                              {items.map(aj => (
                                <div key={aj.id} className="flex items-center gap-2">
                                  <Select value={aj.capitulo} onValueChange={v =>
                                    setCenarioEditAlteracoes(prev => prev.map(a => a.id === aj.id ? { ...a, capitulo: v } : a))
                                  }>
                                    <SelectTrigger className="h-7 w-20 text-xs font-mono shrink-0">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {allSelectableNums.map(([num, info]) => (
                                        <SelectItem key={num} value={num} className="text-xs font-mono">
                                          <span style={{ paddingLeft: `${(info.nivel - 1) * 10}px` }}>
                                            {num} {info.nivel === 1 ? '' : <span className="text-muted-foreground">· {info.descricao.slice(0, 20)}</span>}
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    className="h-7 text-xs flex-1"
                                    placeholder="Descrição do artigo…"
                                    value={aj.descricao}
                                    onChange={e => setCenarioEditAlteracoes(prev => prev.map(a => a.id === aj.id ? { ...a, descricao: e.target.value } : a))}
                                  />
                                  <Input
                                    className="h-7 text-xs w-28 text-right tabular-nums"
                                    placeholder="0"
                                    value={aj.valor === 0 ? '' : aj.valor}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value.replace(',', '.')) || 0;
                                      setCenarioEditAlteracoes(prev => prev.map(a => a.id === aj.id ? { ...a, valor: val } : a));
                                    }}
                                  />
                                  <button
                                    className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 shrink-0"
                                    onClick={() => setCenarioEditAlteracoes(prev => prev.filter(a => a.id !== aj.id))}>
                                    <X className="h-3 w-3" />
                                  </button>
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

              {/* ── Resumo por capítulo ── */}
              {editAlt.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Resumo por Capítulo
                  </h3>
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/50 border-b text-muted-foreground">
                            <th className="px-3 py-2 text-left w-14">Cap.</th>
                            <th className="px-3 py-2 text-left">Descrição</th>
                            <th className="px-3 py-2 text-right w-28">Base</th>
                            <th className="px-3 py-2 text-right w-24">Otim.</th>
                            <th className="px-3 py-2 text-right w-24">+ Adicionar</th>
                            <th className="px-3 py-2 text-right w-24">Remover</th>
                            <th className="px-3 py-2 text-right w-28 font-semibold text-foreground">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editCaps.map(cap => {
                            const otim   = editAlt.filter(a => a.capitulo === cap.numero && a.tipo === 'otimizacao').reduce((s, a) => s + a.valor, 0);
                            const addc   = editAlt.filter(a => a.capitulo === cap.numero && a.tipo === 'por_adicionar').reduce((s, a) => s + a.valor, 0);
                            const rem    = editAlt.filter(a => a.capitulo === cap.numero && a.tipo === 'remover').reduce((s, a) => s + a.valor, 0);
                            const capAltTotal = otim + addc + rem;
                            if (capAltTotal === 0) return null;
                            return (
                              <tr key={cap.numero} className="border-b hover:bg-muted/10">
                                <td className="px-3 py-2 font-mono font-bold">{cap.numero}</td>
                                <td className="px-3 py-2 font-medium truncate max-w-[180px]">{cap.descricao}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(cap.totalBase)}</td>
                                <td className={cn('px-3 py-2 text-right tabular-nums', otim !== 0 ? 'text-green-700' : 'text-muted-foreground/30')}>
                                  {otim !== 0 ? `${otim > 0 ? '+' : ''}${formatCurrency(otim)}` : '—'}
                                </td>
                                <td className={cn('px-3 py-2 text-right tabular-nums', addc !== 0 ? 'text-blue-700' : 'text-muted-foreground/30')}>
                                  {addc !== 0 ? `${addc > 0 ? '+' : ''}${formatCurrency(addc)}` : '—'}
                                </td>
                                <td className={cn('px-3 py-2 text-right tabular-nums', rem !== 0 ? 'text-red-700' : 'text-muted-foreground/30')}>
                                  {rem !== 0 ? `${rem > 0 ? '+' : ''}${formatCurrency(rem)}` : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold">
                                  {formatCurrency(getCenarioCapituloTotal(cap, editAlt))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t-2 bg-muted/30">
                          <tr>
                            <td colSpan={2} className="px-3 py-2 font-bold text-sm">Total</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(editCaps.reduce((s, c) => s + c.totalBase, 0))}</td>
                            <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', editAlt.filter(a=>a.tipo==='otimizacao').reduce((s,a)=>s+a.valor,0) !== 0 ? 'text-green-700' : 'text-muted-foreground/40')}>
                              {(() => { const v = editAlt.filter(a=>a.tipo==='otimizacao').reduce((s,a)=>s+a.valor,0); return v !== 0 ? `${v>0?'+':''}${formatCurrency(v)}` : '—'; })()}
                            </td>
                            <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', editAlt.filter(a=>a.tipo==='por_adicionar').reduce((s,a)=>s+a.valor,0) !== 0 ? 'text-blue-700' : 'text-muted-foreground/40')}>
                              {(() => { const v = editAlt.filter(a=>a.tipo==='por_adicionar').reduce((s,a)=>s+a.valor,0); return v !== 0 ? `${v>0?'+':''}${formatCurrency(v)}` : '—'; })()}
                            </td>
                            <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', editAlt.filter(a=>a.tipo==='remover').reduce((s,a)=>s+a.valor,0) !== 0 ? 'text-red-700' : 'text-muted-foreground/40')}>
                              {(() => { const v = editAlt.filter(a=>a.tipo==='remover').reduce((s,a)=>s+a.valor,0); return v !== 0 ? `${v>0?'+':''}${formatCurrency(v)}` : '—'; })()}
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-sm">{formatCurrency(totalCenario)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          );
        })()}

        {/* Chapter badges (only for regular orçamentos) */}
        {selectedProj.tipo !== 'cenario' && caps.length > 0 && (
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

        {/* Upload zone — hidden for cenarios */}
        {selectedProj.tipo !== 'cenario' && <div
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
        </div>}

        {/* Ficheiros list + toggle */}
        {selectedProj.tipo !== 'cenario' && selectedProj.ficheiros.length > 0 && (
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
                  onRemoverLinha={(linhaId) => {
                    updateOrcamentos(prev => prev.map(o => {
                      if (o.id !== selectedOrcId) return o;
                      return {
                        ...o,
                        projetos: o.projetos.map(p => {
                          if (p.id !== selectedProjId) return p;
                          return {
                            ...p,
                            ficheiros: p.ficheiros.map(f => {
                              const novasLinhas = f.linhas.filter(l => l.id !== linhaId);
                              return { ...f, linhas: novasLinhas, total: calcLinhasTotal(novasLinhas) };
                            }),
                          };
                        }),
                      };
                    }));
                  }}
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
          <h1 className="section-title">Propostas</h1>
          <p className="section-subtitle mt-1">Gerencie propostas de empreiteiros e compare orçamentos</p>
        </div>
        <div className="flex gap-2">
          {orcamentos.length >= 2 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setView('comparar')}>
              <BarChart2 className="h-4 w-4" /> Comparar
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setShowNovoOrc(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova Proposta
          </Button>
        </div>
      </div>

      {orcamentos.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium">Ainda não tem propostas.</p>
          <p className="text-xs mt-1 mb-4">Crie uma proposta para começar a organizar orçamentos.</p>
          <Button variant="outline" className="gap-1.5" onClick={() => setShowNovoOrc(true)}>
            <Plus className="h-4 w-4" /> Criar primeira proposta
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
              <Card key={orc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <FolderOpen className="h-5 w-5 text-blue-600 shrink-0 cursor-pointer" onClick={() => irParaOrcamento(orc.id)} />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => irParaOrcamento(orc.id)}>
                    <p className="text-sm font-medium truncate">{orc.nome}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {orc.projetos.length} orçamento(s) · {nFics} ficheiro(s) ·{' '}
                      {new Date(orc.criadoEm).toLocaleDateString('pt-PT')}
                      {(orc.m2AcimaSolo + orc.m2AbaixoSolo) > 0 && <span> · {orc.m2AcimaSolo + orc.m2AbaixoSolo} m²</span>}
                    </p>
                  </div>
                  {topProjetos.length > 0 && (
                    <div onClick={e => e.stopPropagation()}>
                      <Select
                        value={orc.projetoId || '__none__'}
                        onValueChange={v => updateOrcamentos(prev => prev.map(o =>
                          o.id === orc.id ? { ...o, projetoId: v === '__none__' ? null : v } : o
                        ))}
                      >
                        <SelectTrigger className="h-7 text-xs w-36 border-dashed">
                          <Link2 className="h-3 w-3 mr-1.5 shrink-0 text-muted-foreground" />
                          <SelectValue placeholder="Projeto…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-xs text-muted-foreground">— Sem projeto —</SelectItem>
                          {topProjetos.map(p => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="text-right shrink-0 cursor-pointer" onClick={() => irParaOrcamento(orc.id)}>
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

      {/* Dialog: Nova Proposta */}
      <Dialog open={showNovoOrc} onOpenChange={(o) => { setShowNovoOrc(o); if (!o) { setNovoOrcNome(''); setNovoOrcProjetoId(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Proposta</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label htmlFor="orc-nome" className="text-sm">Nome da proposta</Label>
              <Input id="orc-nome" className="mt-1.5" placeholder="Ex: Construtora Silva"
                value={novoOrcNome} onChange={(e) => setNovoOrcNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && criarOrcamento()} autoFocus />
            </div>
            {topProjetos.length > 0 && (
              <div>
                <Label className="text-sm">Projeto <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Select value={novoOrcProjetoId || '__none__'} onValueChange={v => setNovoOrcProjetoId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="mt-1.5 h-9 text-sm"><SelectValue placeholder="Associar a um projeto…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-sm text-muted-foreground">— Sem projeto —</SelectItem>
                    {topProjetos.map(p => <SelectItem key={p.id} value={p.id} className="text-sm">{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
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
