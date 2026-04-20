-- Corrigir recursão infinita nas políticas RLS
-- Corre este ficheiro APÓS o workspaces_migration.sql

-- 1. Remover as políticas com recursão
DROP POLICY IF EXISTS "workspaces_select" ON workspaces;
DROP POLICY IF EXISTS "wm_select" ON workspace_members;
DROP POLICY IF EXISTS "wm_insert" ON workspace_members;

-- 2. Função auxiliar SECURITY DEFINER — bypassa RLS, evita recursão
CREATE OR REPLACE FUNCTION get_my_workspace_ids()
RETURNS SETOF UUID AS $$
  SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 3. Recriar políticas sem recursão

-- Workspaces: ver apenas equipas onde sou membro
CREATE POLICY "workspaces_select" ON workspaces
  FOR SELECT USING (id IN (SELECT get_my_workspace_ids()));

-- Workspace members: ver todos os membros das equipas a que pertenço
CREATE POLICY "wm_select" ON workspace_members
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- Workspace members: inserir a própria adesão OU owner a adicionar membros
CREATE POLICY "wm_insert" ON workspace_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
