export const PIPELINE_TEST_THRESHOLDS = {
    good: 98,  // 100% and above is considered good - green
    ok: 70,    // 70% to 99% is considered ok - yellow
}

export function getTestQuality(passPercentage: number): 'good' | 'ok' | 'bad' {
    if (passPercentage >= PIPELINE_TEST_THRESHOLDS.good) {
        return 'good';
    } else if (passPercentage >= PIPELINE_TEST_THRESHOLDS.ok) {
        return 'ok';
    } else {
        return 'bad';
    }
}