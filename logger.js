const pino = require('pino');

// Structured JSON logs to stdout. Rotation is intentionally left to the
// process manager/journald/logrotate rather than reimplemented here — see
// docs/production-readiness.md.
module.exports = pino({ level: process.env.LOG_LEVEL || 'info' });
