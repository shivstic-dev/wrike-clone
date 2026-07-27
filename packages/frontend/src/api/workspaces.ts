import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';
import type {
  Workspace,
  Folder,
  Project,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
} from '@wrike-clone/shared';

// ---- Query key factory ----
export const workspaceKeys = {
  all: ['workspaces'] as const,
  lists: () => [...workspaceKeys.all, 'list'] as const,
  list: () => [...workspaceKeys.lists()] as const,
  details: () => [...workspaceKeys.all, 'detail'] as const,
  detail: (id: string) => [...workspaceKeys.details(), id] as const,
  folders: (id: string) => [...workspaceKeys.detail(id), 'folders'] as const,
  projects: (id: string) => [...workspaceKeys.detail(id), 'projects'] as const,
};

export const folderKeys = {
  all: ['folders'] as const,
  tree: (workspaceId: string) => [...folderKeys.all, 'tree', workspaceId] as const,
};

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
};

// ---- Workspace Hooks ----

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get('/workspaces');
      // Backend returns raw array directly, not wrapped in { data: [...] }
      const data = response.data;
      if (Array.isArray(data)) return data as Workspace[];
      if (data && Array.isArray(data.data)) return data.data as Workspace[];
      return [];
    },
  });
}

export function useWorkspaceMembers(workspaceId: string) {
  return useQuery({
    queryKey: [...workspaceKeys.detail(workspaceId), 'members'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/workspaces/${workspaceId}/members`);
      return (Array.isArray(data) ? data : []) as Array<{
        userId: string;
        displayName: string;
        email: string;
        role: 'employee' | 'manager' | 'department_head';
      }>;
    },
    enabled: !!workspaceId,
  });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: workspaceKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get(`/workspaces/${id}`);
      // Backend returns the workspace object directly (not wrapped in { data })
      return response.data as Workspace;
    },
    enabled: !!id,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWorkspaceRequest) => {
      const { data } = await apiClient.post<Workspace>('/workspaces', input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateWorkspaceRequest & { id: string }) => {
      const { data } = await apiClient.patch<Workspace>(`/workspaces/${id}`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}

// ---- Folder Hooks ----

export function useFolderTree(workspaceId: string) {
  return useQuery({
    queryKey: folderKeys.tree(workspaceId),
    queryFn: async () => {
      const response = await apiClient.get('/folders', {
        params: { workspaceId },
      });
      const data = response.data;
      if (Array.isArray(data)) return data as Folder[];
      if (data && Array.isArray(data.data)) return data.data as Folder[];
      return [];
    },
    enabled: !!workspaceId,
  });
}

// ---- Project Hooks ----

export function useWorkspaceProjects(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.projects(workspaceId),
    queryFn: async () => {
      const response = await apiClient.get('/projects', {
        params: { workspaceId },
      });
      const data = response.data;
      if (Array.isArray(data)) return data as Project[];
      if (data && Array.isArray(data.data)) return data.data as Project[];
      return [];
    },
    enabled: !!workspaceId,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get(`/projects/${id}`);
      // Backend returns project object directly (not wrapped in { data })
      if (response.data?.data) return response.data.data as Project;
      return response.data as Project;
    },
    enabled: !!id,
  });
}
