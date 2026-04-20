-- ============================================================
-- CORRE ESTE FICHEIRO COMPLETO NO SUPABASE SQL EDITOR
-- Elimina todas as políticas antigas e recria sem recursão
-- ============================================================

-- 1. Remover TODAS as políticas existentes
DROP POLICY IF EXISTS "workspaces_select"      ON workspaces;
DROP POLICY IF EXISTS "workspaces_insert"      ON workspaces;
DROP POLICY IF EXISTS "wm_select"              ON workspace_members;
DROP POLICY IF EXISTS "wm_insert"              ON workspace_members;
DROP POLICY IF EXISTS "invites_select"         ON workspace_invites;
DROP POLICY IF EXISTS "invites_insert"         ON workspace_invites;
DROP POLICY IF EXISTS "invites_update"         ON workspace_invites;
DROP POLICY IF EXISTS "workspace_members_select" ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_insert" ON workspace_members;

-- 2. Função SECURITY DEFINER — consulta workspace_members sem activar RLS (evita loop)
DROP FUNCTION IF EXISTS get_my_workspace_ids();
CREATE OR REPLACE FUNCTION get_my_workspace_ids()
RETURNS SETOF UUID AS $$
  SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 3. Políticas para workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_select" ON workspaces
  FOR SELECT USING (id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "workspaces_insert" ON workspaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- 4. Políticas para workspace_members  (sem subquery recursiva)
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Ver membros das equipas a que pertenço (usa a função SECURITY DEFINER)
CREATE POLICY "wm_select" ON workspace_members
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- Inserir a PRÓPRIA adesão (owner ao criar, membro ao aceitar convite)
CREATE POLICY "wm_insert" ON workspace_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 5. Políticas para workspace_invites
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_select" ON workspace_invites
  FOR SELECT USING (
    invited_by = auth.uid()
    OR email = auth.email()
    OR workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY "invites_insert" ON workspace_invites
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY "invites_update" ON workspace_invites
  FOR UPDATE USING (email = auth.email());
