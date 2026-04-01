// Base class for all modules
export class BaseModule {
  constructor(api, config) {
    this.api = api;
    this.config = config;
    this.isActive = false;
    this.element = null;
  }

  async activate() {
    this.isActive = true;
    await this.onActivate();
  }

  async deactivate() {
    this.isActive = false;
    await this.onDeactivate();
  }

  async onActivate() {
    // Override in subclasses
  }

  async onDeactivate() {
    // Override in subclasses
  }

  // Utility methods
  createElement(tag, className = '', content = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content) element.innerHTML = content;
    return element;
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

  // Event handling
  addEventListener(selector, event, handler) {
    let target;
    
    if (typeof selector === 'string') {
      // First try to find within the module element
      if (this.element) {
        target = this.element.querySelector(selector);
      }
      
      // If not found and selector starts with # or ., try global search
      if (!target && (selector.startsWith('#') || selector.startsWith('.'))) {
        target = document.querySelector(selector);
      }
    } else {
      target = selector;
    }
    
    if (target) {
      target.addEventListener(event, handler);
      console.debug(`Event listener added: ${selector} -> ${event}`);
    } else {
      console.warn(`Element not found for selector: ${selector}`);
    }
  }

  removeEventListener(selector, event, handler) {
    let target;
    
    if (typeof selector === 'string') {
      // First try to find within the module element
      if (this.element) {
        target = this.element.querySelector(selector);
      }
      
      // If not found and selector starts with #, try global search
      if (!target && selector.startsWith('#')) {
        target = document.querySelector(selector);
      }
    } else {
      target = selector;
    }
    
    if (target) {
      target.removeEventListener(event, handler);
    }
  }

  // Form helpers
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
          input.value = value || '';
        }
      }
    });
  }
}