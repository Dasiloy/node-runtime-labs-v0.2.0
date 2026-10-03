export function applyShutdownDecision(tasksById, { mode = 'cancel', secondSignal = false } = {}) {
  const nextTasksById = structuredClone(tasksById);
  const decisions = [];

  if (secondSignal) {
    return {
      tasksById: nextTasksById,
      decisions: ['force_exit'],
      exitCode: 130,
      forced: true
    };
  }

  for (const [taskId, task] of Object.entries(nextTasksById)) {
    if (task.status === 'queued' || task.status === 'pending') {
      task.status = 'canceled';
      decisions.push('cancel_queued:' + taskId);
    }

    if (task.status === 'running' && mode === 'cancel') {
      task.status = 'canceled';
      decisions.push('cancel_running:' + taskId);
    }

    if (task.status === 'running' && mode === 'drain') {
      decisions.push('drain_running:' + taskId);
    }
  }

  return {
    tasksById: nextTasksById,
    decisions,
    exitCode: 0,
    forced: false
  };
}
