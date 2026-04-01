// Simple notification system
export class NotificationManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Create notification container
    this.container = document.createElement('div');
    this.container.className = 'notification-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      background: var(--bg-card);
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
      color: var(--text-primary);
      font-size: 0.875rem;
      max-width: 300px;
      box-shadow: var(--shadow-lg);
      pointer-events: auto;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;

    // Set type-specific styles
    switch (type) {
      case 'success':
        notification.style.borderColor = 'var(--success)';
        notification.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        break;
      case 'error':
        notification.style.borderColor = 'var(--error)';
        notification.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        break;
      case 'warning':
        notification.style.borderColor = 'var(--warning)';
        notification.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
        break;
    }

    notification.textContent = message;
    this.container.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
      notification.style.transform = 'translateX(0)';
    });

    // Auto remove
    if (duration > 0) {
      setTimeout(() => {
        this.remove(notification);
      }, duration);
    }

    // Click to dismiss
    notification.addEventListener('click', () => {
      this.remove(notification);
    });

    return notification;
  }

  remove(notification) {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Global instance
export const notifications = new NotificationManager();