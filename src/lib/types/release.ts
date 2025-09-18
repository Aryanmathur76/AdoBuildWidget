export interface Release {
  id: number;
  description: string;
  name: string;
  status: string;
  createdOn: string;
  modifiedOn: string;
  envs: any[];
  passedTestCount?: number;
  failedTestCount?: number;
}