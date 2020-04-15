const { queue } = require('async');

class ProcessingQueue {
  constructor() {
    this.queue = queue(this.queueHandler.bind(this), 1);
    this.handlers = [];
  }

  push({type, data}) {
    return new Promise((resolve, reject) => this.queue.push({type, data}, (err, res) => {
      if (err) {
        return reject(err);
      }
      resolve(res);
    }));
  }

  registerHandler(type, handler) {
    this.handlers.push({type, handler});
  }

  async queueHandler({type, data}) {
    const handler = this.handlers.find(({type: handlerType}) => type === handlerType);
    if (!handler) {
      throw new Error(`Received unknown type: ${type}`);
    }
    return handler.handler(data);
  }
}

module.exports = ProcessingQueue;
