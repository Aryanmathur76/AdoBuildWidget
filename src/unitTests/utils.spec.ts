import { describe, it, expect, vi } from 'vitest'
import { getAzureDevOpsEnvVars, getPipelineConfig } from '$lib/utils';

describe('getAzureDevOpsEnvVars', () => {
  it('should return valid environment variables when all are provided', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'test-org',
      AZURE_DEVOPS_PROJECT: 'test-project',
      AZURE_DEVOPS_PAT: 'test-pat'
    };

    const result = getAzureDevOpsEnvVars(env);

    expect(result).toEqual({
      AZURE_DEVOPS_ORGANIZATION: 'test-org',
      AZURE_DEVOPS_PROJECT: 'test-project',
      AZURE_DEVOPS_PAT: 'test-pat'
    });
  });

  it('should throw error when AZURE_DEVOPS_ORGANIZATION is missing', () => {
    const env = {
      AZURE_DEVOPS_PROJECT: 'test-project',
      AZURE_DEVOPS_PAT: 'test-pat'
    };

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });

  it('should throw error when AZURE_DEVOPS_PROJECT is missing', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'test-org',
      AZURE_DEVOPS_PAT: 'test-pat'
    };

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });

  it('should throw error when AZURE_DEVOPS_PAT is missing', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'test-org',
      AZURE_DEVOPS_PROJECT: 'test-project'
    };

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });

  it('should throw error when all environment variables are missing', () => {
    const env = {};

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });

  it('should throw error when environment variables are empty strings', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: '',
      AZURE_DEVOPS_PROJECT: '',
      AZURE_DEVOPS_PAT: ''
    };

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });
});

describe('getPipelineConfig', () => {
  it('should parse valid pipeline configuration', () => {
    const configRaw = JSON.stringify({
      pipelines: [
        { id: '1', type: 'build', displayName: 'Build Pipeline' },
        { id: '2', type: 'release', displayName: 'Release Pipeline' }
      ]
    });

    const result = getPipelineConfig(configRaw);

    expect(result).toEqual({
      pipelines: [
        { id: '1', type: 'build', displayName: 'Build Pipeline' },
        { id: '2', type: 'release', displayName: 'Release Pipeline' }
      ]
    });
  });

  it('should throw error when config is missing', () => {
    expect(() => getPipelineConfig('')).toThrow('Missing pipeline config');
  });

  it('should throw error when config is null', () => {
    expect(() => getPipelineConfig(null as any)).toThrow('Missing pipeline config');
  });

  it('should throw error when config is invalid JSON', () => {
    const invalidJson = '{ "pipelines": [';
    
    expect(() => getPipelineConfig(invalidJson)).toThrow('Failed to parse pipeline config');
  });

  it('should throw error when pipelines property is missing', () => {
    const configRaw = JSON.stringify({
      otherProperty: 'value'
    });

    expect(() => getPipelineConfig(configRaw)).toThrow('No pipelines configured');
  });

  it('should throw error when pipelines is not an array', () => {
    const configRaw = JSON.stringify({
      pipelines: 'not-an-array'
    });

    expect(() => getPipelineConfig(configRaw)).toThrow('No pipelines configured');
  });

  it('should handle empty pipelines array', () => {
    const configRaw = JSON.stringify({
      pipelines: []
    });

    const result = getPipelineConfig(configRaw);
    expect(result.pipelines).toEqual([]);
  });

  it('should preserve additional properties in config', () => {
    const configRaw = JSON.stringify({
      pipelines: [{ id: '1', type: 'build' }],
      additionalProperty: 'value',
      settings: { debug: true }
    });

    const result = getPipelineConfig(configRaw);
    expect(result.additionalProperty).toBe('value');
    expect(result.settings).toEqual({ debug: true });
  });
});

