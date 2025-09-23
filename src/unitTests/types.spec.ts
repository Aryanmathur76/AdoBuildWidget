import { describe, it, expect } from 'vitest'
import type { Build } from '$lib/types/build';
import type { Release } from '$lib/types/release';

describe('Build Type Validation', () => {
  it('should create a valid build object with required properties', () => {
    const build: Build = {
      id: 1,
      name: 'Test Build',
      status: 'completed',
      result: 'succeeded',
      startTime: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z'
    };

    expect(build.id).toBe(1);
    expect(build.name).toBe('Test Build');
    expect(build.status).toBe('completed');
    expect(build.result).toBe('succeeded');
    expect(build.startTime).toBe('2025-09-22T10:00:00Z');
    expect(build.modifiedOn).toBe('2025-09-22T10:30:00Z');
  });

  it('should create a valid build object with optional properties', () => {
    const build: Build = {
      id: 2,
      name: 'Test Build with Tests',
      status: 'completed',
      result: 'succeeded',
      startTime: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      testRunName: 'Integration Tests',
      passedTestCount: 85,
      failedTestCount: 5,
      link: 'https://dev.azure.com/test/build/2'
    };

    expect(build.testRunName).toBe('Integration Tests');
    expect(build.passedTestCount).toBe(85);
    expect(build.failedTestCount).toBe(5);
    expect(build.link).toBe('https://dev.azure.com/test/build/2');
  });

  it('should handle undefined optional properties', () => {
    const build: Build = {
      id: 3,
      name: 'Test Build No Tests',
      status: 'completed',
      result: 'succeeded',
      startTime: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      testRunName: undefined,
      passedTestCount: undefined,
      failedTestCount: undefined,
      link: undefined
    };

    expect(build.testRunName).toBeUndefined();
    expect(build.passedTestCount).toBeUndefined();
    expect(build.failedTestCount).toBeUndefined();
    expect(build.link).toBeUndefined();
  });
});

describe('Release Type Validation', () => {
  it('should create a valid release object with required properties', () => {
    const release: Release = {
      id: 1,
      name: 'Test Release',
      status: 'active',
      createdOn: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      envs: []
    };

    expect(release.id).toBe(1);
    expect(release.name).toBe('Test Release');
    expect(release.status).toBe('active');
    expect(release.createdOn).toBe('2025-09-22T10:00:00Z');
    expect(release.modifiedOn).toBe('2025-09-22T10:30:00Z');
    expect(release.envs).toEqual([]);
  });

  it('should create a valid release object with environments', () => {
    const release: Release = {
      id: 2,
      name: 'Test Release with Envs',
      status: 'active',
      createdOn: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      envs: [
        { id: 1, name: 'Development', status: 'succeeded' },
        { id: 2, name: 'Production', status: 'inProgress' }
      ]
    };

    expect(release.envs).toHaveLength(2);
    expect(release.envs[0].name).toBe('Development');
    expect(release.envs[1].status).toBe('inProgress');
  });

  it('should create a valid release object with optional test properties', () => {
    const release: Release = {
      id: 3,
      name: 'Test Release with Tests',
      status: 'active',
      createdOn: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      envs: [{ id: 1, name: 'Prod', status: 'succeeded' }],
      passedTestCount: 42,
      failedTestCount: 3,
      link: 'https://vsrm.dev.azure.com/test/release/3'
    };

    expect(release.passedTestCount).toBe(42);
    expect(release.failedTestCount).toBe(3);
    expect(release.link).toBe('https://vsrm.dev.azure.com/test/release/3');
  });

  it('should handle complex environment structures', () => {
    const release: Release = {
      id: 4,
      name: 'Complex Release',
      status: 'active',
      createdOn: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      envs: [
        { 
          id: 1, 
          name: 'Development', 
          status: 'succeeded',
          deploymentId: 123,
          approvals: ['user1', 'user2']
        },
        { 
          id: 2, 
          name: 'Production', 
          status: 'inProgress',
          deploymentId: 124,
          variables: { debug: true }
        }
      ]
    };

    expect(release.envs[0].deploymentId).toBe(123);
    expect(release.envs[0].approvals).toEqual(['user1', 'user2']);
    expect(release.envs[1].variables).toEqual({ debug: true });
  });
});

