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

  async editFile(path, content) {
    this.showLoading(true);
    try {
      await this.api.post('/api/files/edit', { path, content });
      this.showStatus('文件编辑成功');
      await this.loadDirectoryContent();
    } catch (error) {
      this.showStatus(`编辑文件失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async renameFile(oldPath, newPath) {
    this.showLoading(true);
    try {
      await this.api.post('/api/files/rename', { oldPath, newPath });
      this.showStatus('文件重命名成功');
      await this.loadDirectoryContent();
    } catch (error) {
      this.showStatus(`重命名文件失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async copyFile(sourcePath, destinationPath) {
    this.showLoading(true);
    try {
      await this.api.post('/api/files/copy', { sourcePath, destinationPath });
      this.showStatus('文件复制成功');
      await this.loadDirectoryContent();
    } catch (error) {
      this.showStatus(`复制文件失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async moveFile(sourcePath, destinationPath) {
    this.showLoading(true);
    try {
      await this.api.post('/api/files/move', { oldPath: sourcePath, newPath: destinationPath });
      this.showStatus('文件移动成功');
      await this.loadDirectoryContent();
    } catch (error) {
      this.showStatus(`移动文件失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async searchFiles(query, options = {}) {
    this.showLoading(true);
    try {
      const response = await this.api.post('/api/files/search', { query, options });
      return response;
    } catch (error) {
      this.showStatus(`搜索文件失败：${error.message}`, true);
      return [];
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

    // Bind click events for file operations
    container.querySelectorAll('.file-item:not(.directory)').forEach(item => {
      // Edit file
      const editBtn = item.querySelector('.file-action.edit');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const path = item.dataset.path;
          this.showEditFileModal(path);
        });
      }

      // Rename file
      const renameBtn = item.querySelector('.file-action.rename');
      if (renameBtn) {
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const path = item.dataset.path;
          this.showRenameFileModal(path);
        });
      }

      // Copy file
      const copyBtn = item.querySelector('.file-action.copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const path = item.dataset.path;
          this.showCopyFileModal(path);
        });
      }

      // Move file
      const moveBtn = item.querySelector('.file-action.move');
      if (moveBtn) {
        moveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const path = item.dataset.path;
          this.showMoveFileModal(path);
        });
      }
    });
  }

  renderFileItem(item) {
    const isDirectory = item.type === 'directory';
    const icon = isDirectory ? '📁' : '📄';
    const itemClass = isDirectory ? 'file-item directory' : 'file-item';

    const fileActions = !isDirectory ? `
      <div class="file-actions">
        <button class="file-action edit" title="编辑文件">✏️</button>
        <button class="file-action rename" title="重命名文件">📝</button>
        <button class="file-action copy" title="复制文件">📋</button>
        <button class="file-action move" title="移动文件">📦</button>
      </div>
    ` : '';

    return `
      <div class="${itemClass}" data-path="${item.path}">
        <span class="file-icon">${icon}</span>
        <span class="file-name">${item.name}</span>
        ${!isDirectory ? `<span class="file-size">${this.formatFileSize(item.size)}</span>` : ''}
        <span class="file-mtime">${this.formatDate(item.mtime)}</span>
        ${fileActions}
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

  // Edit file modal
  showEditFileModal(filePath) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>编辑文件</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="edit-file-form">
            <div class="form-group">
              <label>文件路径</label>
              <input type="text" value="${filePath}" disabled>
            </div>
            <div class="form-group">
              <label>文件内容</label>
              <textarea id="edit-file-content" rows="10"></textarea>
            </div>
            <div class="form-actions">
              <button id="submit-edit-file-btn" type="button" class="btn-primary">保存</button>
              <button id="cancel-edit-file-btn" type="button" class="btn-secondary">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Load file content
    this.loadFileContent(filePath).then(content => {
      const contentInput = modal.querySelector('#edit-file-content');
      if (contentInput) {
        contentInput.value = content;
      }
    });

    // Bind events
    modal.querySelector('#submit-edit-file-btn').addEventListener('click', async () => {
      const content = modal.querySelector('#edit-file-content').value;
      await this.editFile(filePath, content);
      modal.remove();
    });

    modal.querySelector('#cancel-edit-file-btn').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // Rename file modal
  showRenameFileModal(oldPath) {
    const fileName = oldPath.split('/').pop();
    const directory = oldPath.substring(0, oldPath.lastIndexOf('/'));

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>重命名文件</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="rename-file-form">
            <div class="form-group">
              <label>当前路径</label>
              <input type="text" value="${oldPath}" disabled>
            </div>
            <div class="form-group">
              <label>新文件名</label>
              <input type="text" id="new-file-name" value="${fileName}">
            </div>
            <div class="form-actions">
              <button id="submit-rename-file-btn" type="button" class="btn-primary">重命名</button>
              <button id="cancel-rename-file-btn" type="button" class="btn-secondary">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Bind events
    modal.querySelector('#submit-rename-file-btn').addEventListener('click', async () => {
      const newFileName = modal.querySelector('#new-file-name').value;
      const newPath = directory + '/' + newFileName;
      await this.renameFile(oldPath, newPath);
      modal.remove();
    });

    modal.querySelector('#cancel-rename-file-btn').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // Copy file modal
  showCopyFileModal(sourcePath) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>复制文件</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="copy-file-form">
            <div class="form-group">
              <label>源文件</label>
              <input type="text" value="${sourcePath}" disabled>
            </div>
            <div class="form-group">
              <label>目标路径</label>
              <input type="text" id="copy-destination-path" value="${sourcePath}">
            </div>
            <div class="form-actions">
              <button id="submit-copy-file-btn" type="button" class="btn-primary">复制</button>
              <button id="cancel-copy-file-btn" type="button" class="btn-secondary">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Bind events
    modal.querySelector('#submit-copy-file-btn').addEventListener('click', async () => {
      const destinationPath = modal.querySelector('#copy-destination-path').value;
      await this.copyFile(sourcePath, destinationPath);
      modal.remove();
    });

    modal.querySelector('#cancel-copy-file-btn').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // Move file modal
  showMoveFileModal(sourcePath) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>移动文件</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="move-file-form">
            <div class="form-group">
              <label>源文件</label>
              <input type="text" value="${sourcePath}" disabled>
            </div>
            <div class="form-group">
              <label>目标路径</label>
              <input type="text" id="move-destination-path" value="${sourcePath}">
            </div>
            <div class="form-actions">
              <button id="submit-move-file-btn" type="button" class="btn-primary">移动</button>
              <button id="cancel-move-file-btn" type="button" class="btn-secondary">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Bind events
    modal.querySelector('#submit-move-file-btn').addEventListener('click', async () => {
      const destinationPath = modal.querySelector('#move-destination-path').value;
      await this.moveFile(sourcePath, destinationPath);
      modal.remove();
    });

    modal.querySelector('#cancel-move-file-btn').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // Load file content
  async loadFileContent(filePath) {
    try {
      const response = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        throw new Error('Failed to load file');
      }
      const data = await response.json();
      return data.content;
    } catch (error) {
      console.error('Error loading file:', error);
      return '';
    }
  }
}
