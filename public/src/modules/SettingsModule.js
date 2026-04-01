// Settings and configuration module
import { BaseModule } from './BaseModule.js';

export class SettingsModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.embeddingJobs = [];
    this.ocrStatus = null;
    this.pollingInterval = null;
  }

  async onActivate() {
    this.element = document.getElementById('settings-page');
    if (!this.element) return;

    this.setupEventListeners();
    this.loadConfigToForm();
    await this.refreshEmbeddingsStatus();
    await this.refreshOcrStatus();
  }

  async onDeactivate() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  setupEventListeners() {
    // Config buttons
    this.addEventListener('#save-config', 'click', () => this.saveConfig());
    this.addEventListener('#clear-config', 'click', () => this.clearConfig());
    this.addEventListener('#test-connection', 'click', () => this.testConnection());
    
    // Custom headers
    this.addEventListener('#add-header', 'click', () => this.addCustomHeader());
    
    // Embeddings
    this.addEventListener('#refresh-embeddings', 'click', () => this.refreshEmbeddingsStatus());
    
    // OCR
    this.addEventListener('#refresh-ocr', 'click', () => this.refreshOcrStatus());
    this.addEventListener('#download-ocr', 'click', () => this.downloadOcr());
    
    // Listen for config changes
    this.config.onConfigChange(() => {
      this.loadConfigToForm();
    });
  }

  loadConfigToForm() {
    const config = this.config.getConfig();
    
    // Basic settings
    this.setFormData('#config-form', {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      embeddingModel: config.embeddingModel,
      hfEndpoint: config.hfEndpoint,
      ocrBackend: config.ocrBackend,
      ocrLanguage: config.ocrLanguage,
      ocrAutoDownload: config.ocrAutoDownload,
      memoryEnabled: config.memoryEnabled,
      systemContent: config.systemContent
    });
    
    // Custom headers
    this.renderCustomHeaders(config.defaultHeaders);
  }

  renderCustomHeaders(headers = []) {
    const container = this.element.querySelector('#custom-headers-container');
    if (!container) return;

    container.innerHTML = '';

    if (headers.length === 0) {
      this.addCustomHeader('', '');
      return;
    }

    headers.forEach(header => {
      this.addCustomHeader(header.key || '', header.value || '');
    });
  }

  addCustomHeader(key = '', value = '') {
    const container = this.element.querySelector('#custom-headers-container');
    if (!container) return;

    const headerRow = this.createElement('div', 'header-row');
    headerRow.innerHTML = `
      <input type="text" class="header-key" placeholder="Header名称" value="${key}">
      <input type="text" class="header-value" placeholder="Header值" value="${value}">
      <button type="button" class="btn-secondary remove-header-btn">删除</button>
    `;

    // Add remove functionality
    const removeBtn = headerRow.querySelector('.remove-header-btn');
    removeBtn.addEventListener('click', () => {
      headerRow.remove();
      // Ensure at least one empty row exists
      if (container.children.length === 0) {
        this.addCustomHeader('', '');
      }
    });

    container.appendChild(headerRow);
  }

  getCustomHeaders() {
    const container = this.element.querySelector('#custom-headers-container');
    if (!container) return [];

    const headers = [];
    const rows = container.querySelectorAll('.header-row');
    
    rows.forEach(row => {
      const key = row.querySelector('.header-key').value.trim();
      const value = row.querySelector('.header-value').value.trim();
      
      if (key || value) {
        headers.push({ key, value });
      }
    });

    return headers;
  }

  saveConfig() {
    const formData = this.getFormData('#config-form');
    const customHeaders = this.getCustomHeaders();
    
    const newConfig = {
      ...formData,
      defaultHeaders: customHeaders
    };
    
    this.config.saveConfig(newConfig);
    this.showStatus('配置已保存到浏览器本地');
  }

  clearConfig() {
    if (!confirm('确定要清空所有配置吗？')) return;
    
    this.config.clearConfig();
    this.loadConfigToForm();
    this.showStatus('配置已清空');
  }

  async testConnection() {
    const config = this.config.getConfig();
    
    if (!config.apiKey || !config.baseUrl || !config.model) {
      this.showStatus('请先保存 API Key、Base URL 和 Model 再测试', true);
      return;
    }

    this.showLoading(true);
    try {
      await this.api.post('/choose', {
        query: 'ping',
        ...(config.systemContent && { systemContent: config.systemContent })
      });
      
      this.showStatus('连接测试成功！后端可以使用当前配置调用模型');
    } catch (error) {
      this.showStatus(`连接测试失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async refreshEmbeddingsStatus() {
    try {
      const data = await this.api.get('/embeddings/status');
      this.renderEmbeddingsStatus(data);
      
      // Check if any downloads are in progress
      const presets = data.presets || [];
      const anyDownloading = presets.some(p => p.status === 'downloading');
      
      if (anyDownloading && !this.pollingInterval) {
        this.startPolling();
      } else if (!anyDownloading && this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
    } catch (error) {
      this.showStatus(`加载嵌入模型状态失败：${error.message}`, true);
    }
  }

  renderEmbeddingsStatus(data) {
    const container = this.element.querySelector('#embeddings-status');
    if (!container) return;

    const cacheDir = data.cache_dir || '';
    const hfEndpoint = data.hf_endpoint || 'https://huggingface.co';
    const presets = data.presets || [];

    let html = `
      <div class="status-info">
        <p><strong>缓存目录:</strong> ${cacheDir}</p>
        <p><strong>HF端点:</strong> ${hfEndpoint}</p>
      </div>
    `;

    if (presets.length === 0) {
      html += '<div class="empty-state">暂无嵌入模型预设</div>';
    } else {
      html += '<div class="presets-list">';
      presets.forEach(preset => {
        const statusClass = preset.status === 'downloaded' ? 'success' : 
                           preset.status === 'downloading' ? 'warning' : 
                           preset.status === 'error' ? 'error' : 'muted';
        
        const statusText = preset.status === 'downloaded' ? '已下载' :
                          preset.status === 'downloading' ? '下载中...' :
                          preset.status === 'error' ? '失败' : '未下载';

        html += `
          <div class="preset-item">
            <div class="preset-info">
              <h4>${preset.preset}</h4>
              <p>${preset.model_name || ''} ${preset.dimensions ? `(${preset.dimensions}d)` : ''}</p>
              <span class="status ${statusClass}">${statusText}</span>
            </div>
            <div class="preset-actions">
              <button class="btn-secondary download-preset-btn" 
                      data-preset="${preset.preset}"
                      ${preset.status === 'downloading' ? 'disabled' : ''}>
                ${preset.status === 'downloaded' ? '重新下载' : '下载'}
              </button>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    container.innerHTML = html;

    // Add download button listeners
    container.querySelectorAll('.download-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        const force = btn.textContent.includes('重新');
        this.downloadEmbeddingPreset(preset, force);
      });
    });
  }

  async downloadEmbeddingPreset(preset, force = false) {
    try {
      const config = this.config.getConfig();
      await this.api.post('/embeddings/download', {
        preset,
        force,
        ...(config.hfEndpoint && { hf_endpoint: config.hfEndpoint })
      });
      
      this.showStatus(`已触发下载：${preset}`);
      this.startPolling();
    } catch (error) {
      this.showStatus(`触发下载失败：${error.message}`, true);
    }
  }

  async refreshOcrStatus() {
    try {
      const data = await this.api.get('/ocr/status');
      this.ocrStatus = data;
      this.renderOcrStatus(data);
    } catch (error) {
      this.showStatus(`加载OCR状态失败：${error.message}`, true);
    }
  }

  renderOcrStatus(data) {
    const container = this.element.querySelector('#ocr-status');
    if (!container) return;

    const tesseractOk = data.backends?.tesseract?.available || false;
    const guten = data.backends?.['guten-ocr'] || {};
    const gutenStatus = guten.status || 'not_downloaded';

    let html = `
      <div class="status-info">
        <p><strong>自动下载默认:</strong> ${data.auto_download_default ? '开启' : '关闭'}</p>
      </div>
      <div class="backends-list">
        <div class="backend-item">
          <div class="backend-info">
            <h4>Tesseract (系统)</h4>
            <span class="status ${tesseractOk ? 'success' : 'error'}">
              ${tesseractOk ? '可用' : '不可用'}
            </span>
          </div>
        </div>
        <div class="backend-item">
          <div class="backend-info">
            <h4>Guten-OCR</h4>
            <p>${guten.available ? '可用' : '不可用'} · ${guten.registered ? '已注册' : '未注册'}</p>
            <span class="status ${gutenStatus === 'downloaded' ? 'success' : 
                                 gutenStatus === 'downloading' ? 'warning' : 
                                 gutenStatus === 'error' ? 'error' : 'muted'}">
              ${gutenStatus === 'downloaded' ? '已下载' :
                gutenStatus === 'downloading' ? '下载中...' :
                gutenStatus === 'error' ? '失败' : '未下载'}
            </span>
          </div>
          <div class="backend-actions">
            <button class="btn-secondary download-guten-btn" 
                    ${gutenStatus === 'downloading' ? 'disabled' : ''}>
              ${gutenStatus === 'downloaded' ? '重新下载' : '下载'}
            </button>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Add download button listener
    const downloadBtn = container.querySelector('.download-guten-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadOcr());
    }
  }

  async downloadOcr() {
    try {
      const config = this.config.getConfig();
      const language = config.ocrLanguage || 'eng';
      
      await this.api.post('/ocr/download', {
        backend: 'guten-ocr',
        language,
        ...(config.hfEndpoint && { hf_endpoint: config.hfEndpoint })
      });
      
      this.showStatus(`已触发下载：guten-ocr (${language})`);
      this.startPolling();
    } catch (error) {
      this.showStatus(`触发下载失败：${error.message}`, true);
    }
  }

  startPolling() {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(async () => {
      try {
        await this.refreshEmbeddingsStatus();
        await this.refreshOcrStatus();
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);
  }
}