// Additional comprehensive utility function tests
describe('getAzureDevOpsEnvVars - Extended Edge Cases', () => {
  it('should handle undefined environment variables', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: undefined,
      AZURE_DEVOPS_PROJECT: undefined,
      AZURE_DEVOPS_PAT: undefined
    };

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });

  it('should handle null environment variables', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: null,
      AZURE_DEVOPS_PROJECT: null,
      AZURE_DEVOPS_PAT: null
    };

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });

  it('should handle whitespace-only environment variables', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: '   ',
      AZURE_DEVOPS_PROJECT: '\t\n',
      AZURE_DEVOPS_PAT: '  \r\n  '
    };

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });

  it('should trim whitespace from valid environment variables', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: '  test-org  ',
      AZURE_DEVOPS_PROJECT: '\ttest-project\n',
      AZURE_DEVOPS_PAT: '  test-pat  '
    };

    const result = getAzureDevOpsEnvVars(env);

    expect(result).toEqual({
      AZURE_DEVOPS_ORGANIZATION: 'test-org',
      AZURE_DEVOPS_PROJECT: 'test-project',
      AZURE_DEVOPS_PAT: 'test-pat'
    });
  });

  it('should handle mixed valid and invalid environment variables', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'valid-org',
      AZURE_DEVOPS_PROJECT: '',
      AZURE_DEVOPS_PAT: 'valid-pat'
    };

    expect(() => getAzureDevOpsEnvVars(env)).toThrow('Missing Azure DevOps environment variables');
  });

  it('should handle special characters in environment variables', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'test-org-123',
      AZURE_DEVOPS_PROJECT: 'test_project.name',
      AZURE_DEVOPS_PAT: 'pat-with-special-chars_123'
    };

    const result = getAzureDevOpsEnvVars(env);

    expect(result.AZURE_DEVOPS_ORGANIZATION).toBe('test-org-123');
    expect(result.AZURE_DEVOPS_PROJECT).toBe('test_project.name');
    expect(result.AZURE_DEVOPS_PAT).toBe('pat-with-special-chars_123');
  });

  it('should handle very long environment variable values', () => {
    const longOrg = 'very-long-organization-name-'.repeat(10);
    const longProject = 'very-long-project-name-'.repeat(10);
    const longPat = 'very-long-personal-access-token-'.repeat(10);

    const env = {
      AZURE_DEVOPS_ORGANIZATION: longOrg,
      AZURE_DEVOPS_PROJECT: longProject,
      AZURE_DEVOPS_PAT: longPat
    };

    const result = getAzureDevOpsEnvVars(env);

    expect(result.AZURE_DEVOPS_ORGANIZATION).toBe(longOrg);
    expect(result.AZURE_DEVOPS_PROJECT).toBe(longProject);
    expect(result.AZURE_DEVOPS_PAT).toBe(longPat);
  });

  it('should handle numeric-like string values', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: '12345',
      AZURE_DEVOPS_PROJECT: '67890',
      AZURE_DEVOPS_PAT: '123-456-789'
    };

    const result = getAzureDevOpsEnvVars(env);

    expect(result.AZURE_DEVOPS_ORGANIZATION).toBe('12345');
    expect(result.AZURE_DEVOPS_PROJECT).toBe('67890');
    expect(result.AZURE_DEVOPS_PAT).toBe('123-456-789');
  });

  it('should handle case sensitivity correctly', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'Test-Org',
      AZURE_DEVOPS_PROJECT: 'Test-Project',
      AZURE_DEVOPS_PAT: 'Test-PAT'
    };

    const result = getAzureDevOpsEnvVars(env);

    expect(result.AZURE_DEVOPS_ORGANIZATION).toBe('Test-Org');
    expect(result.AZURE_DEVOPS_PROJECT).toBe('Test-Project');
    expect(result.AZURE_DEVOPS_PAT).toBe('Test-PAT');
  });

  it('should handle additional properties in environment object', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'test-org',
      AZURE_DEVOPS_PROJECT: 'test-project',
      AZURE_DEVOPS_PAT: 'test-pat',
      OTHER_PROPERTY: 'ignored',
      NODE_ENV: 'test'
    };

    const result = getAzureDevOpsEnvVars(env);

    expect(result).toEqual({
      AZURE_DEVOPS_ORGANIZATION: 'test-org',
      AZURE_DEVOPS_PROJECT: 'test-project',
      AZURE_DEVOPS_PAT: 'test-pat'
    });
    expect(result).not.toHaveProperty('OTHER_PROPERTY');
    expect(result).not.toHaveProperty('NODE_ENV');
  });
});

