export interface StudentsByLevelStat {
  levelName: string;
  rank: number;
  count: number;
}

export interface DashboardStats {
  totalActiveStudents: number;
  studentsByLevel: StudentsByLevelStat[];
  currentSession: string | null;
  currentTerm: string | null;
}
