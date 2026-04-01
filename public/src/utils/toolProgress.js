import { notifications } from './notifications.js';

/**
 * Tool execution progress tracker with real-time updates
 */
export class ToolProgressTracker {
  constructor() {
    this.activeTools = new Map(); // toolId -> { name, status, startTime, element }
    this.container = null;
    this.init();
  }

  init() {
    // Create progress container
    this.container = document.createElement('div');
    this.container.className = 'tool-progress-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 400px;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  /**
   * Handle tool progress updates from streaming executor
   */
  onToolProgress(progress) {
    // Add null checks to prevent undefined property access
    if (!progress || typeof progress !== 'object') {
      console.warn('Invalid progress object received:', progress);
      return;
    }
    
    const { toolId, toolName, status, stage, message, data } = progress;
    
    // Ensure required properties exist
    if (!toolId || !toolName) {
      console.warn('Missing required properties in progress:', progress);
      return;
    }
    
    switch (stage) {
      case 'tool_queued':
        this.addTool(toolId, toolName, 'queued');
        break;
      case 'tool_start':
        this.updateTool(toolId, 'executing', message);
        break;
      case 'tool_progress':
        this.updateTool(toolId, 'executing', message, data);
        break;
      case 'tool_complete':
        this.updateTool(toolId, 'completed', message, data);
        this.scheduleRemoval(toolId, 2000); // Remove after 2s
        break;
      case 'tool_error':
        this.updateTool(toolId, 'error', message);
        this.scheduleRemoval(toolId, 5000); // Keep errors longer
        break;
      case 'tool_yielded':
        this.removeTool(toolId);
        break;
    }
  }

  /**
   * Add a new tool to progress tracking
   */
  addTool(toolId, toolName, status) {
    const element = this.createToolElement(toolId, toolName, status);
    
    this.activeTools.set(toolId, {
      name: toolName,
      status,
      startTime: Date.now(),
      element
    });
    
    this.container.appendChild(element);
    
    // Animate in
    requestAnimationFrame(() => {
      element.style.transform = 'translateX(0)';
      element.style.opacity = '1';
    });
  }

  /**
   * Update tool progress
   */
  updateTool(toolId, status, message, data) {
    const tool = this.activeTools.get(toolId);
    if (!tool) return;
    
    tool.status = status;
    const element = tool.element;
    
    // Update status indicator
    const statusDot = element.querySelector('.status-dot');
    const messageEl = element.querySelector('.tool-message');
    const progressBar = element.querySelector('.progress-bar');
    
    // Add null checks for DOM elements
    if (statusDot) {
      statusDot.className = `status-dot status-${status}`;
    }
    
    if (messageEl) {
      messageEl.textContent = message || `${tool.name} ${status}`;
    }
    
    if (progressBar) {
      // Update progress bar based on status
      switch (status) {
        case 'queued':
          progressBar.style.width = '0%';
          break;
        case 'executing':
          progressBar.style.width = '50%';
          progressBar.classList.add('pulsing');
          break;
        case 'completed':
          progressBar.style.width = '100%';
          progressBar.classList.remove('pulsing');
          break;
        case 'error':
          progressBar.style.width = '100%';
          progressBar.classList.remove('pulsing');
          progressBar.style.backgroundColor = 'var(--error)';
          break;
      }
    }
    
    // Show data if available
    if (data && status === 'completed' && messageEl) {
      const duration = data.duration || (Date.now() - tool.startTime);
      messageEl.textContent = `${tool.name} completed (${duration}ms)`;
    }
  }

  /**
   * Create tool progress element
   */
  createToolElement(toolId, toolName, status) {
    const element = document.createElement('div');
    element.className = 'tool-progress-item';
    element.style.cssText = `
      background: var(--bg-card);
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-sm);
      padding: 12px;
      color: var(--text-primary);
      font-size: 0.8rem;
      box-shadow: var(--shadow-md);
      pointer-events: auto;
      transform: translateX(-100%);
      opacity: 0;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    element.innerHTML = `
      <div class="status-dot status-${status}" style="
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      "></div>
      <div class="tool-info" style="flex: 1; min-width: 0;">
        <div class="tool-name" style="font-weight: 500; margin-bottom: 2px;">${toolName}</div>
        <div class="tool-message" style="color: var(--text-secondary); font-size: 0.75rem;">${status}</div>
        <div class="progress-container" style="
          width: 100%;
          height: 2px;
          background: var(--border-primary);
          border-radius: 1px;
          margin-top: 4px;
          overflow: hidden;
        ">
          <div class="progress-bar" style="
            height: 100%;
            background: var(--primary);
            width: 0%;
            transition: width 0.3s ease;
            border-radius: 1px;
          "></div>
        </div>
      </div>
    `;
    
    // Add status-specific styles
    this.updateStatusStyles(element, status);
    
    return element;
  }

  /**
   * Update status-specific styles
   */
  updateStatusStyles(element, status) {
    const statusDot = element.querySelector('.status-dot');
    
    switch (status) {
      case 'queued':
        statusDot.style.backgroundColor = 'var(--text-tertiary)';
        break;
      case 'executing':
        statusDot.style.backgroundColor = 'var(--primary)';
        statusDot.style.animation = 'pulse 1.5s infinite';
        break;
      case 'completed':
        statusDot.style.backgroundColor = 'var(--success)';
        statusDot.style.animation = 'none';
        break;
      case 'error':
        statusDot.style.backgroundColor = 'var(--error)';
        statusDot.style.animation = 'none';
        break;
    }
  }

  /**
   * Schedule tool removal
   */
  scheduleRemoval(toolId, delay) {
    setTimeout(() => {
      this.removeTool(toolId);
    }, delay);
  }

  /**
   * Remove tool from tracking
   */
  removeTool(toolId) {
    const tool = this.activeTools.get(toolId);
    if (!tool) return;
    
    const element = tool.element;
    
    // Animate out
    element.style.transform = 'translateX(-100%)';
    element.style.opacity = '0';
    
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.activeTools.delete(toolId);
    }, 300);
  }

  /**
   * Clear all tools
   */
  clearAll() {
    for (const [toolId] of this.activeTools) {
      this.removeTool(toolId);
    }
  }

  /**
   * Get active tool count
   */
  getActiveCount() {
    return this.activeTools.size;
  }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .progress-bar.pulsing {
    animation: pulse 1s infinite;
  }
`;
document.head.appendChild(style);

// Global instance
export const toolProgressTracker = new ToolProgressTracker();