export interface Build {
  id: number;
  name: string;
  status: string;
  result: string;
  startTime: string;
  modifiedOn: string;
  testRunName?: string;
  passedTestCount?: number;
  failedTestCount?: number;
  link?: string;
}