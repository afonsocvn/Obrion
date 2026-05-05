-- ============================================================
-- Tabelas para o módulo de Orçamentos
-- Corre no Supabase SQL Editor
-- ============================================================

-- Tabela principal (o que o utilizador chama "Projeto")
CREATE TABLE IF NOT EXISTS orcamentos (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  criado_em text NOT NULL DEFAULT '',
  m2_acima_solo numeric NOT NULL DEFAULT 0,
  m2_abaixo_solo numeric NOT NULL DEFAULT 0,
  num_apartamentos int NOT NULL DEFAULT 0,
  m2_retalho numeric NOT NULL DEFAULT 0,
  m2_areas_comuns numeric NOT NULL DEFAULT 0,
  m2_circulacao numeric NOT NULL DEFAULT 0,
  m2_areas_tecnicas numeric NOT NULL DEFAULT 0,
  m2_terracos numeric NOT NULL DEFAULT 0
);

-- Propostas / orçamentos dentro de cada projeto
CREATE TABLE IF NOT EXISTS orcamento_projetos (
  id text PRIMARY KEY,
  orcamento_id text NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  versao text NOT NULL DEFAULT '',
  criado_em text NOT NULL DEFAULT ''
);

-- Ficheiros Excel/PDF: linhas guardadas como JSONB
CREATE TABLE IF NOT EXISTS orcamento_ficheiros (
  id text PRIMARY KEY,
  projeto_id text NOT NULL REFERENCES orcamento_projetos(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  folha text NOT NULL DEFAULT '',
  carregado_em text NOT NULL DEFAULT '',
  total numeric NOT NULL DEFAULT 0,
  linhas jsonb NOT NULL DEFAULT '[]'
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_ficheiros ENABLE ROW LEVEL SECURITY;

-- get_my_workspace_ids() já existe (criado em fix_rls_final.sql)

CREATE POLICY "orcamentos_all" ON orcamentos FOR ALL
  USING (
    user_id = auth.uid()
    OR workspace_id IN (SELECT get_my_workspace_ids())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY "orcamento_projetos_all" ON orcamento_projetos FOR ALL
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

CREATE POLICY "orcamento_ficheiros_all" ON orcamento_ficheiros FOR ALL
  USING (
    projeto_id IN (
      SELECT id FROM orcamento_projetos
      WHERE orcamento_id IN (
        SELECT id FROM orcamentos
        WHERE user_id = auth.uid()
           OR workspace_id IN (SELECT get_my_workspace_ids())
      )
    )
  )
  WITH CHECK (
    projeto_id IN (
      SELECT id FROM orcamento_projetos
      WHERE orcamento_id IN (
        SELECT id FROM orcamentos
        WHERE user_id = auth.uid()
           OR workspace_id IN (SELECT get_my_workspace_ids())
      )
    )
  );
