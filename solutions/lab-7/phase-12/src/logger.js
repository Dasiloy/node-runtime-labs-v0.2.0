export function createLogger({ stream = process.stdout } = {}) {
  return {
    log(event, fields = {}) {
      const record = {
        event,
        timestamp: new Date().toISOString(),
        ...fields
      };
      stream.write(`${JSON.stringify(record)}\n`);
    },
    error(event, error, fields = {}) {
      this.log(event, {
        ...fields,
        error: {
          name: error.name,
          code: error.code,
          message: error.message
        }
      });
    }
  };
}