// Additional comprehensive type validation tests
describe('Build Type - Edge Cases and Validation', () => {
  it('should handle all possible build statuses', () => {
    const statusTests = [
      'inProgress',
      'completed',
      'cancelling',
      'postponed',
      'notStarted'
    ];

    statusTests.forEach(status => {
      const build: Build = {
        id: 100,
        name: `Build with ${status}`,
        status: status as any,
        result: 'succeeded',
        startTime: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z'
      };
      expect(build.status).toBe(status);
    });
  });

  it('should handle all possible build results', () => {
    const resultTests = [
      'succeeded',
      'failed',
      'canceled',
      'partiallySucceeded',
      'none'
    ];

    resultTests.forEach(result => {
      const build: Build = {
        id: 101,
        name: `Build with ${result}`,
        status: 'completed',
        result: result as any,
        startTime: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z'
      };
      expect(build.result).toBe(result);
    });
  });

  it('should handle extreme numeric values for test counts', () => {
    const build: Build = {
      id: 102,
      name: 'Large Test Suite',
      status: 'completed',
      result: 'succeeded',
      startTime: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      passedTestCount: 999999,
      failedTestCount: 0
    };

    expect(build.passedTestCount).toBe(999999);
    expect(build.failedTestCount).toBe(0);
  });

  it('should handle zero test counts', () => {
    const build: Build = {
      id: 103,
      name: 'No Tests Build',
      status: 'completed',
      result: 'succeeded',
      startTime: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      passedTestCount: 0,
      failedTestCount: 0
    };

    expect(build.passedTestCount).toBe(0);
    expect(build.failedTestCount).toBe(0);
  });

  it('should handle various date formats in timestamps', () => {
    const dateFormats = [
      '2025-09-22T10:00:00Z',
      '2025-09-22T10:00:00.000Z',
      '2025-09-22T10:00:00+00:00',
      '2025-12-31T23:59:59.999Z'
    ];

    dateFormats.forEach((date, index) => {
      const build: Build = {
        id: 104 + index,
        name: `Build ${index}`,
        status: 'completed',
        result: 'succeeded',
        startTime: date,
        modifiedOn: date
      };
      expect(build.startTime).toBe(date);
      expect(build.modifiedOn).toBe(date);
    });
  });

  it('should handle long build names and test run names', () => {
    const longName = 'Very Long Build Name '.repeat(10);
    const longTestRunName = 'Very Long Test Run Name '.repeat(5);

    const build: Build = {
      id: 105,
      name: longName,
      status: 'completed',
      result: 'succeeded',
      startTime: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      testRunName: longTestRunName
    };

    expect(build.name).toBe(longName);
    expect(build.testRunName).toBe(longTestRunName);
  });

  it('should handle various URL formats for links', () => {
    const urlFormats = [
      'https://dev.azure.com/org/project/_build/results?buildId=123',
      'https://organization.visualstudio.com/project/_build/results?buildId=456',
      'https://dev.azure.com/org/project/_build/results?buildId=789&view=logs',
      'https://dev.azure.com/org/_build/results?buildId=999'
    ];

    urlFormats.forEach((url, index) => {
      const build: Build = {
        id: 106 + index,
        name: `Build with URL ${index}`,
        status: 'completed',
        result: 'succeeded',
        startTime: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z',
        link: url
      };
      expect(build.link).toBe(url);
    });
  });

  it('should handle special characters in build names', () => {
    const specialNames = [
      'Build with spaces',
      'Build-with-dashes',
      'Build_with_underscores',
      'Build.with.dots',
      'Build (with parentheses)',
      'Build [with brackets]',
      'Build {with braces}',
      'Build/with/slashes',
      'Build\\with\\backslashes'
    ];

    specialNames.forEach((name, index) => {
      const build: Build = {
        id: 110 + index,
        name: name,
        status: 'completed',
        result: 'succeeded',
        startTime: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z'
      };
      expect(build.name).toBe(name);
    });
  });

  it('should handle builds with partial test data', () => {
    const partialTestCases = [
      { passedTestCount: 10, failedTestCount: undefined },
      { passedTestCount: undefined, failedTestCount: 5 },
      { passedTestCount: 0, failedTestCount: undefined },
      { passedTestCount: undefined, failedTestCount: 0 }
    ];

    partialTestCases.forEach((testData, index) => {
      const build: Build = {
        id: 120 + index,
        name: `Partial Test Build ${index}`,
        status: 'completed',
        result: 'succeeded',
        startTime: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z',
        ...testData
      };
      expect(build.passedTestCount).toBe(testData.passedTestCount);
      expect(build.failedTestCount).toBe(testData.failedTestCount);
    });
  });
});

