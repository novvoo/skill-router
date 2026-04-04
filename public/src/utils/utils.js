// Production-grade utility functions
import { logger } from './logger.js';

// DOM utilities with XSS protection
export const dom = {
  createElement(tag, options = {}) {
    const { className = '', text = '', attrs = {}, children = [] } = options;
    const element = document.createElement(tag);
    
    if (className) {
      element.className = className;
    }
    
    if (text) {
      element.textContent = text;
    }
    
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'innerHTML') {
        logger.warn('Use innerHTML with caution - consider using textContent instead');
        element.innerHTML = value;
      } else if (key.startsWith('data-')) {
        element.dataset[key.slice(5)] = value;
      } else {
        element.setAttribute(key, value);
      }
    });
    
    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    });
    
    return element;
  },

  safeHTML(html) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html);
    }
    logger.warn('DOMPurify not available, returning raw HTML');
    return html;
  },

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  removeElement(element) {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  },

  emptyElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  },

  delegate(parent, eventType, selector, handler) {
    const eventHandler = (event) => {
      const target = event.target.closest(selector);
      if (target && parent.contains(target)) {
        handler.call(target, event, target);
      }
    };
    parent.addEventListener(eventType, eventHandler);
    return () => parent.removeEventListener(eventType, eventHandler);
  }
};

// Async utilities
export const asyncUtils = {
  debounce(fn, delay = 300) {
    let timeoutId = null;
    const debounced = function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
    debounced.cancel = () => clearTimeout(timeoutId);
    return debounced;
  },

  throttle(fn, limit = 300) {
    let inThrottle = false;
    return function(...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  retry(fn, { maxRetries = 3, delay = 1000, backoff = 2 } = {}) {
    return async function(...args) {
      let lastError;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await fn.apply(this, args);
        } catch (error) {
          lastError = error;
          logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error);
          if (attempt < maxRetries - 1) {
            await asyncUtils.sleep(delay);
            delay *= backoff;
          }
        }
      }
      throw lastError;
    };
  },

  timeout(promise, ms, errorMessage = 'Operation timed out') {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
  }
};

// Storage utilities
export const storage = {
  safeGet(key, defaultValue = null, storageType = 'local') {
    try {
      const storageObj = storageType === 'local' ? localStorage : sessionStorage;
      const value = storageObj.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      logger.error(`Failed to get ${key} from ${storageType}Storage:`, error);
      return defaultValue;
    }
  },

  safeSet(key, value, storageType = 'local') {
    try {
      const storageObj = storageType === 'local' ? localStorage : sessionStorage;
      storageObj.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Failed to set ${key} in ${storageType}Storage:`, error);
      return false;
    }
  },

  safeRemove(key, storageType = 'local') {
    try {
      const storageObj = storageType === 'local' ? localStorage : sessionStorage;
      storageObj.removeItem(key);
      return true;
    } catch (error) {
      logger.error(`Failed to remove ${key} from ${storageType}Storage:`, error);
      return false;
    }
  },

  clear(storageType = 'local') {
    try {
      const storageObj = storageType === 'local' ? localStorage : sessionStorage;
      storageObj.clear();
      return true;
    } catch (error) {
      logger.error(`Failed to clear ${storageType}Storage:`, error);
      return false;
    }
  }
};

// Validation utilities
export const validation = {
  isString(value) {
    return typeof value === 'string';
  },

  isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
  },

  isInteger(value) {
    return Number.isInteger(value);
  },

  isBoolean(value) {
    return typeof value === 'boolean';
  },

  isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  },

  isArray(value) {
    return Array.isArray(value);
  },

  isFunction(value) {
    return typeof value === 'function';
  },

  isEmpty(value) {
    if (value == null) return true;
    if (validation.isString(value) || validation.isArray(value)) return value.length === 0;
    if (validation.isObject(value)) return Object.keys(value).length === 0;
    return false;
  },

  isEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  },

  isURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  sanitize(value, type = 'string') {
    switch (type) {
      case 'string':
        return validation.isString(value) ? value.trim() : '';
      case 'number':
        return validation.isNumber(value) ? value : 0;
      case 'integer':
        return validation.isInteger(value) ? value : 0;
      case 'boolean':
        return Boolean(value);
      default:
        return value;
    }
  }
};

// Object utilities
export const objectUtils = {
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => objectUtils.deepClone(item));
    if (obj instanceof Object) {
      const clonedObj = {};
      Object.keys(obj).forEach(key => {
        clonedObj[key] = objectUtils.deepClone(obj[key]);
      });
      return clonedObj;
    }
    return obj;
  },

  deepFreeze(obj) {
    Object.keys(obj).forEach(key => {
      const prop = obj[key];
      if (typeof prop === 'object' && prop !== null) {
        objectUtils.deepFreeze(prop);
      }
    });
    return Object.freeze(obj);
  },

  merge(...objects) {
    return objects.reduce((acc, obj) => {
      if (!obj) return acc;
      Object.keys(obj).forEach(key => {
        if (validation.isObject(acc[key]) && validation.isObject(obj[key])) {
          acc[key] = objectUtils.merge(acc[key], obj[key]);
        } else {
          acc[key] = objectUtils.deepClone(obj[key]);
        }
      });
      return acc;
    }, {});
  },

  pick(obj, keys) {
    return keys.reduce((acc, key) => {
      if (obj.hasOwnProperty(key)) {
        acc[key] = obj[key];
      }
      return acc;
    }, {});
  },

  omit(obj, keys) {
    const keysSet = new Set(keys);
    return Object.keys(obj).reduce((acc, key) => {
      if (!keysSet.has(key)) {
        acc[key] = obj[key];
      }
      return acc;
    }, {});
  }
};

// String utilities
export const stringUtils = {
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  camelCase(str) {
    return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
  },

  kebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2')
              .replace(/[\s_]+/g, '-')
              .toLowerCase();
  },

  truncate(str, length = 50, suffix = '...') {
    if (!str || str.length <= length) return str;
    return str.slice(0, length - suffix.length) + suffix;
  },

  slugify(str) {
    return str.toLowerCase()
              .trim()
              .replace(/[^\w\s-]/g, '')
              .replace(/[\s_-]+/g, '-')
              .replace(/^-+|-+$/g, '');
  },

  randomId(prefix = '') {
    const random = Math.random().toString(36).substr(2, 9);
    return prefix ? `${prefix}-${random}` : random;
  },

  template(str, data) {
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
  }
};

// UUID generator
export function generateUUID() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default {
  dom,
  asyncUtils,
  storage,
  validation,
  objectUtils,
  stringUtils,
  generateUUID
};
