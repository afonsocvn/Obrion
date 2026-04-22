-- 1. Adicionar coluna rejected aos convites
ALTER TABLE workspace_invites ADD COLUMN IF NOT EXISTS rejected BOOLEAN DEFAULT FALSE;

-- 2. Atualizar política de SELECT para incluir coluna rejected
DROP POLICY IF EXISTS "invites_select" ON workspace_invites;
CREATE POLICY "invites_select" ON workspace_invites
  FOR SELECT USING (
    invited_by = auth.uid()
    OR email = auth.email()
    OR workspace_id IN (SELECT get_my_workspace_ids())
  );

-- 3. Ativar Realtime na tabela workspace_invites
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_invites;