describe('getPipelineConfig - Extended Edge Cases', () => {
  it('should handle undefined config parameter', () => {
    expect(() => getPipelineConfig(undefined as any)).toThrow('Missing pipeline config');
  });

  it('should handle whitespace-only config', () => {
    expect(() => getPipelineConfig('   \t\n   ')).toThrow('Missing pipeline config');
  });

  it('should handle malformed JSON with extra commas', () => {
    const malformedJson = '{ "pipelines": [,] }';
    
    expect(() => getPipelineConfig(malformedJson)).toThrow('Failed to parse pipeline config');
  });

  it('should handle malformed JSON with missing quotes', () => {
    const malformedJson = '{ pipelines: [] }';
    
    expect(() => getPipelineConfig(malformedJson)).toThrow('Failed to parse pipeline config');
  });

  it('should handle malformed JSON with trailing comma', () => {
    const malformedJson = '{ "pipelines": [], }';
    
    expect(() => getPipelineConfig(malformedJson)).toThrow('Failed to parse pipeline config');
  });

  it('should handle deeply nested pipeline configuration', () => {
    const configRaw = JSON.stringify({
      pipelines: [
        { 
          id: '1', 
          type: 'build', 
          displayName: 'Complex Build',
          settings: {
            triggers: ['manual', 'schedule'],
            variables: {
              env: 'production',
              debug: false
            },
            stages: [
              { name: 'build', steps: ['compile', 'test'] },
              { name: 'deploy', steps: ['package', 'release'] }
            ]
          }
        }
      ]
    });

    const result = getPipelineConfig(configRaw);
    
    expect(result.pipelines[0].settings.triggers).toEqual(['manual', 'schedule']);
    expect(result.pipelines[0].settings.variables.env).toBe('production');
    expect(result.pipelines[0].settings.stages).toHaveLength(2);
  });

  it('should handle large pipeline configurations', () => {
    const pipelines = [];
    for (let i = 1; i <= 100; i++) {
      pipelines.push({
        id: i.toString(),
        type: i % 2 === 0 ? 'build' : 'release',
        displayName: `Pipeline ${i}`
      });
    }

    const configRaw = JSON.stringify({ pipelines });
    const result = getPipelineConfig(configRaw);

    expect(result.pipelines).toHaveLength(100);
    expect(result.pipelines[0].id).toBe('1');
    expect(result.pipelines[99].id).toBe('100');
  });

  it('should handle pipelines with missing required properties', () => {
    const configRaw = JSON.stringify({
      pipelines: [
        { id: '1' }, // missing type and displayName
        { type: 'build' }, // missing id and displayName
        { displayName: 'Test Pipeline' } // missing id and type
      ]
    });

    const result = getPipelineConfig(configRaw);
    
    expect(result.pipelines).toHaveLength(3);
    expect(result.pipelines[0].id).toBe('1');
    expect(result.pipelines[1].type).toBe('build');
    expect(result.pipelines[2].displayName).toBe('Test Pipeline');
  });

  it('should handle pipelines with null values', () => {
    const configRaw = JSON.stringify({
      pipelines: [
        { id: null, type: 'build', displayName: 'Test' },
        { id: '1', type: null, displayName: 'Test' },
        { id: '1', type: 'build', displayName: null }
      ]
    });

    const result = getPipelineConfig(configRaw);
    
    expect(result.pipelines[0].id).toBeNull();
    expect(result.pipelines[1].type).toBeNull();
    expect(result.pipelines[2].displayName).toBeNull();
  });

  it('should handle special characters in pipeline properties', () => {
    const configRaw = JSON.stringify({
      pipelines: [
        { 
          id: 'pipeline-123', 
          type: 'build/release', 
          displayName: 'Pipeline with Special Characters !@#$%^&*()' 
        }
      ]
    });

    const result = getPipelineConfig(configRaw);
    
    expect(result.pipelines[0].id).toBe('pipeline-123');
    expect(result.pipelines[0].type).toBe('build/release');
    expect(result.pipelines[0].displayName).toBe('Pipeline with Special Characters !@#$%^&*()');
  });

  it('should handle config with null pipelines property', () => {
    const configRaw = JSON.stringify({
      pipelines: null
    });

    expect(() => getPipelineConfig(configRaw)).toThrow('No pipelines configured');
  });

  it('should handle config with undefined pipelines property', () => {
    const configRaw = JSON.stringify({
      pipelines: undefined
    });

    expect(() => getPipelineConfig(configRaw)).toThrow('No pipelines configured');
  });

  it('should handle Unicode characters in pipeline configuration', () => {
    const configRaw = JSON.stringify({
      pipelines: [
        { 
          id: '1', 
          type: 'build', 
          displayName: 'パイプライン テスト' // Japanese characters
        },
        { 
          id: '2', 
          type: 'release', 
          displayName: 'Pipeline Тест' // Cyrillic characters
        }
      ]
    });

    const result = getPipelineConfig(configRaw);
    
    expect(result.pipelines[0].displayName).toBe('パイプライン テスト');
    expect(result.pipelines[1].displayName).toBe('Pipeline Тест');
  });

  it('should handle extremely long JSON strings', () => {
    const longDisplayName = 'Very Long Pipeline Name '.repeat(1000);
    const configRaw = JSON.stringify({
      pipelines: [
        { id: '1', type: 'build', displayName: longDisplayName }
      ]
    });

    const result = getPipelineConfig(configRaw);
    
    expect(result.pipelines[0].displayName).toBe(longDisplayName);
  });

  it('should handle config with additional root-level properties', () => {
    const configRaw = JSON.stringify({
      version: '1.0',
      description: 'Pipeline configuration',
      pipelines: [
        { id: '1', type: 'build', displayName: 'Test' }
      ],
      metadata: {
        created: '2025-09-22',
        author: 'test-user'
      }
    });

    const result = getPipelineConfig(configRaw);
    
    expect(result.version).toBe('1.0');
    expect(result.description).toBe('Pipeline configuration');
    expect(result.metadata.created).toBe('2025-09-22');
    expect(result.metadata.author).toBe('test-user');
  });
});

