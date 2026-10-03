export const MODES = new Set(['all', 'allSettled', 'race', 'any']);

export function evaluateMode({ mode, latestResult, results, taskCount, stopped }) {
  if (stopped) {
    return { continue: false, stop: true, reason: stopped };
  }

  if (mode === 'allSettled') {
    return { continue: results.size < taskCount, stop: false, reason: null };
  }

  if (mode === 'all') {
    if (latestResult && ['failed', 'timed_out'].includes(latestResult.status)) {
      return { continue: false, stop: true, reason: 'first_failure' };
    }
    return { continue: true, stop: false, reason: null };
  }

  if (mode === 'race') {
    if (latestResult) {
      return { continue: false, stop: true, reason: 'first_settled' };
    }
    return { continue: true, stop: false, reason: null };
  }

  if (mode === 'any') {
    if (latestResult?.status === 'success') {
      return { continue: false, stop: true, reason: 'first_success' };
    }

    if (results.size >= taskCount && ![...results.values()].some((result) => result.status === 'success')) {
      return { continue: false, stop: true, reason: 'aggregate_failure' };
    }

    return { continue: true, stop: false, reason: null };
  }

  throw new Error('Unknown mode: ' + mode);
}
