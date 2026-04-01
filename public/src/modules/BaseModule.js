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
    if (this.element) {
      const target = typeof selector === 'string' 
        ? this.element.querySelector(selector)
        : selector;
      
      if (target) {
        target.addEventListener(event, handler);
      }
    }
  }

  removeEventListener(selector, event, handler) {
    if (this.element) {
      const target = typeof selector === 'string' 
        ? this.element.querySelector(selector)
        : selector;
      
      if (target) {
        target.removeEventListener(event, handler);
      }
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