describe('Utility Functions - Integration Tests', () => {
  it('should work together when processing environment and config data', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'test-org',
      AZURE_DEVOPS_PROJECT: 'test-project',
      AZURE_DEVOPS_PAT: 'test-pat'
    };

    const configRaw = JSON.stringify({
      pipelines: [
        { id: '1', type: 'build', displayName: 'Build Pipeline' }
      ]
    });

    const envVars = getAzureDevOpsEnvVars(env);
    const config = getPipelineConfig(configRaw);

    expect(envVars.AZURE_DEVOPS_ORGANIZATION).toBe('test-org');
    expect(config.pipelines).toHaveLength(1);
    expect(config.pipelines[0].type).toBe('build');
  });

  it('should handle error scenarios in combination', () => {
    const invalidEnv = {};
    const invalidConfig = 'invalid json';

    expect(() => getAzureDevOpsEnvVars(invalidEnv)).toThrow('Missing Azure DevOps environment variables');
    expect(() => getPipelineConfig(invalidConfig)).toThrow('Failed to parse pipeline config');
  });

  it('should validate data consistency between environment and config', () => {
    const env = {
      AZURE_DEVOPS_ORGANIZATION: 'production-org',
      AZURE_DEVOPS_PROJECT: 'main-project',
      AZURE_DEVOPS_PAT: 'secure-token'
    };

    const configRaw = JSON.stringify({
      environment: 'production',
      pipelines: [
        { id: '1', type: 'build', displayName: 'Production Build' },
        { id: '2', type: 'release', displayName: 'Production Release' }
      ]
    });

    const envVars = getAzureDevOpsEnvVars(env);
    const config = getPipelineConfig(configRaw);

    // Validate that both contain production-related data
    expect(envVars.AZURE_DEVOPS_ORGANIZATION).toContain('production');
    expect(config.environment).toBe('production');
    expect(config.pipelines.every((p: any) => p.displayName.includes('Production'))).toBe(true);
  });
});