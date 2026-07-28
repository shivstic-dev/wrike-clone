export interface ResolvedTaskLocation {
  departmentId: string;
  folderId: string;
  folderName: string;
  projectId: string;
  projectName: string;
  isSystemProject: boolean;
}

export interface TaskLocationFolderRow {
  id: string;
  workspace_id: string;
  name: string;
  is_system_general: boolean;
}
