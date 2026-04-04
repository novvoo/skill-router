// Production-grade event bus
import { logger } from './logger.js';

export class EventBus {
  constructor(options = {}) {
    this.events = new Map();
    this.wildcardHandlers = [];
    this.maxListeners = options.maxListeners || 100;
    this.debug = options.debug || false;
    this.eventHistory = [];
    this.maxHistoryLength = options.maxHistoryLength || 500;
  }

  on(event, handler, context = null) {
    if (typeof handler !== 'function') {
      throw new TypeError('Event handler must be a function');
    }

    if (event === '*') {
      this.wildcardHandlers.push({ handler, context });
      if (this.debug) {
        logger.debug(`EventBus: Added wildcard handler`);
      }
      return () => this.off('*', handler);
    }

    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const handlers = this.events.get(event);
    
    if (handlers.length >= this.maxListeners) {
      logger.warn(
        `EventBus: Possible memory leak detected - ${handlers.length} listeners for event "${event}"`
      );
    }

    const handlerObj = { handler, context };
    handlers.push(handlerObj);

    if (this.debug) {
      logger.debug(`EventBus: Added handler for event "${event}"`, { total: handlers.length });
    }

    return () => this.off(event, handler);
  }

  once(event, handler, context = null) {
    const onceHandler = (...args) => {
      this.off(event, onceHandler);
      handler.apply(context, args);
    };
    
    return this.on(event, onceHandler, context);
  }

  off(event, handler = null) {
    if (event === '*' && handler === null) {
      const count = this.wildcardHandlers.length;
      this.wildcardHandlers = [];
      if (this.debug) {
        logger.debug(`EventBus: Removed all ${count} wildcard handlers`);
      }
      return;
    }

    if (event === '*') {
      const initialLength = this.wildcardHandlers.length;
      this.wildcardHandlers = this.wildcardHandlers.filter(h => h.handler !== handler);
      if (this.debug && initialLength !== this.wildcardHandlers.length) {
        logger.debug(`EventBus: Removed wildcard handler`);
      }
      return;
    }

    if (!this.events.has(event)) {
      return;
    }

    if (handler === null) {
      const handlers = this.events.get(event);
      const count = handlers.length;
      this.events.delete(event);
      if (this.debug) {
        logger.debug(`EventBus: Removed all ${count} handlers for event "${event}"`);
      }
      return;
    }

    const handlers = this.events.get(event);
    const initialLength = handlers.length;
    this.events.set(
      event,
      handlers.filter(h => h.handler !== handler)
    );

    if (this.debug && initialLength !== handlers.length) {
      logger.debug(`EventBus: Removed handler for event "${event}"`);
    }
  }

  emit(event, ...args) {
    const eventData = {
      event,
      args,
      timestamp: Date.now()
    };

    this.eventHistory.push(eventData);
    if (this.eventHistory.length > this.maxHistoryLength) {
      this.eventHistory.shift();
    }

    if (this.debug) {
      logger.debug(`EventBus: Emitting event "${event}"`, { args });
    }

    for (const { handler, context } of this.wildcardHandlers) {
      try {
        handler.apply(context, [event, ...args]);
      } catch (error) {
        logger.error(`EventBus: Error in wildcard handler for event "${event}":`, error);
      }
    }

    if (!this.events.has(event)) {
      return true;
    }

    const handlers = [...this.events.get(event)];
    let hadErrors = false;

    for (const { handler, context } of handlers) {
      try {
        handler.apply(context, args);
      } catch (error) {
        logger.error(`EventBus: Error in handler for event "${event}":`, error);
        hadErrors = true;
      }
    }

    return !hadErrors;
  }

  async emitAsync(event, ...args) {
    const eventData = {
      event,
      args,
      timestamp: Date.now()
    };

    this.eventHistory.push(eventData);
    if (this.eventHistory.length > this.maxHistoryLength) {
      this.eventHistory.shift();
    }

    if (this.debug) {
      logger.debug(`EventBus: Emitting async event "${event}"`, { args });
    }

    const results = [];
    const errors = [];

    for (const { handler, context } of this.wildcardHandlers) {
      try {
        const result = await handler.apply(context, [event, ...args]);
        results.push(result);
      } catch (error) {
        logger.error(`EventBus: Error in async wildcard handler for event "${event}":`, error);
        errors.push(error);
      }
    }

    if (this.events.has(event)) {
      const handlers = [...this.events.get(event)];
      
      for (const { handler, context } of handlers) {
        try {
          const result = await handler.apply(context, args);
          results.push(result);
        } catch (error) {
          logger.error(`EventBus: Error in async handler for event "${event}":`, error);
          errors.push(error);
        }
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, `Errors occurred in event handlers for "${event}"`);
    }

    return results;
  }

  listenerCount(event) {
    if (event === '*') {
      return this.wildcardHandlers.length;
    }
    return this.events.has(event) ? this.events.get(event).length : 0;
  }

  eventNames() {
    return [...this.events.keys()];
  }

  getHistory(options = {}) {
    let history = [...this.eventHistory];
    
    if (options.event) {
      history = history.filter(e => e.event === options.event);
    }
    
    if (options.since) {
      history = history.filter(e => e.timestamp >= options.since);
    }
    
    if (options.limit) {
      history = history.slice(-options.limit);
    }
    
    return history;
  }

  clearHistory() {
    this.eventHistory = [];
  }

  reset() {
    this.events.clear();
    this.wildcardHandlers = [];
    this.eventHistory = [];
    if (this.debug) {
      logger.debug('EventBus: Reset complete');
    }
  }

  destroy() {
    this.reset();
  }
}

let defaultEventBus = null;

export function getEventBus() {
  if (!defaultEventBus) {
    defaultEventBus = new EventBus();
  }
  return defaultEventBus;
}

export function initEventBus(options = {}) {
  defaultEventBus = new EventBus(options);
  return defaultEventBus;
}

export { defaultEventBus };
