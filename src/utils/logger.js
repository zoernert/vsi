class Logger {
  constructor(context = '') {
    this.context = context;
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const contextStr = this.context ? `[${this.context}] ` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    
    return `${timestamp} [${level.toUpperCase()}] ${contextStr}${message}${metaStr}`;
  }

  info(message, meta = {}) {
    console.log(this.formatMessage('info', message, meta));
  }

  warn(message, meta = {}) {
    console.warn(this.formatMessage('warn', message, meta));
  }

  error(message, meta = {}) {
    console.error(this.formatMessage('error', message, meta));
  }

  debug(message, meta = {}) {
    if (process.env.NODE_ENV === 'development') {
      console.log(this.formatMessage('debug', message, meta));
    }
  }
}

const createContextLogger = (context) => {
  return new Logger(context);
};

module.exports = { Logger, createContextLogger };
