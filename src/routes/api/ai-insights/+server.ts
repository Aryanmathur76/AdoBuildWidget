import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
	const { buildData } = await request.json();

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

	// Create a summary prompt with the build data
	const systemPrompt = `You are an AI assistant that analyzes software build and test data. 
Provide concise, actionable insights about test failures, trends, and potential issues.
Focus on what developers need to know to improve their builds.`;

	const userPrompt = `Analyze the following build and test data from today and provide a brief summary (2-3 sentences):

${JSON.stringify(buildData, null, 2)}

Focus on:
- Overall pass rate and test health
- Any concerning failure patterns
- Key metrics that stand out
- Actionable recommendations if failures exist`;

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
				max_tokens: 500,
				temperature: 0.7,
				top_p: 0.95,
				frequency_penalty: 0,
				presence_penalty: 0
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