describe('Release Type - Edge Cases and Validation', () => {
  it('should handle all possible release statuses', () => {
    const statusTests = [
      'active',
      'draft',
      'abandoned'
    ];

    statusTests.forEach(status => {
      const release: Release = {
        id: 200,
        name: `Release with ${status}`,
        status: status as any,
        createdOn: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z',
        envs: []
      };
      expect(release.status).toBe(status);
    });
  });

  it('should handle all possible environment statuses', () => {
    const envStatuses = [
      'succeeded',
      'failed',
      'inProgress',
      'canceled',
      'aborted',
      'notDeployed',
      'queued'
    ];

    envStatuses.forEach((status, index) => {
      const release: Release = {
        id: 201 + index,
        name: `Release with ${status} env`,
        status: 'active',
        createdOn: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z',
        envs: [
          { id: index, name: `Environment ${index}`, status: status as any }
        ]
      };
      expect(release.envs[0].status).toBe(status);
    });
  });

  it('should handle large numbers of environments', () => {
    const envs = [];
    for (let i = 1; i <= 20; i++) {
      envs.push({
        id: i,
        name: `Environment ${i}`,
        status: i % 2 === 0 ? 'succeeded' : 'inProgress'
      });
    }

    const release: Release = {
      id: 220,
      name: 'Release with Many Environments',
      status: 'active',
      createdOn: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      envs: envs as any[]
    };

    expect(release.envs).toHaveLength(20);
    expect(release.envs[0].name).toBe('Environment 1');
    expect(release.envs[19].name).toBe('Environment 20');
  });

  it('should handle environments with complex names', () => {
    const complexEnvNames = [
      'Development Environment',
      'Test-Environment_01',
      'Production (Primary)',
      'Staging [Blue/Green]',
      'QA Environment #2',
      'Pre-Prod.v2',
      'DR/Backup Environment'
    ];

    const envs = complexEnvNames.map((name, index) => ({
      id: index + 1,
      name: name,
      status: 'succeeded'
    }));

    const release: Release = {
      id: 221,
      name: 'Release with Complex Env Names',
      status: 'active',
      createdOn: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      envs: envs as any[]
    };

    complexEnvNames.forEach((name, index) => {
      expect(release.envs[index].name).toBe(name);
    });
  });

  it('should handle extreme test count values', () => {
    const testCases = [
      { passedTestCount: 0, failedTestCount: 0 },
      { passedTestCount: 1, failedTestCount: 0 },
      { passedTestCount: 0, failedTestCount: 1 },
      { passedTestCount: 100000, failedTestCount: 50000 },
      { passedTestCount: 999999, failedTestCount: 1 }
    ];

    testCases.forEach((testData, index) => {
      const release: Release = {
        id: 222 + index,
        name: `Release with Test Counts ${index}`,
        status: 'active',
        createdOn: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z',
        envs: [{ id: 1, name: 'Test', status: 'succeeded' }],
        ...testData
      };
      expect(release.passedTestCount).toBe(testData.passedTestCount);
      expect(release.failedTestCount).toBe(testData.failedTestCount);
    });
  });

  it('should handle various URL formats for release links', () => {
    const urlFormats = [
      'https://vsrm.dev.azure.com/org/project/_release?releaseId=123',
      'https://org.visualstudio.com/project/_release?releaseId=456',
      'https://dev.azure.com/org/project/_releaseProgress?releaseId=789',
      'https://vsrm.dev.azure.com/org/_release?releaseId=999&_a=release-summary'
    ];

    urlFormats.forEach((url, index) => {
      const release: Release = {
        id: 230 + index,
        name: `Release with URL ${index}`,
        status: 'active',
        createdOn: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z',
        envs: [{ id: 1, name: 'Test', status: 'succeeded' }],
        link: url
      };
      expect(release.link).toBe(url);
    });
  });

  it('should handle optional properties in various combinations', () => {
    const combinations = [
      { passedTestCount: 50, failedTestCount: 5 },
      { link: 'https://example.com/release' },
      { passedTestCount: 100, failedTestCount: 0, link: 'https://example.com' },
      {} // No optional properties
    ];

    combinations.forEach((props, index) => {
      const release: Release = {
        id: 240 + index,
        name: `Release Combination ${index}`,
        status: 'active',
        createdOn: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z',
        envs: [{ id: 1, name: 'Test', status: 'succeeded' }],
        ...props
      };
      
      if ('passedTestCount' in props) {
        expect(release.passedTestCount).toBe(props.passedTestCount);
      }
      if ('failedTestCount' in props) {
        expect(release.failedTestCount).toBe(props.failedTestCount);
      }
      if ('link' in props) {
        expect(release.link).toBe(props.link);
      }
    });
  });
});

