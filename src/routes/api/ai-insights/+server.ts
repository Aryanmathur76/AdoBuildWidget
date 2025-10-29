import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

// In development, disable SSL certificate validation for corporate proxies
if (dev) {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}


export const POST: RequestHandler = async ({ request }) => {
	const { buildData, analysisType } = await request.json();

	const endpoint = env.AZURE_OPENAI_ENDPOINT || '';
	const apiKey = env.AZURE_OPENAI_API_KEY || '';
	const apiVersion = env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';
	const deployment = env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1';

	if (!endpoint || !apiKey) {
		return json(
			{ error: 'Azure OpenAI credentials not configured' },
			{ status: 500 }
		);
	}

	// Build the full URL
	const url = `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

	let systemPrompt: string;
	let userPrompt: string;

	if (analysisType === 'best-build-month' || analysisType === 'best-build-30-days') {
		systemPrompt = `You are an AI assistant that analyzes software build and test data for the last 30 days. 
Your task is to identify the single best build day based on  metrics including test pass rates and pipeline success. 
Consider factors like: total number of tests ran, highest pass rates, most pipelines completed successfully, fewest failures, and overall build health.
Do not mention anything specific about releases, they are just a type of pipeline. 
Provide a clear, concise answer identifying the specific date and brief reasoning.`;

		userPrompt = `Analyze the following 30 days of build data and identify the BEST build day. Consider in order of importance:
1. Highest number of tests run
2. Highest overall test pass rates
3. Most pipelines completed successfully
4. Fewest failures

${JSON.stringify(buildData, null, 2)}

Respond with just the date (e.g., "October 15" or "2025-10-15") and a 1-sentence explanation of why it's the best. Mention the date range analyzed.`;
	} else {
		// Original weekly analysis prompt
		systemPrompt = `You are an AI assistant that analyzes software build and test data. 
Provide concise, actionable insights about test failures, trends, and potential issues.
Please pay attention to which test case failures occur on which pipeline, do not confuse failures in one pipeline with another.

Good example response:
"The release pipelines ("ProdEval EN" and "ProdEval SV25") are consistently passing all tests. In contrast, the CIF Unit Tests and DvDb Tests exhibit persistent failures in key test cases, especially around licensing, document registration, and upgrade scenarios (e.g., "RegLicense_D1_D3_Test", "IERegUpgradeIoTests") across multiple days, with failure counts ranging from 12 to 50 per run. There are also a significant number of "NotExecuted" tests, suggesting possible flaky or skipped tests, which reduces overall test coverage and should be investigated."`;

		userPrompt = `Analyze the following build and test data and provide a summary in plaintext in 3 sentences MAX:

${JSON.stringify(buildData, null, 2)}

Focus on the following in order of importance:
- Overall pass rate and test health
- Any concerning failure patterns
- Key metrics that stand out`;
	}

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'api-key': apiKey
			},
			body: JSON.stringify({
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				max_completion_tokens: 500,
				temperature: 1,
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Azure OpenAI error:', errorText);
			return json(
				{ error: 'Failed to get AI insights', details: errorText },
				{ status: response.status }
			);
		}

		const result = await response.json();
		const aiMessage = result.choices?.[0]?.message?.content || 'No insights available';

		return json({ insights: aiMessage });
	} catch (error) {
		console.error('Error calling Azure OpenAI:', error);
		return json(
			{ error: 'Failed to generate insights', details: String(error) },
			{ status: 500 }
		);
	}
};
