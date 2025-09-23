import { describe, it, expect } from 'vitest'
import { getReleasePipelineStatus } from '$lib/utils/getReleasePipelineStatus';


//If the release is null or undefined, throw an error
describe('getReleasePipelineStatus', () => {
  it('should throw an error for null release', async () => {
    await expect(getReleasePipelineStatus(null as any)).rejects.toThrow('Provided release is null or undefined');
  });
});

// If there are no environments, throw an error
describe('getReleasePipelineStatus', () => {
  it('should throw an error for a release with no environments', async () => {
    const release = {
      id: 1,
      description: 'Test release',
      name: 'Release 1',
      status: 'unknown',
      createdOn: '2023-01-01T00:00:00Z',
      modifiedOn: '2023-01-01T00:00:00Z',
      envs: []
    };
    await expect(getReleasePipelineStatus(release)).rejects.toThrow('Release has no environments');
  });
});

// If any of the envs are "inProgress" then return "inProgress"
describe('getReleasePipelineStatus - inProgress', () => {
  it('should return "inProgress" if any environment is in progress', async () => {
    const release = {
      id: 2,
      description: 'Test release with inProgress env',
      name: 'Release 2',
      status: 'unknown',
      createdOn: '2023-01-02T00:00:00Z',
      modifiedOn: '2023-01-02T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'inProgress' }
      ]
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('inProgress');
  });
});

// If any of the envs are "canceled" or "aborted" then return "interrupted"
describe('getReleasePipelineStatus - interrupted', () => {
  it('should return "interrupted" if any environment is canceled or aborted', async () => {
    const release = {
      id: 3,
      description: 'Test release with canceled env',
      name: 'Release 3',
      status: 'unknown',
      createdOn: '2023-01-03T00:00:00Z',
      modifiedOn: '2023-01-03T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'canceled' }
      ]
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('interrupted');
  });
});

// If any of the envs are "failed" then return "failed"
describe('getReleasePipelineStatus - failed', () => {
  it('should return "failed" if any environment has failed', async () => {
    const release = {
      id: 4,
      description: 'Test release with failed env',
      name: 'Release 4',
      status: 'unknown',
      createdOn: '2023-01-04T00:00:00Z',
      modifiedOn: '2023-01-04T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'failed' }
      ]
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('failed');
  });
});

// If none of the above, return "unknown"
describe('getReleasePipelineStatus - unknown', () => {
  it('should return "unknown" if no environments are in progress, interrupted, or failed', async () => {
    const release = {
      id: 5,
      description: 'Test release with all succeeded envs',
      name: 'Release 5',
      status: 'unknown',
      createdOn: '2023-01-05T00:00:00Z',
      modifiedOn: '2023-01-05T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'succeeded' }
      ]
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('unknown');
  });
});

// If passedTestCount or failedTestCount is undefined, return "unknown"
describe('getReleasePipelineStatus - unknown due to undefined test counts', () => {
  it('should return "unknown" if passedTestCount or failedTestCount is undefined', async () => {
    const release = {
      id: 6,
      description: 'Test release with undefined test counts',
      name: 'Release 6',
      status: 'unknown',
      createdOn: '2023-01-06T00:00:00Z',
      modifiedOn: '2023-01-06T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'succeeded' }
      ],
      passedTestCount: undefined,
      failedTestCount: undefined
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('unknown');
  });
});

// If pass ratio is 100%, return "good"
describe('getReleasePipelineStatus - good', () => {
  it('should return "good" if pass ratio is 100%', async () => {
    const release = {
      id: 7,
      description: 'Test release with 100% pass ratio',
      name: 'Release 7',
      status: 'unknown',
      createdOn: '2023-01-07T00:00:00Z',
      modifiedOn: '2023-01-07T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'succeeded' }
      ],
      passedTestCount: 10,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('good');
  });
});

// If pass ratio is between 70% and 99%, return "ok"
describe('getReleasePipelineStatus - ok', () => {
  it('should return "ok" if pass ratio is between 70% and 99%', async () => {
    const release = {
      id: 8,
      description: 'Test release with 70% pass ratio',
      name: 'Release 8',
      status: 'unknown',
      createdOn: '2023-01-08T00:00:00Z',
      modifiedOn: '2023-01-08T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'succeeded' }
      ],
      passedTestCount: 7,
      failedTestCount: 3
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('ok');
  });
});

