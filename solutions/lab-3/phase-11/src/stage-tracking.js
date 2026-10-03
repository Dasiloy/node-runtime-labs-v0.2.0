export function trackStageCloses(stages) {
  const closes = [];

  for (const { name, stream } of stages) {
    stream.once('close', () => {
      closes.push({
        name,
        closedAt: new Date().toISOString(),
      });
    });
  }

  return {
    snapshot() {
      return [...closes];
    },
  };
}
