export interface Release {
  id: number;
  name: string;
  status: string;
  createdOn: string;
  modifiedOn: string;
  completedTime?: string;
  envs: any[];
  passedTestCount?: number;
  notRunTestCount?: number;
  failedTestCount?: number;
  failedTestCases?: any[];
  link?: string;
}