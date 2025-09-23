/**
 * Returns validated Azure DevOps environment variables from env object.
 * Throws if any required variable is missing.
 */
export function getAzureDevOpsEnvVars(env: Record<string, any>) {
	const AZURE_DEVOPS_ORGANIZATION = env.AZURE_DEVOPS_ORGANIZATION?.trim();
	const AZURE_DEVOPS_PROJECT = env.AZURE_DEVOPS_PROJECT?.trim();
	const AZURE_DEVOPS_PAT = env.AZURE_DEVOPS_PAT?.trim();
	if (!AZURE_DEVOPS_ORGANIZATION || !AZURE_DEVOPS_PROJECT || !AZURE_DEVOPS_PAT) {
		throw new Error('Missing Azure DevOps environment variables');
	}
	return { AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT };
}

/**
 * Parses PUBLIC_AZURE_PIPELINE_CONFIG and returns the config object.
 * Throws errors for missing/invalid config or pipelines.
 */
export function getPipelineConfig(configRaw: string): any {
	if (!configRaw || !configRaw.trim()) {
		throw new Error('Missing pipeline config');
	}
	let config;
	try {
		config = JSON.parse(configRaw);
	} catch (e) {
		throw new Error('Failed to parse pipeline config');
	}
	if (!config.pipelines || !Array.isArray(config.pipelines)) {
		throw new Error('No pipelines configured');
	}
	return config;
}
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export const successThreshold: number = 95;
export const partiallySucceededThreshold: number = 75;
