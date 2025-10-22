export interface Release {
  id: number;
  name: string;
  status: string;
  createdOn: string;
  modifiedOn: string;
  completedTime?: string;
  envs: any[];
  passedTestCount?: number;
  failedTestCount?: number;
  failedTestCases?: any[];
  link?: string;
}