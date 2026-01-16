export interface TestRun {
    id: number;
    name: string;
    state: string;
    startedDate: string;
    completedDate?: string | null;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    notExecutedTests: number;
}

export interface TestRunGroup {
    date: string;
    runs: TestRun[];
    totalTests: number;
    passedTests: number;
    failedTests: number;
    notExecutedTests: number;
}
