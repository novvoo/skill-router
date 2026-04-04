import { BaseModule } from './BaseModule.js';

export class DeepSearchModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.element = document.getElementById('deepsearch-page');
    this.isSearching = false;
    this.abortController = null;
  }

  async onActivate() {
    this.bindEvents();
  }

  async onDeactivate() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  bindEvents() {
    this.addEventListener('#deepsearch-start', 'click', () => this.startSearch());
    this.addEventListener('#clear-deepsearch', 'click', () => this.clearResults());
    this.addEventListener('#deepsearch-query', 'keydown', (e) => {
      if (e.key === 'Enter') {
        this.startSearch();
      }
    });
  }

  clearResults() {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <p>输入关键词开始深度搜索</p>
      </div>
    `;
    this.hideProgress();
  }

  showProgress() {
    document.getElementById('search-progress').style.display = 'block';
  }

  hideProgress() {
    document.getElementById('search-progress').style.display = 'none';
  }

  updateProgress(text, percentage = 0) {
    document.getElementById('progress-text').textContent = text;
    document.getElementById('progress-fill').style.width = `${percentage}%`;
  }

  async startSearch() {
    if (this.isSearching) return;

    const query = document.getElementById('deepsearch-query').value.trim();
    if (!query) {
      alert('请输入搜索关键词');
      return;
    }

    this.isSearching = true;
    this.abortController = new AbortController();

    const depth = parseInt(document.getElementById('deepsearch-depth').value, 10);
    const maxResultsPerLevel = parseInt(document.getElementById('deepsearch-results').value, 10);
    const concurrentRequests = parseInt(document.getElementById('deepsearch-concurrent').value, 10);
    const fetchContent = document.getElementById('deepsearch-fetch').checked;

    const startBtn = document.getElementById('deepsearch-start');
    startBtn.disabled = true;
    startBtn.textContent = '搜索中...';

    this.showProgress();
    this.updateProgress('初始化搜索...', 5);

    try {
      const toolCall = {
        name: 'deep_search',
        arguments: {
          query,
          depth,
          maxResultsPerLevel,
          concurrentRequests,
          fetchContent
        }
      };

      const result = await this.api.executeTools([toolCall]);
      
      if (result && result.results && result.results[0]) {
        this.renderResults(result.results[0].data);
      } else {
        this.renderError('未获取到搜索结果');
      }
    } catch (error) {
      console.error('Deep search error:', error);
      this.renderError(error.message || '搜索失败');
    } finally {
      this.isSearching = false;
      this.abortController = null;
      startBtn.disabled = false;
      startBtn.textContent = '开始搜索';
      this.hideProgress();
    }
  }

  renderResults(data) {
    const resultsContainer = document.getElementById('search-results');
    
    if (!data || !data.levels || data.levels.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <p>没有找到结果</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="search-summary">
        <h3>搜索摘要</h3>
        <p>查询: <strong>${data.query}</strong></p>
        <p>总结果数: <strong>${data.totalResults}</strong></p>
        <p>搜索深度: <strong>${data.levels.length}</strong> 级</p>
        <p>耗时: <strong>${data.durationSeconds.toFixed(2)} 秒</strong></p>
      </div>
    `;

    for (const level of data.levels) {
      html += `
        <div class="level-results">
          <h4>第 ${level.level} 级: ${level.query}</h4>
          <div class="results-list">
      `;

      for (const result of level.results) {
        html += this.renderResultItem(result);
      }

      html += `
          </div>
        </div>
      `;
    }

    resultsContainer.innerHTML = html;
  }

  renderResultItem(result) {
    const contentPreview = result.content 
      ? `<div class="result-content">${this.escapeHtml(result.content.slice(0, 500))}${result.content.length > 500 ? '...' : ''}</div>`
      : '';

    return `
      <div class="result-item">
        <div class="result-header">
          <a href="${this.escapeHtml(result.url)}" target="_blank" class="result-title">${this.escapeHtml(result.title)}</a>
          <span class="result-level">Level ${result.level}</span>
        </div>
        ${result.snippet ? `<div class="result-snippet">${this.escapeHtml(result.snippet)}</div>` : ''}
        ${contentPreview}
        <div class="result-url">${this.escapeHtml(result.url)}</div>
      </div>
    `;
  }

  renderError(message) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = `
      <div class="error-state">
        <p>搜索出错: ${this.escapeHtml(message)}</p>
      </div>
    `;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
