import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as  envUtils  from '$lib/utils';

// When provided a bad date, it should throw an error
describe('Construct Release API', () => {
  it('should return 400 for invalid date format', async () => {
    const response = await fetch('http://localhost:5173/newApi/constructRelease?date=invalid-date&releaseDefinitionId=123');
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid or missing date (YYYY-MM-DD required)');
    });
  });

// When provided a bad release id, it should throw an error
describe('Construct Release API', () => {
  it('should return 400 for missing releaseDefinitionId', async () => {
    const response = await fetch('http://localhost:5173/newApi/constructRelease?date=2023-01-01');
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Missing or invalid releaseDefinitionId (numeric string required)');
  });
});    

// The API should not return 500, env vars should be set in the test environment
describe('Construct Release API', () => {
  it('should not return 500 due to missing env vars', async () => {
    const response = await fetch('http://localhost:5173/newApi/constructRelease?date=2023-01-01&releaseDefinitionId=123');
    expect(response.status).not.toBe(500);
  });
});