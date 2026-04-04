// Enhanced production-grade BaseModule with lifecycle management
import { logger } from '../utils/logger.js';
import { dom, validation } from '../utils/utils.js';

export class BaseModule {
  constructor(api, config) {
    this.api = api;
    this.config = config;
    this.isActive = false;
    this.element = null;
    this.moduleName = this.constructor.name;
    this.logger = logger.createChild(this.moduleName);
    this.eventListeners = [];
    this.eventBusSubscriptions = [];
    this.timeouts = [];
    this.intervals = [];
  }

  async activate() {
    if (this.isActive) {
      this.logger.debug('Module already active');
      return;
    }
    
    this.isActive = true;
    this.logger.debug('Activating module');
    
    try {
      await this.onActivate();
    } catch (error) {
      this.logger.error('Error during module activation:', error);
      this.isActive = false;
      throw error;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      this.logger.debug('Module already inactive');
      return;
    }
    
    this.logger.debug('Deactivating module');
    
    try {
      await this.onDeactivate();
    } catch (error) {
      this.logger.error('Error during module deactivation:', error);
    }
    
    this.cleanup();
    this.isActive = false;
  }

  cleanup() {
    this.logger.debug('Cleaning up module resources');
    
    this.eventListeners.forEach(({ target, event, handler }) => {
      if (target && target.removeEventListener) {
        target.removeEventListener(event, handler);
      }
    });
    this.eventListeners = [];
    
    this.eventBusSubscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.eventBusSubscriptions = [];
    
    this.timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.timeouts = [];
    
    this.intervals.forEach(intervalId => clearInterval(intervalId));
    this.intervals = [];
  }

  async onActivate() {
  }

  async onDeactivate() {
  }

  createElement(tag, options = {}) {
    return dom.createElement(tag, options);
  }

  showStatus(message, isError = false) {
    const statusEl = this.element?.querySelector('.status-message');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `status-message ${isError ? 'error' : 'success'}`;
    }
  }

  clearStatus() {
    const statusEl = this.element?.querySelector('.status-message');
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }
  }

  showLoading(show = true) {
    const loadingEl = this.element?.querySelector('.loading');
    if (loadingEl) {
      loadingEl.style.display = show ? 'block' : 'none';
    }
  }

  addEventListener(selector, event, handler) {
    let target;
    
    if (typeof selector === 'string') {
      if (this.element) {
        target = this.element.querySelector(selector);
      }
      
      if (!target && (selector.startsWith('#') || selector.startsWith('.'))) {
        target = document.querySelector(selector);
      }
    } else {
      target = selector;
    }
    
    if (target) {
      target.addEventListener(event, handler);
      this.eventListeners.push({ target, event, handler });
      this.logger.debug(`Event listener added: ${selector} -> ${event}`);
    } else {
      this.logger.warn(`Element not found for selector: ${selector}`);
    }
  }

  removeEventListener(selector, event, handler) {
    let target;
    
    if (typeof selector === 'string') {
      if (this.element) {
        target = this.element.querySelector(selector);
      }
      
      if (!target && selector.startsWith('#')) {
        target = document.querySelector(selector);
      }
    } else {
      target = selector;
    }
    
    if (target) {
      target.removeEventListener(event, handler);
      this.eventListeners = this.eventListeners.filter(
        l => !(l.target === target && l.event === event && l.handler === handler)
      );
    }
  }

  safeSetTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      callback();
      const index = this.timeouts.indexOf(timeoutId);
      if (index > -1) {
        this.timeouts.splice(index, 1);
      }
    }, delay);
    this.timeouts.push(timeoutId);
    return timeoutId;
  }

  safeSetInterval(callback, interval) {
    const intervalId = setInterval(callback, interval);
    this.intervals.push(intervalId);
    return intervalId;
  }

  safeClearTimeout(timeoutId) {
    clearTimeout(timeoutId);
    this.timeouts = this.timeouts.filter(id => id !== timeoutId);
  }

  safeClearInterval(intervalId) {
    clearInterval(intervalId);
    this.intervals = this.intervals.filter(id => id !== intervalId);
  }

  getFormData(formSelector) {
    const form = this.element?.querySelector(formSelector);
    if (!form) return {};

    const formData = new FormData(form);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    return data;
  }

  setFormData(formSelector, data) {
    const form = this.element?.querySelector(formSelector);
    if (!form) return;

    Object.entries(data).forEach(([key, value]) => {
      const input = form.querySelector(`[name="${key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = Boolean(value);
        } else {
          input.value = validation.sanitize(value, 'string');
        }
      }
    });
  }
}