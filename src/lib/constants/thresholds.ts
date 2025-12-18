export const PIPELINE_TEST_THRESHOLDS = {
    good: 95,  // 98% and above is considered good - green
    ok: 70,    // 70% to 99% is considered ok - yellow
}

export const PIPELINE_ENV_NOT_STARTED_THRESHOLD = 0.3; // 30% or more environments not started is considered 'not started'

export function getTestQuality(passPercentage: number): 'good' | 'ok' | 'bad' {
    if (passPercentage >= PIPELINE_TEST_THRESHOLDS.good) {
        return 'good';
    } else if (passPercentage >= PIPELINE_TEST_THRESHOLDS.ok) {
        return 'ok';
    } else {
        return 'bad';
    }
}