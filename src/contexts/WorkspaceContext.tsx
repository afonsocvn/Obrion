import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

export interface Workspace {
  id: string;
  nome: string;
  owner_id: string;
  criado_em: string;
}

export interface WorkspaceMember {
  user_id: string;
  role: 'owner' | 'member';
  email: string;
  joined_at: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isTeamMode: boolean;
  isOwner: boolean;
  members: WorkspaceMember[];
  createWorkspace: (nome: string) => Promise<Workspace | null>;
  switchToPersonal: () => void;
  switchToWorkspace: (workspace: Workspace) => void;
  inviteByEmail: (email: string) => Promise<boolean>;
  refreshWorkspaces: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setActiveWorkspace(null);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .from('workspace_members')
        .select('workspaces(id, nome, owner_id, criado_em)')
        .eq('user_id', user.id);

      if (fetchError) console.error('[fetchWorkspaces]', fetchError.message);

      const ws = ((data ?? []) as any[])
        .map((row) => row.workspaces)
        .filter(Boolean) as Workspace[];

      // Auto-accept pending invites
      try {
        const { data: invites } = await supabase
          .from('workspace_invites')
          .select('id, workspace_id, workspaces(id, nome, owner_id, criado_em)')
          .eq('email', user.email!.toLowerCase())
          .eq('accepted', false);

        if (invites && invites.length > 0) {
          for (const invite of invites as any[]) {
            const alreadyMember = ws.some((w) => w.id === invite.workspace_id);
            if (!alreadyMember) {
              await supabase.from('workspace_members').insert({
                workspace_id: invite.workspace_id,
                user_id: user.id,
                role: 'member',
                email: user.email,
              });
              if (invite.workspaces) ws.push(invite.workspaces as Workspace);
            }
            await supabase.from('workspace_invites').update({ accepted: true }).eq('id', invite.id);
          }
        }
      } catch {
        // invites table may not exist yet
      }

      setWorkspaces(ws);
    } catch {
      setWorkspaces([]);
    }
  }, [user]);

  const fetchMembers = useCallback(async (workspaceId: string) => {
    try {
      const { data } = await supabase
        .from('workspace_members')
        .select('user_id, role, email, joined_at')
        .eq('workspace_id', workspaceId);
      setMembers((data ?? []) as WorkspaceMember[]);
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (activeWorkspace) {
      fetchMembers(activeWorkspace.id);
    } else {
      setMembers([]);
    }
  }, [activeWorkspace, fetchMembers]);

  const createWorkspace = async (nome: string): Promise<Workspace | null> => {
    if (!user) return null;
    const { data: ws, error } = await supabase
      .from('workspaces')
      .insert({ nome, owner_id: user.id })
      .select()
      .single();
    if (error) {
      console.error('[createWorkspace] insert workspaces:', error.message, error.details);
      return null;
    }
    if (!ws) return null;
    const { error: memberError } = await supabase.from('workspace_members').insert({
      workspace_id: (ws as Workspace).id,
      user_id: user.id,
      role: 'owner',
      email: user.email,
    });
    if (memberError) {
      console.error('[createWorkspace] insert workspace_members:', memberError.message, memberError.details);
    }
    setWorkspaces((prev) => [...prev, ws as Workspace]);
    return ws as Workspace;
  };

  const inviteByEmail = async (email: string): Promise<boolean> => {
    if (!user || !activeWorkspace) return false;
    const { error } = await supabase.from('workspace_invites').upsert(
      { workspace_id: activeWorkspace.id, email: email.toLowerCase(), invited_by: user.id, accepted: false },
      { onConflict: 'workspace_id,email' }
    );
    return !error;
  };

  const isOwner = activeWorkspace?.owner_id === user?.id;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        isTeamMode: activeWorkspace !== null,
        isOwner,
        members,
        createWorkspace,
        switchToPersonal: () => setActiveWorkspace(null),
        switchToWorkspace: (ws) => setActiveWorkspace(ws),
        inviteByEmail,
        refreshWorkspaces: fetchWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