// If pass ratio is below 70%, return "bad"
describe('getReleasePipelineStatus - bad', () => {
  it('should return "bad" if pass ratio is below 70%', async () => {
    const release = {
      id: 9,
      description: 'Test release with 60% pass ratio',
      name: 'Release 9',
      status: 'unknown',
      createdOn: '2023-01-09T00:00:00Z',
      modifiedOn: '2023-01-09T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'succeeded' }
      ],
      passedTestCount: 6,
      failedTestCount: 4
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('bad');
  });
});

// Additional comprehensive test cases
describe('getReleasePipelineStatus - Additional Edge Cases', () => {
  it('should handle undefined release parameter', async () => {
    await expect(getReleasePipelineStatus(undefined as any)).rejects.toThrow('Provided release is null or undefined');
  });

  it('should handle release with undefined envs', async () => {
    const release = {
      id: 10,
      description: 'Test release',
      name: 'Release 10',
      status: 'unknown',
      createdOn: '2023-01-10T00:00:00Z',
      modifiedOn: '2023-01-10T00:00:00Z',
      envs: undefined as any
    };
    await expect(getReleasePipelineStatus(release)).rejects.toThrow('Release has no environments');
  });

  it('should handle release with null envs', async () => {
    const release = {
      id: 11,
      description: 'Test release',
      name: 'Release 11',
      status: 'unknown',
      createdOn: '2023-01-11T00:00:00Z',
      modifiedOn: '2023-01-11T00:00:00Z',
      envs: null as any
    };
    await expect(getReleasePipelineStatus(release)).rejects.toThrow('Release has no environments');
  });

  it('should return "interrupted" for aborted environment', async () => {
    const release = {
      id: 12,
      description: 'Test release with aborted env',
      name: 'Release 12',
      status: 'unknown',
      createdOn: '2023-01-12T00:00:00Z',
      modifiedOn: '2023-01-12T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'aborted' }
      ]
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('interrupted');
  });

  it('should handle single environment release', async () => {
    const release = {
      id: 13,
      description: 'Single env release',
      name: 'Release 13',
      status: 'unknown',
      createdOn: '2023-01-13T00:00:00Z',
      modifiedOn: '2023-01-13T00:00:00Z',
      envs: [
        { id: 1, name: 'Production', status: 'succeeded' }
      ],
      passedTestCount: 100,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('good');
  });

  it('should handle multiple environments with mixed statuses (inProgress priority)', async () => {
    const release = {
      id: 14,
      description: 'Mixed status release',
      name: 'Release 14',
      status: 'unknown',
      createdOn: '2023-01-14T00:00:00Z',
      modifiedOn: '2023-01-14T00:00:00Z',
      envs: [
        { id: 1, name: 'Dev', status: 'succeeded' },
        { id: 2, name: 'Test', status: 'failed' },
        { id: 3, name: 'Prod', status: 'inProgress' }
      ]
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('inProgress');
  });

  it('should handle multiple environments with mixed statuses (interrupted priority)', async () => {
    const release = {
      id: 15,
      description: 'Mixed status release',
      name: 'Release 15',
      status: 'unknown',
      createdOn: '2023-01-15T00:00:00Z',
      modifiedOn: '2023-01-15T00:00:00Z',
      envs: [
        { id: 1, name: 'Dev', status: 'succeeded' },
        { id: 2, name: 'Test', status: 'failed' },
        { id: 3, name: 'Prod', status: 'canceled' }
      ]
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('interrupted');
  });

  it('should handle null test counts', async () => {
    const release = {
      id: 16,
      description: 'Test release with null test counts',
      name: 'Release 16',
      status: 'unknown',
      createdOn: '2023-01-16T00:00:00Z',
      modifiedOn: '2023-01-16T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: undefined,
      failedTestCount: undefined
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('unknown');
  });

  it('should handle zero total tests', async () => {
    const release = {
      id: 17,
      description: 'Test release with no tests',
      name: 'Release 17',
      status: 'unknown',
      createdOn: '2023-01-17T00:00:00Z',
      modifiedOn: '2023-01-17T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: 0,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('unknown');
  });

  it('should handle exact 70% pass rate threshold (should return "ok")', async () => {
    const release = {
      id: 18,
      description: 'Exact 70% threshold',
      name: 'Release 18',
      status: 'unknown',
      createdOn: '2023-01-18T00:00:00Z',
      modifiedOn: '2023-01-18T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: 70,
      failedTestCount: 30
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('ok');
  });

  it('should handle 69% pass rate (should return "bad")', async () => {
    const release = {
      id: 19,
      description: 'Just below threshold',
      name: 'Release 19',
      status: 'unknown',
      createdOn: '2023-01-19T00:00:00Z',
      modifiedOn: '2023-01-19T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: 69,
      failedTestCount: 31
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('bad');
  });

  it('should handle 99% pass rate (should return "ok")', async () => {
    const release = {
      id: 20,
      description: 'Almost perfect',
      name: 'Release 20',
      status: 'unknown',
      createdOn: '2023-01-20T00:00:00Z',
      modifiedOn: '2023-01-20T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: 99,
      failedTestCount: 1
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('ok');
  });

  it('should handle single passing test (100% pass rate)', async () => {
    const release = {
      id: 21,
      description: 'Single test passing',
      name: 'Release 21',
      status: 'unknown',
      createdOn: '2023-01-21T00:00:00Z',
      modifiedOn: '2023-01-21T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: 1,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('good');
  });

  it('should handle single failing test (0% pass rate)', async () => {
    const release = {
      id: 22,
      description: 'Single test failing',
      name: 'Release 22',
      status: 'unknown',
      createdOn: '2023-01-22T00:00:00Z',
      modifiedOn: '2023-01-22T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: 0,
      failedTestCount: 1
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('bad');
  });

  it('should prioritize environment status over test results', async () => {
    const release = {
      id: 23,
      description: 'Failed env with good tests',
      name: 'Release 23',
      status: 'unknown',
      createdOn: '2023-01-23T00:00:00Z',
      modifiedOn: '2023-01-23T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'failed' }
      ],
      passedTestCount: 100,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('failed');
  });

  it('should handle large numbers of environments', async () => {
    const envs = [];
    for (let i = 1; i <= 10; i++) {
      envs.push({ id: i, name: `Env ${i}`, status: 'succeeded' });
    }
    
    const release = {
      id: 24,
      description: 'Many environments',
      name: 'Release 24',
      status: 'unknown',
      createdOn: '2023-01-24T00:00:00Z',
      modifiedOn: '2023-01-24T00:00:00Z',
      envs: envs,
      passedTestCount: 1000,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('good');
  });

  it('should handle large test counts', async () => {
    const release = {
      id: 25,
      description: 'Large test suite',
      name: 'Release 25',
      status: 'unknown',
      createdOn: '2023-01-25T00:00:00Z',
      modifiedOn: '2023-01-25T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: 50000,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('good');
  });

  it('should handle floating point precision edge cases', async () => {
    // 2 out of 3 = 66.666...% (should be "bad")
    const release = {
      id: 26,
      description: 'Floating point precision',
      name: 'Release 26',
      status: 'unknown',
      createdOn: '2023-01-26T00:00:00Z',
      modifiedOn: '2023-01-26T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' }
      ],
      passedTestCount: 2,
      failedTestCount: 1
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('bad');
  });
});

describe('getReleasePipelineStatus - Environment Status Priority Tests', () => {
  it('should test priority: inProgress > interrupted > failed > test-based determination', async () => {
    // Priority 1: inProgress
    const inProgressRelease = {
      id: 27,
      description: 'inProgress priority test',
      name: 'Release 27',
      status: 'unknown',
      createdOn: '2023-01-27T00:00:00Z',
      modifiedOn: '2023-01-27T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'failed' },
        { id: 2, name: 'Env 2', status: 'inProgress' }
      ]
    };
    expect(await getReleasePipelineStatus(inProgressRelease)).toBe('inProgress');
    
    // Priority 2: interrupted (canceled)
    const interruptedRelease = {
      id: 28,
      description: 'interrupted priority test',
      name: 'Release 28',
      status: 'unknown',
      createdOn: '2023-01-28T00:00:00Z',
      modifiedOn: '2023-01-28T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'failed' },
        { id: 2, name: 'Env 2', status: 'canceled' }
      ]
    };
    expect(await getReleasePipelineStatus(interruptedRelease)).toBe('interrupted');
    
    // Priority 3: failed
    const failedRelease = {
      id: 29,
      description: 'failed priority test',
      name: 'Release 29',
      status: 'unknown',
      createdOn: '2023-01-29T00:00:00Z',
      modifiedOn: '2023-01-29T00:00:00Z',
      envs: [
        { id: 1, name: 'Env 1', status: 'succeeded' },
        { id: 2, name: 'Env 2', status: 'failed' }
      ]
    };
    expect(await getReleasePipelineStatus(failedRelease)).toBe('failed');
  });

  it('should handle all environment statuses in one release (inProgress wins)', async () => {
    const release = {
      id: 30,
      description: 'All statuses present',
      name: 'Release 30',
      status: 'unknown',
      createdOn: '2023-01-30T00:00:00Z',
      modifiedOn: '2023-01-30T00:00:00Z',
      envs: [
        { id: 1, name: 'Dev', status: 'succeeded' },
        { id: 2, name: 'Test', status: 'failed' },
        { id: 3, name: 'Staging', status: 'canceled' },
        { id: 4, name: 'Prod', status: 'inProgress' }
      ],
      passedTestCount: 100,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('inProgress');
  });
});

describe('getReleasePipelineStatus - Real-world Scenarios', () => {
  it('should handle typical multi-stage deployment pipeline', async () => {
    const release = {
      id: 31,
      description: 'Production deployment',
      name: 'v2.1.0',
      status: 'active',
      createdOn: '2023-01-31T00:00:00Z',
      modifiedOn: '2023-01-31T00:00:00Z',
      envs: [
        { id: 1, name: 'Development', status: 'succeeded' },
        { id: 2, name: 'Testing', status: 'succeeded' },
        { id: 3, name: 'Staging', status: 'succeeded' },
        { id: 4, name: 'Production', status: 'succeeded' }
      ],
      passedTestCount: 2847,
      failedTestCount: 12 // ~99.6% pass rate
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('ok');
  });

  it('should handle hotfix deployment', async () => {
    const release = {
      id: 32,
      description: 'Critical hotfix',
      name: 'hotfix-v2.1.1',
      status: 'active',
      createdOn: '2023-02-01T00:00:00Z',
      modifiedOn: '2023-02-01T00:00:00Z',
      envs: [
        { id: 1, name: 'Production', status: 'succeeded' }
      ],
      passedTestCount: 156,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('good');
  });

  it('should handle failed deployment rollback scenario', async () => {
    const release = {
      id: 33,
      description: 'Failed deployment requiring rollback',
      name: 'v2.2.0-failed',
      status: 'abandoned',
      createdOn: '2023-02-02T00:00:00Z',
      modifiedOn: '2023-02-02T00:00:00Z',
      envs: [
        { id: 1, name: 'Development', status: 'succeeded' },
        { id: 2, name: 'Testing', status: 'succeeded' },
        { id: 3, name: 'Production', status: 'failed' }
      ],
      passedTestCount: 2500,
      failedTestCount: 0
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('failed');
  });

  it('should handle deployment in progress', async () => {
    const release = {
      id: 34,
      description: 'Currently deploying',
      name: 'v2.3.0-deploying',
      status: 'active',
      createdOn: '2023-02-03T00:00:00Z',
      modifiedOn: '2023-02-03T00:00:00Z',
      envs: [
        { id: 1, name: 'Development', status: 'succeeded' },
        { id: 2, name: 'Testing', status: 'succeeded' },
        { id: 3, name: 'Production', status: 'inProgress' }
      ]
      // No test counts yet as deployment is in progress
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('inProgress');
  });

  it('should handle canceled deployment', async () => {
    const release = {
      id: 35,
      description: 'Manually canceled deployment',
      name: 'v2.4.0-canceled',
      status: 'abandoned',
      createdOn: '2023-02-04T00:00:00Z',
      modifiedOn: '2023-02-04T00:00:00Z',
      envs: [
        { id: 1, name: 'Development', status: 'succeeded' },
        { id: 2, name: 'Testing', status: 'canceled' }
      ]
    };
    const status = await getReleasePipelineStatus(release);
    expect(status).toBe('interrupted');
  });
});