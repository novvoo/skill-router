// Files module for file management interface
import { BaseModule } from './BaseModule.js';

export class FilesModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.currentPath = '';
    this.directoryContent = [];
  }

  async onActivate() {
    this.element = document.getElementById('files-page');
    if (!this.element) {
      console.error('Files page element not found');
      return;
    }

    this.setupEventListeners();
    await this.loadCurrentDirectory();
    await this.loadDirectoryContent();
  }

  setupEventListeners() {
    // Refresh button
    this.addEventListener('#refresh-files', 'click', () => this.refreshFiles());
    
    // Create directory button
    this.addEventListener('#create-directory-btn', 'click', () => this.showCreateDirectoryModal());
    
    // Create file button
    this.addEventListener('#create-file-btn', 'click', () => this.showCreateFileModal());
    
    // Set CWD button
    this.addEventListener('#set-cwd-btn', 'click', () => this.showSetCWDModal());
    
    // Create directory modal
    this.addEventListener('#submit-directory-btn', 'click', () => this.createDirectory());
    this.addEventListener('#cancel-directory-btn', 'click', () => this.hideCreateDirectoryModal());
    
    // Create file modal
    this.addEventListener('#submit-file-btn', 'click', () => this.createFile());
    this.addEventListener('#cancel-file-btn', 'click', () => this.hideCreateFileModal());
    
    // Set CWD modal
    this.addEventListener('#submit-cwd-btn', 'click', () => this.setCWD());
    this.addEventListener('#cancel-cwd-btn', 'click', () => this.hideSetCWDModal());
  }

  async loadCurrentDirectory() {
    try {
      const response = await this.api.get('/api/files/cwd');
      this.currentPath = response.cwd;
      this.updateCurrentDirectoryDisplay();
    } catch (error) {
      this.showStatus(`加载当前工作目录失败：${error.message}`, true);
    }
  }

  async loadDirectoryContent() {
    this.showLoading(true);
    try {
      const response = await this.api.get('/api/files', { path: this.currentPath });
      this.directoryContent = response.files || [];
      this.renderDirectoryContent();
      this.clearStatus();
    } catch (error) {
      this.showStatus(`加载目录内容失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  updateCurrentDirectoryDisplay() {
    const cwdElement = this.element.querySelector('#current-cwd');
    if (cwdElement) {
      cwdElement.textContent = this.currentPath;
    }
  }

  renderDirectoryContent() {
    const container = this.element.querySelector('#directory-content');
    if (!container) return;

    if (this.directoryContent.length === 0) {
      container.innerHTML = '<div class="empty-state">目录为空</div>';
      return;
    }

    container.innerHTML = this.directoryContent.map(item => this.renderFileItem(item)).join('');

    // Bind click events for directories
    container.querySelectorAll('.file-item.directory').forEach(item => {
      item.addEventListener('click', (e) => {
        const path = e.currentTarget.dataset.path;
        if (path) {
          this.navigateToDirectory(path);
        }
      });
    });
  }

  renderFileItem(item) {
    const isDirectory = item.type === 'directory';
    const icon = isDirectory ? '📁' : '📄';
    const itemClass = isDirectory ? 'file-item directory' : 'file-item';

    return `
      <div class="${itemClass}" data-path="${item.path}">
        <span class="file-icon">${icon}</span>
        <span class="file-name">${item.name}</span>
        ${!isDirectory ? `<span class="file-size">${this.formatFileSize(item.size)}</span>` : ''}
        <span class="file-mtime">${this.formatDate(item.mtime)}</span>
      </div>
    `;
  }

  formatFileSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  async navigateToDirectory(path) {
    this.currentPath = path;
    this.updateCurrentDirectoryDisplay();
    await this.loadDirectoryContent();
  }

  showCreateDirectoryModal() {
    const modal = this.element.querySelector('#create-directory-modal');
    const pathInput = this.element.querySelector('#directory-path');
    if (modal && pathInput) {
      pathInput.value = this.currentPath;
      modal.style.display = 'block';
    }
  }

  hideCreateDirectoryModal() {
    const modal = this.element.querySelector('#create-directory-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  showCreateFileModal() {
    const modal = this.element.querySelector('#create-file-modal');
    const pathInput = this.element.querySelector('#file-path');
    if (modal && pathInput) {
      pathInput.value = this.currentPath;
      modal.style.display = 'block';
    }
  }

  hideCreateFileModal() {
    const modal = this.element.querySelector('#create-file-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  showSetCWDModal() {
    const modal = this.element.querySelector('#set-cwd-modal');
    const cwdInput = this.element.querySelector('#new-cwd');
    if (modal && cwdInput) {
      cwdInput.value = this.currentPath;
      modal.style.display = 'block';
    }
  }

  hideSetCWDModal() {
    const modal = this.element.querySelector('#set-cwd-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  async createDirectory() {
    const nameInput = this.element.querySelector('#directory-name');
    const pathInput = this.element.querySelector('#directory-path');
    
    if (!nameInput || !pathInput) return;
    
    const name = nameInput.value.trim();
    const path = pathInput.value.trim();
    
    if (!name) {
      this.showStatus('请输入目录名称', true);
      return;
    }

    this.showLoading(true);
    try {
      await this.api.post('/api/files/directory', { name, path });
      this.showStatus('目录创建成功');
      this.hideCreateDirectoryModal();
      await this.loadDirectoryContent();
    } catch (error) {
      this.showStatus(`创建目录失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async createFile() {
    const nameInput = this.element.querySelector('#file-name');
    const pathInput = this.element.querySelector('#file-path');
    const contentInput = this.element.querySelector('#file-content');
    
    if (!nameInput || !pathInput || !contentInput) return;
    
    const name = nameInput.value.trim();
    const path = pathInput.value.trim();
    const content = contentInput.value;
    
    if (!name) {
      this.showStatus('请输入文件名称', true);
      return;
    }

    this.showLoading(true);
    try {
      await this.api.post('/api/files/file', { name, path, content });
      this.showStatus('文件创建成功');
      this.hideCreateFileModal();
      await this.loadDirectoryContent();
    } catch (error) {
      this.showStatus(`创建文件失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async setCWD() {
    const cwdInput = this.element.querySelector('#new-cwd');
    if (!cwdInput) return;
    
    const newCwd = cwdInput.value.trim();
    if (!newCwd) {
      this.showStatus('请输入工作目录路径', true);
      return;
    }

    this.showLoading(true);
    try {
      await this.api.post('/api/files/cwd', { path: newCwd });
      this.showStatus('工作目录设置成功');
      this.hideSetCWDModal();
      await this.loadCurrentDirectory();
      await this.loadDirectoryContent();
    } catch (error) {
      this.showStatus(`设置工作目录失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async refreshFiles() {
    await this.loadCurrentDirectory();
    await this.loadDirectoryContent();
    this.showStatus('文件列表已刷新');
  }
}