describe('Type Safety and Integration Tests', () => {
  it('should ensure Build and Release types work together in arrays', () => {
    const builds: Build[] = [
      {
        id: 1,
        name: 'Build 1',
        status: 'completed',
        result: 'succeeded',
        startTime: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z'
      },
      {
        id: 2,
        name: 'Build 2',
        status: 'inProgress',
        result: 'none',
        startTime: '2025-09-22T11:00:00Z',
        modifiedOn: '2025-09-22T11:30:00Z'
      }
    ];

    const releases: Release[] = [
      {
        id: 1,
        name: 'Release 1',
        status: 'active',
        createdOn: '2025-09-22T10:00:00Z',
        modifiedOn: '2025-09-22T10:30:00Z',
        envs: [{ id: 1, name: 'Prod', status: 'succeeded' }]
      }
    ];

    expect(builds).toHaveLength(2);
    expect(releases).toHaveLength(1);
    expect(builds[0].id).toBe(1);
    expect(releases[0].envs[0].name).toBe('Prod');
  });

  it('should handle deeply nested environment data structures', () => {
    const release: Release = {
      id: 300,
      name: 'Complex Nested Release',
      status: 'active',
      createdOn: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      envs: [
        {
          id: 1,
          name: 'Production',
          status: 'succeeded',
          metadata: {
            region: 'us-east-1',
            tier: 'production',
            services: ['api', 'web', 'worker'],
            config: {
              replicas: 3,
              resources: {
                cpu: '2',
                memory: '4Gi'
              }
            }
          }
        }
      ]
    };

    expect(release.envs[0].metadata).toBeDefined();
    expect(release.envs[0].metadata.services).toEqual(['api', 'web', 'worker']);
    expect(release.envs[0].metadata.config.replicas).toBe(3);
  });

  it('should validate type consistency for numeric IDs', () => {
    const build: Build = {
      id: 12345,
      name: 'Numeric ID Test',
      status: 'completed',
      result: 'succeeded',
      startTime: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z'
    };

    const release: Release = {
      id: 67890,
      name: 'Numeric ID Test Release',
      status: 'active',
      createdOn: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      envs: [
        { id: 111, name: 'Env 1', status: 'succeeded' },
        { id: 222, name: 'Env 2', status: 'failed' }
      ]
    };

    expect(typeof build.id).toBe('number');
    expect(typeof release.id).toBe('number');
    expect(typeof release.envs[0].id).toBe('number');
    expect(typeof release.envs[1].id).toBe('number');
  });

  it('should handle mixed data types in optional properties', () => {
    const build: Build = {
      id: 400,
      name: 'Mixed Types Build',
      status: 'completed',
      result: 'succeeded',
      startTime: '2025-09-22T10:00:00Z',
      modifiedOn: '2025-09-22T10:30:00Z',
      passedTestCount: 0, // number
      failedTestCount: undefined, // undefined
      testRunName: '', // empty string
      link: 'https://example.com' // valid URL
    };

    expect(typeof build.passedTestCount).toBe('number');
    expect(build.failedTestCount).toBeUndefined();
    expect(typeof build.testRunName).toBe('string');
    expect(build.testRunName).toBe('');
    expect(typeof build.link).toBe('string');
  });
});