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