// Memory and context management module
import { BaseModule } from './BaseModule.js';

export class MemoryModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.currentPath = '/user';
    this.memoryTree = [];
  }

  async onActivate() {
    this.element = document.getElementById('memory-page');
    if (!this.element) return;

    this.setupEventListeners();
    await this.loadMemories();
  }

  setupEventListeners() {
    // Refresh button
    this.addEventListener('#refresh-memories', 'click', () => this.loadMemories());
    
    // Memory enabled toggle
    this.addEventListener('#memory-enabled', 'change', (e) => {
      const config = this.config.getConfig();
      config.memoryEnabled = e.target.checked;
      this.config.saveConfig(config);
    });
  }

  async loadMemories(path = '/user') {
    this.currentPath = path;
    this.showLoading(true);
    
    try {
      const sessionId = this.config.getSessionId();
      const data = await this.api.get(`/memories?path=${encodeURIComponent(path)}&sessionId=${sessionId}`);
      
      this.memoryTree = data.children || [];
      this.renderMemoryTree();
      this.clearStatus();
    } catch (error) {
      this.showStatus(`加载失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  renderMemoryTree() {
    const container = this.element.querySelector('#memory-tree');
    if (!container) return;

    container.innerHTML = '';

    // Add back button if not at root
    if (this.currentPath !== '/user' && this.currentPath !== '/') {
      const backItem = this.createElement('div', 'memory-item back-item');
      backItem.innerHTML = `
        <div class="memory-info">
          <span class="memory-icon">⬅</span>
          <span class="memory-name">返回上级</span>
        </div>
      `;
      
      backItem.addEventListener('click', () => {
        const parts = this.currentPath.split('/');
        parts.pop();
        const parentPath = parts.join('/') || '/user';
        this.loadMemories(parentPath);
      });
      
      container.appendChild(backItem);
    }

    if (this.memoryTree.length === 0) {
      const emptyItem = this.createElement('div', 'empty-state');
      emptyItem.textContent = '(空目录)';
      container.appendChild(emptyItem);
      return;
    }

    // Sort directories first, then files
    const sorted = this.memoryTree.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.path.localeCompare(b.path);
    });

    sorted.forEach(node => {
      const item = this.createElement('div', 'memory-item');
      
      const icon = node.type === 'directory' ? '📁' : '📄';
      const name = node.path.split('/').pop();
      
      item.innerHTML = `
        <div class="memory-info">
          <span class="memory-icon">${icon}</span>
          <span class="memory-name" title="${node.path}">${name}</span>
        </div>
        <div class="memory-actions">
          ${node.type !== 'directory' ? `
            <button class="btn-secondary delete-memory-btn" data-path="${node.path}">
              删除
            </button>
          ` : ''}
        </div>
      `;
      
      // Add click handler for directories
      if (node.type === 'directory') {
        const infoDiv = item.querySelector('.memory-info');
        infoDiv.style.cursor = 'pointer';
        infoDiv.addEventListener('click', () => {
          this.loadMemories(node.path);
        });
      }
      
      // Add delete handler for files
      if (node.type !== 'directory') {
        const deleteBtn = item.querySelector('.delete-memory-btn');
        deleteBtn.addEventListener('click', () => this.deleteMemory(node.path));
      }
      
      container.appendChild(item);
    });
  }

  async deleteMemory(path) {
    if (!confirm(`确定要删除记忆: ${path}?`)) return;

    try {
      const sessionId = this.config.getSessionId();
      await this.api.delete('/memories', {
        body: { path, sessionId }
      });
      
      this.showStatus('记忆已删除');
      
      // Reload current directory
      await this.loadMemories(this.currentPath);
    } catch (error) {
      this.showStatus(`删除失败：${error.message}`, true);
    }
  }

  // Update memory enabled state in UI
  updateMemoryEnabledState() {
    const checkbox = this.element.querySelector('#memory-enabled');
    if (checkbox) {
      const config = this.config.getConfig();
      checkbox.checked = config.memoryEnabled;
    }
  }
}