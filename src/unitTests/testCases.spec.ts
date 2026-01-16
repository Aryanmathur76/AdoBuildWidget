import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GET } from '../routes/api/test-cases/+server';
import * as utils from '$lib/utils';

describe('test-cases API', () => {
    let _logSpy: any;
    let _errorSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        _logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        _errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Mock getAzureDevOpsEnvVars to avoid needing actual environment variables
        vi.spyOn(utils, 'getAzureDevOpsEnvVars').mockReturnValue({
            AZURE_DEVOPS_ORGANIZATION: 'TestOrg',
            AZURE_DEVOPS_PROJECT: 'TestProject',
            AZURE_DEVOPS_PAT: 'test-pat-token'
        });
    });

    afterEach(() => {
        _logSpy?.mockRestore?.();
        _errorSpy?.mockRestore?.();
    });

    describe('Input validation', () => {
        it('should return 400 if pipelineType is missing', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineId=123&date=2025-12-17');
            const response = await GET({ url } as any);
            const data = await response.json();
            
            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing pipelineType');
        });

        it('should return 400 if pipelineId is missing', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&date=2025-12-17');
            const response = await GET({ url } as any);
            const data = await response.json();
            
            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing pipelineType or pipelineId');
        });

        it('should return 400 if date is missing', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123');
            const response = await GET({ url } as any);
            const data = await response.json();
            
            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing or invalid date');
        });

        it('should return 400 if date format is invalid', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123&date=12-17-2025');
            const response = await GET({ url } as any);
            const data = await response.json();
            
            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing or invalid date');
        });

        it('should return 400 if pipelineType is invalid', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=invalid&pipelineId=123&date=2025-12-17');
            
            global.fetch = vi.fn();
            
            const response = await GET({ url } as any);
            const data = await response.json();
            
            expect(response.status).toBe(400);
            expect(data.error).toContain('Invalid pipelineType');
        });
    });

    describe('Release pipeline test cases', () => {
        it('should fetch test cases for release pipeline and deduplicate by run name', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=78128&date=2025-12-17');
            
            // Mock test runs response with duplicate run names
            const mockTestRuns = {
                value: [
                    {
                        id: 2118113,
                        name: 'PRODEVAL_Tests_on_PE-78128',
                        createdDate: '2025-12-17T20:57:12.633Z',
                        release: { environmentId: 4051969 }
                    },
                    {
                        id: 2118131,
                        name: 'PRODEVAL_Verify_DeltaV_App_Crash_Tests_on_PE-78128',
                        createdDate: '2025-12-17T22:29:39.077Z',
                        release: { environmentId: 4051969 }
                    },
                    {
                        id: 2118100,
                        name: 'PRODEVAL_Tests_on_PE-78128',
                        createdDate: '2025-12-17T19:00:00.000Z',
                        release: { environmentId: 4051969 }
                    }
                ]
            };

            const mockTestResults1 = {
                value: [
                    { id: 1, testCase: { name: 'Test 1' }, outcome: 'Passed', associatedBugs: [] },
                    { id: 2, testCase: { name: 'Test 2' }, outcome: 'Failed', associatedBugs: [] }
                ]
            };

            const mockTestResults2 = {
                value: [
                    { id: 3, testCaseTitle: 'Test 3', outcome: 'Passed', associatedBugs: [] }
                ]
            };

            let fetchCallCount = 0;
            global.fetch = vi.fn(async (url: string | URL | Request) => {
                fetchCallCount++;
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/_apis/test/runs?releaseIds=')) {
                    return {
                        ok: true,
                        json: async () => mockTestRuns
                    } as any;
                }
                if (urlString.includes('/Runs/2118113/results')) {
                    return {
                        ok: true,
                        json: async () => mockTestResults1
                    } as any;
                }
                if (urlString.includes('/Runs/2118131/results')) {
                    return {
                        ok: true,
                        json: async () => mockTestResults2
                    } as any;
                }
                return { ok: false } as any;
            });

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.testCases).toHaveLength(3);
            expect(data.testCases).toEqual([
                { id: 1, name: 'Test 1', outcome: 'Passed', associatedBugs: [] },
                { id: 2, name: 'Test 2', outcome: 'Failed', associatedBugs: [] },
                { id: 3, name: 'Test 3', outcome: 'Passed', associatedBugs: [] }
            ]);
            
            // Should only fetch from 2 runs (latest per name), not all 3
            expect(fetchCallCount).toBe(3); // 1 for runs list, 2 for test results
        });

        it('should keep latest run when same test run name appears multiple times', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123&date=2025-12-17');
            
            const mockTestRuns = {
                value: [
                    {
                        id: 100,
                        name: 'SameTestRun',
                        createdDate: '2025-12-17T10:00:00.000Z',
                        release: { environmentId: 1 }
                    },
                    {
                        id: 101,
                        name: 'SameTestRun',
                        createdDate: '2025-12-17T11:00:00.000Z',
                        release: { environmentId: 1 }
                    },
                    {
                        id: 102,
                        name: 'SameTestRun',
                        createdDate: '2025-12-17T09:00:00.000Z',
                        release: { environmentId: 1 }
                    }
                ]
            };

            const mockTestResults = {
                value: [
                    { id: 1, testCase: { name: 'Test 1' }, outcome: 'Passed', associatedBugs: [] }
                ]
            };

            global.fetch = vi.fn(async (url: string | URL | Request) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/_apis/test/runs?releaseIds=')) {
                    return {
                        ok: true,
                        json: async () => mockTestRuns
                    } as any;
                }
                if (urlString.includes('/Runs/101/results')) {
                    return {
                        ok: true,
                        json: async () => mockTestResults
                    } as any;
                }
                return { ok: false } as any;
            });

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.testCases).toHaveLength(1);
            // Should have fetched from run 101 (latest by createdDate), not 100 or 102
        });

        it('should return empty array if no test runs found', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123&date=2025-12-17');
            
            global.fetch = vi.fn(async () => ({
                ok: true,
                json: async () => ({ value: [] })
            } as any));

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.testCases).toEqual([]);
        });

        it('should skip test runs without a name', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123&date=2025-12-17');
            
            const mockTestRuns = {
                value: [
                    {
                        id: 100,
                        name: null,
                        createdDate: '2025-12-17T10:00:00.000Z',
                        release: { environmentId: 1 }
                    },
                    {
                        id: 101,
                        name: 'ValidRun',
                        createdDate: '2025-12-17T11:00:00.000Z',
                        release: { environmentId: 1 }
                    }
                ]
            };

            const mockTestResults = {
                value: [
                    { id: 1, testCase: { name: 'Test 1' }, outcome: 'Passed', associatedBugs: [] }
                ]
            };

            global.fetch = vi.fn(async (url: string | URL | Request) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/_apis/test/runs?releaseIds=')) {
                    return {
                        ok: true,
                        json: async () => mockTestRuns
                    } as any;
                }
                if (urlString.includes('/Runs/101/results')) {
                    return {
                        ok: true,
                        json: async () => mockTestResults
                    } as any;
                }
                return { ok: false } as any;
            });

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.testCases).toHaveLength(1);
        });

        it('should handle failed test results fetch gracefully', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123&date=2025-12-17');
            
            const mockTestRuns = {
                value: [
                    {
                        id: 100,
                        name: 'TestRun1',
                        createdDate: '2025-12-17T10:00:00.000Z',
                        release: { environmentId: 1 }
                    },
                    {
                        id: 101,
                        name: 'TestRun2',
                        createdDate: '2025-12-17T11:00:00.000Z',
                        release: { environmentId: 2 }
                    }
                ]
            };

            const mockTestResults = {
                value: [
                    { id: 1, testCase: { name: 'Test 1' }, outcome: 'Passed', associatedBugs: [] }
                ]
            };

            global.fetch = vi.fn(async (url: string | URL | Request) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/_apis/test/runs?releaseIds=')) {
                    return {
                        ok: true,
                        json: async () => mockTestRuns
                    } as any;
                }
                if (urlString.includes('/Runs/100/results')) {
                    return { ok: false } as any;
                }
                if (urlString.includes('/Runs/101/results')) {
                    return {
                        ok: true,
                        json: async () => mockTestResults
                    } as any;
                }
                return { ok: false } as any;
            });

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.testCases).toHaveLength(1);
        });
    });

    describe('Build pipeline test cases', () => {
        it('should fetch test cases for build pipeline', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=build&pipelineId=456&date=2025-12-17');
            
            const mockTestRuns = {
                value: [
                    { id: 200 },
                    { id: 201 }
                ]
            };

            const mockTestResults1 = {
                value: [
                    { id: 1, testCase: { name: 'Build Test 1' }, outcome: 'Passed', associatedBugs: [] },
                    { id: 2, testCase: { name: 'Build Test 2' }, outcome: 'Failed', associatedBugs: [123] }
                ]
            };

            const mockTestResults2 = {
                value: [
                    { id: 3, testCaseTitle: 'Build Test 3', outcome: 'Passed', associatedBugs: [] }
                ]
            };
            global.fetch = vi.fn(async (url: string | URL | Request) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/_apis/test/runs?buildIds=')) {
                    return {
                        ok: true,
                        json: async () => mockTestRuns
                    } as any;
                }
                if (urlString.includes('/Runs/200/results')) {
                    return {
                        ok: true,
                        json: async () => mockTestResults1
                    } as any;
                }
                if (urlString.includes('/Runs/201/results')) {
                    return {
                        ok: true,
                        json: async () => mockTestResults2
                    } as any;
                }
                return { ok: false } as any;
            });

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.testCases).toHaveLength(3);
            expect(data.testCases).toEqual([
                { id: 1, name: 'Build Test 1', outcome: 'Passed', associatedBugs: [] },
                { id: 2, name: 'Build Test 2', outcome: 'Failed', associatedBugs: [123] },
                { id: 3, name: 'Build Test 3', outcome: 'Passed', associatedBugs: [] }
            ]);
        });

        it('should handle pagination for build test results', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=build&pipelineId=456&date=2025-12-17');
            
            const mockTestRuns = {
                value: [{ id: 200 }]
            };

            // Create 1500 test results to test pagination
            const firstBatch = Array.from({ length: 1000 }, (_, i) => ({
                id: i + 1,
                testCase: { name: `Test ${i + 1}` },
                outcome: 'Passed',
                associatedBugs: []
            }));
            const secondBatch = Array.from({ length: 500 }, (_, i) => ({
                id: i + 1001,
                testCase: { name: `Test ${i + 1001}` },
                outcome: 'Passed',
                associatedBugs: []
            }));

            global.fetch = vi.fn(async (url: string | URL | Request) => {
                const urlString = typeof url === 'string' ? url : url.toString();
                if (urlString.includes('/_apis/test/runs?buildIds=')) {
                    return {
                        ok: true,
                        json: async () => mockTestRuns
                    } as any;
                }
                if (urlString.includes('$skip=0')) {
                    return {
                        ok: true,
                        json: async () => ({ value: firstBatch })
                    } as any;
                }
                if (urlString.includes('$skip=1000')) {
                    return {
                        ok: true,
                        json: async () => ({ value: secondBatch })
                    } as any;
                }
                return { ok: false } as any;
            });

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.testCases).toHaveLength(1500);
        });

        it('should return empty array if no build test runs found', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=build&pipelineId=456&date=2025-12-17');
            
            global.fetch = vi.fn(async () => ({
                ok: true,
                json: async () => ({ value: [] })
            } as any));

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.testCases).toEqual([]);
        });
    });

    describe('Error handling', () => {
        it('should return 500 if fetch fails for test runs', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123&date=2025-12-17');
            
            global.fetch = vi.fn(async () => ({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error'
            } as any));

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Failed to fetch test runs');
        });

        it('should return 500 if environment variables are missing', async () => {
            vi.unstubAllEnvs();
            
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123&date=2025-12-17');
            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBeDefined();
        });

        it('should handle network errors gracefully', async () => {
            const url = new URL('http://localhost/api/test-cases?pipelineType=release&pipelineId=123&date=2025-12-17');
            
            global.fetch = vi.fn(async () => {
                throw new Error('Network error');
            });

            const response = await GET({ url } as any);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Error fetching test cases');
        });
    });
});
