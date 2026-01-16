export interface DayData {
  date: string;
  totalTests: number;
}

export interface Derivative {
  date: string;
  change: number;
  testsBefore: number;
  testsAfter: number;
}

export interface MonthlyRunDetail {
  date: string;
  testCaseCount: number;
  bufferUsed: number;
  foundTestCases: Array<{ testCaseId: number; testCaseName: string }>;
  notFoundTestCases: Array<{ testCaseId: number; testCaseName: string }>;
  casesRunThatAreNotInTestPlan: Array<{ testCaseId: number; testCaseName: string }>;
  flakyTests: Array<{ testCaseId: number; testCaseName: string; executionCount: number }>;
  flakyTestCount: number;
  passRates: {
    initialPassRate: number;
    finalPassRate: number;
    initialPassedCount: number;
    finalPassedCount: number;
    totalTestsFound: number;
  };
  runBoundaries: { startDate: string | null; endDate: string | null; durationDays: number | null };
}
