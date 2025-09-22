export interface Release {
  id: number;
  name: string;
  status: string;
  createdOn: string;
  modifiedOn: string;
  envs: any[];
  passedTestCount?: number;
  failedTestCount?: number;
  link?: string;
}