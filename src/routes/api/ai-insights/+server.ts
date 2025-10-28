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

	if (analysisType === 'best-build-month') {
		systemPrompt = `You are an AI assistant that analyzes software build and test data for an entire month. 
Your task is to identify the single best build day based on comprehensive metrics including test pass rates, pipeline success, and overall stability. 
Consider factors like: highest pass rates, most pipelines completed successfully, fewest critical failures, and overall build health. 
Provide a clear, concise answer identifying the specific date and brief reasoning.`;

		userPrompt = `Analyze the following month's build data and identify the BEST build day. If there is a close second place, explain why you chose it over the second place. Consider:

1. Highest overall test pass rates
2. Most pipelines completed successfully  
3. Fewest failures
4. Best overall build stability and health

${JSON.stringify(buildData, null, 2)}

Respond with just the date (e.g., "October 15" or "2025-10-15") and a 1-sentence explanation of why it's the best. Mention the date range analyzed.`;
	} else {
		// Original weekly analysis prompt
		systemPrompt = `You are an AI assistant that analyzes software build and test data. 
Provide concise, actionable insights about test failures, trends, and potential issues. Be careful to avoid generic statements. Please space your summary out.
Focus on what developers need to know to improve their builds. Do not provide any suggested actions. Pay attention to which test cases are failing on which pipeline.`;

		userPrompt = `Analyze the following build and test data and provide a brief summary in plaintext (3 sentences MAX):

${JSON.stringify(buildData, null, 2)}

Focus on:
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
