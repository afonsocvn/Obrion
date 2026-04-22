-- Corre este ficheiro no Supabase SQL Editor

-- 1. Função segura para workspaces de convites pendentes (sem recursão RLS)
DROP FUNCTION IF EXISTS get_my_invited_workspace_ids();
CREATE OR REPLACE FUNCTION get_my_invited_workspace_ids()
RETURNS SETOF UUID AS $$
  SELECT workspace_id FROM workspace_invites
  WHERE lower(email) = lower(coalesce(auth.email(), '')) AND accepted = false
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 2. Política para utilizadores convidados verem o nome da equipa
DROP POLICY IF EXISTS "workspaces_select_invited" ON workspaces;
CREATE POLICY "workspaces_select_invited" ON workspaces
  FOR SELECT USING (id IN (SELECT get_my_invited_workspace_ids()));

-- 3. Política de delete em falta (rejectInvite e cancelInvite falhavam)
DROP POLICY IF EXISTS "invites_delete" ON workspace_invites;
CREATE POLICY "invites_delete" ON workspace_invites
  FOR DELETE USING (
    lower(email) = lower(coalesce(auth.email(), ''))
    OR invited_by = auth.uid()
    OR workspace_id IN (SELECT get_my_workspace_ids())
  );

-- 4. Função principal: buscar convites pendentes do utilizador atual
--    Usa SECURITY DEFINER + lower() para evitar problemas de RLS e capitalização
DROP FUNCTION IF EXISTS get_my_pending_invites();
CREATE OR REPLACE FUNCTION get_my_pending_invites()
RETURNS TABLE(id UUID, workspace_id UUID) AS $$
  SELECT i.id, i.workspace_id
  FROM workspace_invites i
  WHERE lower(i.email) = lower(coalesce(auth.email(), ''))
    AND i.accepted = false
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
