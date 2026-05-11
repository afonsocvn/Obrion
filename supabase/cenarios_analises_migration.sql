-- ============================================================
-- Migração: Cenários + Análises + colunas em falta
-- Corre no Supabase SQL Editor (seguro correr múltiplas vezes)
-- ============================================================

-- 1. Colunas em falta na tabela orcamentos
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS projeto_id     text;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS projeto_default text;

-- 2. Colunas em falta na tabela projetos (tipo e hierarquia)
ALTER TABLE projetos ADD COLUMN IF NOT EXISTS tipo      text NOT NULL DEFAULT 'estimativa';
ALTER TABLE projetos ADD COLUMN IF NOT EXISTS parent_id text;

-- 3. Estender orcamento_projetos para Cenários
ALTER TABLE orcamento_projetos ADD COLUMN IF NOT EXISTS tipo          text NOT NULL DEFAULT 'orcamento';
ALTER TABLE orcamento_projetos ADD COLUMN IF NOT EXISTS cenario_config jsonb;

-- 4. Tabela de Análises guardadas
CREATE TABLE IF NOT EXISTS orcamento_analises (
  id           text PRIMARY KEY,
  orcamento_id text NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  nome         text NOT NULL DEFAULT '',
  criado_em    text NOT NULL DEFAULT '',
  config       jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE orcamento_analises ENABLE ROW LEVEL SECURITY;

-- Política RLS (DROP + CREATE para garantir que está actualizada)
DROP POLICY IF EXISTS "orcamento_analises_all" ON orcamento_analises;
CREATE POLICY "orcamento_analises_all" ON orcamento_analises FOR ALL
  USING (
    orcamento_id IN (
      SELECT id FROM orcamentos
      WHERE user_id = auth.uid()
         OR workspace_id IN (SELECT get_my_workspace_ids())
    )
  )
  WITH CHECK (
    orcamento_id IN (
      SELECT id FROM orcamentos
      WHERE user_id = auth.uid()
         OR workspace_id IN (SELECT get_my_workspace_ids())
    )
  );
