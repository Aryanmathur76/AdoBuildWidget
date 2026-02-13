export interface Build {
  id: number;
  name: string;
  pipelineName?: string;
  status: string;
  result: string;
  startTime: string;
  modifiedOn: string;
  completedTime?: string;
  testRunName?: string;
  passedTestCount?: number;
  failedTestCount?: number;
  failedTestCases?: any[];
  link?: string;
}