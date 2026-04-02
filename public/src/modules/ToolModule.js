// Tool management module
import { BaseModule } from './BaseModule.js';

export class ToolModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.availableTools = [];
    this.executionHistory = [];
    this.selectedTool = null;
  }

  async onActivate() {
    this.element = document.getElementById('tools-page');
    if (!this.element) return;

    this.setupEventListeners();
    await this.loadTools();
  }

  setupEventListeners() {
    // Refresh button
    this.addEventListener('#refresh-tools', 'click', () => this.loadTools());
    
    // Execute tool modal buttons
    this.addEventListener('#execute-tool-btn', 'click', () => this.executeTool());
    this.addEventListener('#cancel-execute-btn', 'click', () => this.hideExecuteModal());
  }

  async loadTools() {
    this.showLoading(true);
    try {
      const data = await this.api.getTools();
      
      // Add defensive checks for the response format
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from tools API');
      }
      
      this.availableTools = Array.isArray(data.tools) ? data.tools : [];
      
      this.renderToolsList();
      this.clearStatus();
    } catch (error) {
      console.error('Failed to load tools:', error);
      this.showStatus(`加载失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  renderToolsList() {
    const container = this.element.querySelector('#tools-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.availableTools.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无可用的工具</div>';
      return;
    }

    this.availableTools.forEach(tool => {
      const card = this.createElement('div', 'tool-card');
      
      card.innerHTML = `
        <div class="tool-header">
          <h3>${tool.name}</h3>
          <span class="tool-type ${tool.isReadOnly ? 'readonly' : 'readwrite'}">
            ${tool.isReadOnly ? '只读' : '读写'}
          </span>
        </div>
        <p class="tool-description">${tool.searchHint || tool.description || '无描述'}</p>
        <div class="tool-actions">
          <button class="btn-primary execute-tool-btn" data-tool-name="${tool.name}">
            执行
          </button>
          <button class="btn-secondary test-tool-btn" data-tool-name="${tool.name}">
            测试样例
          </button>
        </div>
      `;
      
      // Add execute button event listener
      const executeBtn = card.querySelector('.execute-tool-btn');
      executeBtn.addEventListener('click', () => this.showExecuteModal(tool));
      
      // Add test button event listener
      const testBtn = card.querySelector('.test-tool-btn');
      testBtn.addEventListener('click', () => this.showTestExamples(tool));
      
      container.appendChild(card);
    });
  }

  showExecuteModal(tool) {
    this.selectedTool = tool;
    const modal = this.element.querySelector('#execute-tool-modal');
    const title = modal.querySelector('#execute-tool-title');
    const paramsContainer = modal.querySelector('#tool-params-container');
    
    title.textContent = `执行工具: ${tool.name}`;
    paramsContainer.innerHTML = '';
    
    // Generate form fields based on tool schema
    if (tool.parameters && tool.parameters.properties) {
      Object.entries(tool.parameters.properties).forEach(([key, schema]) => {
        const fieldDiv = this.createElement('div', 'form-field');
        
        const label = this.createElement('label');
        label.textContent = key;
        label.setAttribute('for', `param_${key}`);
        
        if (tool.parameters.required && tool.parameters.required.includes(key)) {
          label.textContent += ' *';
        }
        
        const input = this.createInputForSchema(key, schema);
        input.id = `param_${key}`;
        input.name = key;
        
        if (tool.parameters.required && tool.parameters.required.includes(key)) {
          input.required = true;
        }
        
        fieldDiv.appendChild(label);
        fieldDiv.appendChild(input);
        paramsContainer.appendChild(fieldDiv);
      });
    }
    
    modal.style.display = 'block';
  }

  createInputForSchema(paramKey, schema) {
    const type = schema.type || 'string';
    
    switch (type) {
      case 'boolean':
        const checkbox = this.createElement('input');
        checkbox.type = 'checkbox';
        return checkbox;
        
      case 'number':
      case 'integer':
        const numberInput = this.createElement('input');
        numberInput.type = 'number';
        if (schema.minimum !== undefined) numberInput.min = schema.minimum;
        if (schema.maximum !== undefined) numberInput.max = schema.maximum;
        if (schema.description) numberInput.placeholder = schema.description;
        return numberInput;
        
      case 'array':
        const textarea = this.createElement('textarea');
        textarea.placeholder = 'Enter JSON array, e.g., ["item1", "item2"]';
        textarea.rows = 3;
        return textarea;
        
      case 'object':
        const objectTextarea = this.createElement('textarea');
        objectTextarea.placeholder = 'Enter JSON object, e.g., {"key": "value"}';
        objectTextarea.rows = 4;
        return objectTextarea;
        
      default:
        const textInput = this.createElement('input');
        textInput.type = 'text';
        if (schema.description) textInput.placeholder = schema.description;
        return textInput;
    }
  }

  hideExecuteModal() {
    const modal = this.element.querySelector('#execute-tool-modal');
    modal.style.display = 'none';
    this.selectedTool = null;
  }

  showTestExamples(tool) {
    const modal = this.createElement('div', 'modal');
    modal.id = 'tool-test-examples-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${tool.name} - 测试样例</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div id="test-examples-content"></div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const content = modal.querySelector('#test-examples-content');
    content.innerHTML = this.getToolTestExamples(tool.name);
    
    // Add close button event listener
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => modal.remove());
    
    // Add click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // Add copy example button event listeners
    modal.querySelectorAll('.copy-example-btn').forEach(button => {
      button.addEventListener('click', async (e) => {
        const example = e.target.getAttribute('data-example');
        try {
          await navigator.clipboard.writeText(example);
          this.showStatus('测试样例已复制到剪贴板', false);
        } catch (err) {
          console.error('无法复制到剪贴板:', err);
          this.showStatus('复制失败', true);
        }
      });
    });
    
    // Add execute example button event listeners
    modal.querySelectorAll('.execute-example-btn').forEach(button => {
      button.addEventListener('click', async (e) => {
        const toolName = e.target.getAttribute('data-tool');
        const paramsStr = e.target.getAttribute('data-params');
        
        try {
          const params = JSON.parse(paramsStr);
          
          // Find the tool in available tools
          const tool = this.availableTools.find(t => t.name === toolName);
          if (!tool) {
            this.showStatus(`工具 ${toolName} 不存在`, true);
            return;
          }
          
          // Close the test examples modal
          modal.remove();
          
          // Show the execute modal with the example params
          this.showExecuteModal(tool);
          
          // Fill the form with the example params after a short delay to ensure form fields are generated
          setTimeout(() => {
            const form = this.element.querySelector('#tool-execute-form');
            Object.entries(params).forEach(([key, value]) => {
              const input = form.querySelector(`[name="${key}"]`);
              if (input) {
                if (input.type === 'checkbox') {
                  input.checked = value;
                } else if (input.type === 'number') {
                  input.value = value;
                } else if (input.tagName === 'TEXTAREA') {
                  if (typeof value === 'object') {
                    input.value = JSON.stringify(value, null, 2);
                  } else {
                    input.value = value;
                  }
                } else {
                  input.value = value;
                }
              }
            });
          }, 100);
          
        } catch (err) {
          console.error('执行测试样例失败:', err);
          this.showStatus('执行测试样例失败', true);
        }
      });
    });
    
    modal.style.display = 'block';
  }

  getToolTestExamples(toolName) {
    const examples = {
      'bash': `
        <div class="test-example">
          <h4>测试样例 1: 列出当前目录内容</h4>
          <pre class="code-block">ls -la</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example="ls -la">复制</button>
            <button class="btn-primary execute-example-btn" data-tool="bash" data-params="{\"command\": \"ls -la\"}">执行</button>
          </div>
        </div>
        
        <div class="test-example">
          <h4>测试样例 2: 创建一个新文件</h4>
          <pre class="code-block">echo "Hello, World!" > test.txt</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example="echo \"Hello, World!\" > test.txt">复制</button>
            <button class="btn-primary execute-example-btn" data-tool="bash" data-params='{"command": "echo \"Hello, World!\" > test.txt"}'>执行</button>
          </div>
        </div>
        
        <div class="test-example">
          <h4>测试样例 3: 查看文件内容</h4>
          <pre class="code-block">cat test.txt</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example="cat test.txt">复制</button>
            <button class="btn-primary execute-example-btn" data-tool="bash" data-params="{\"command\": \"cat test.txt\"}">执行</button>
          </div>
        </div>
      `,
      'file_read': `
        <div class="test-example">
          <h4>测试样例 1: 读取文件内容</h4>
          <pre class="code-block">{
  "path": "test.txt"
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"path": "test.txt"}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="file_read" data-params='{"path": "test.txt"}'>执行</button>
          </div>
        </div>
      `,
      'file_write': `
        <div class="test-example">
          <h4>测试样例 1: 写入文件</h4>
          <pre class="code-block">{
  "path": "output.txt",
  "content": "Hello from file_write tool!",
  "create_dirs": true
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"path": "output.txt", "content": "Hello from file_write tool!", "create_dirs": true}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="file_write" data-params='{"path": "output.txt", "content": "Hello from file_write tool!", "create_dirs": true}'>执行</button>
          </div>
        </div>
      `,
      'file_edit': `
        <div class="test-example">
          <h4>测试样例 1: 编辑文件</h4>
          <pre class="code-block">{
  "path": "test.txt",
  "old_str": "Hello",
  "new_str": "Hello, World!"
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"path": "test.txt", "old_str": "Hello", "new_str": "Hello, World!"}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="file_edit" data-params='{"path": "test.txt", "old_str": "Hello", "new_str": "Hello, World!"}'>执行</button>
          </div>
        </div>
      `,
      'grep': `
        <div class="test-example">
          <h4>测试样例 1: 搜索文件内容</h4>
          <pre class="code-block">{
  "pattern": "Hello",
  "path": "test.txt"
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"pattern": "Hello", "path": "test.txt"}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="grep" data-params='{"pattern": "Hello", "path": "test.txt"}'>执行</button>
          </div>
        </div>
      `,
      'glob': `
        <div class="test-example">
          <h4>测试样例 1: 匹配文件路径</h4>
          <pre class="code-block">{
  "pattern": "*.txt"
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"pattern": "*.txt"}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="glob" data-params='{"pattern": "*.txt"}'>执行</button>
          </div>
        </div>
      `,
      'web_search': `
        <div class="test-example">
          <h4>测试样例 1: 搜索网络信息</h4>
          <pre class="code-block">{
  "query": "Skill-Router"
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"query": "Skill-Router"}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="web_search" data-params='{"query": "Skill-Router"}'>执行</button>
          </div>
        </div>
      `,
      'web_fetch': `
        <div class="test-example">
          <h4>测试样例 1: 获取网页内容</h4>
          <pre class="code-block">{
  "url": "https://example.com"
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"url": "https://example.com"}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="web_fetch" data-params='{"url": "https://example.com"}'>执行</button>
          </div>
        </div>
      `
    };
    
    return examples[toolName] || '<p>暂无测试样例</p>';
  }

  async executeTool() {
    if (!this.selectedTool) return;

    const form = this.element.querySelector('#tool-execute-form');
    const formData = new FormData(form);
    const params = {};

    // Collect form data
    for (const [key, value] of formData.entries()) {
      const input = form.querySelector(`[name="${key}"]`);
      
      if (input.type === 'checkbox') {
        params[key] = input.checked;
      } else if (input.type === 'number') {
        params[key] = parseFloat(value) || 0;
      } else if (input.tagName === 'TEXTAREA' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          params[key] = JSON.parse(value);
        } catch (e) {
          this.showStatus(`Invalid JSON for ${key}: ${e.message}`, true);
          return;
        }
      } else {
        params[key] = value;
      }
    }

    this.showLoading(true);
    try {
      const result = await this.api.executeTools([{
        id: `tool_${Date.now()}`,
        name: this.selectedTool.name,
        arguments: params
      }]);

      this.hideExecuteModal();
      this.showToolResult(result);
      this.addToExecutionHistory(this.selectedTool.name, params, result);

    } catch (error) {
      this.showStatus(`工具执行失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  showToolResult(result) {
    const modal = this.element.querySelector('#tool-result-modal');
    const content = modal.querySelector('#tool-result-content');
    
    let resultHtml = '';
    
    if (result.results && Array.isArray(result.results)) {
      result.results.forEach((toolResult) => {
        resultHtml += `<div class="tool-result-item">`;
        resultHtml += `<h4>工具: ${toolResult.name} (${toolResult.duration}ms)</h4>`;
        
        if (toolResult.error) {
          resultHtml += `<div class="error">错误: ${toolResult.error}</div>`;
        } else {
          const resultStr = typeof toolResult.result === 'string' 
            ? toolResult.result 
            : JSON.stringify(toolResult.result, null, 2);
          resultHtml += `<pre class="tool-result-data">${resultStr}</pre>`;
        }
        
        resultHtml += `</div>`;
      });
    }
    
    if (result.formatted) {
      resultHtml += `<div class="formatted-result">`;
      resultHtml += `<h4>格式化结果:</h4>`;
      resultHtml += `<div class="markdown-content">${result.formatted}</div>`;
      resultHtml += `</div>`;
    }
    
    content.innerHTML = resultHtml;
    modal.style.display = 'block';
  }

  addToExecutionHistory(toolName, params, result) {
    const historyItem = {
      id: Date.now(),
      toolName,
      params,
      result,
      timestamp: new Date().toISOString(),
      success: !result.results?.some(r => r.error)
    };
    
    this.executionHistory.unshift(historyItem);
    
    // Keep only last 50 executions
    if (this.executionHistory.length > 50) {
      this.executionHistory = this.executionHistory.slice(0, 50);
    }
    
    this.renderExecutionHistory();
  }

  renderExecutionHistory() {
    const container = this.element.querySelector('#execution-history-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.executionHistory.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无执行历史</div>';
      return;
    }

    this.executionHistory.forEach(item => {
      const card = this.createElement('div', 'history-item');
      
      const time = new Date(item.timestamp).toLocaleString();
      const status = item.success ? '✅' : '❌';
      
      card.innerHTML = `
        <div class="history-info">
          <h4>${status} ${item.toolName}</h4>
          <p class="history-time">${time}</p>
        </div>
        <div class="history-actions">
          <button class="btn-secondary view-history-btn">查看</button>
        </div>
      `;
      
      // Add view button event listener
      const viewBtn = card.querySelector('.view-history-btn');
      viewBtn.addEventListener('click', () => this.showHistoryDetail(item));
      
      container.appendChild(card);
    });
  }

  showHistoryDetail(item) {
    const modal = this.element.querySelector('#history-detail-modal');
    const content = modal.querySelector('#history-detail-content');
    
    const paramsStr = JSON.stringify(item.params, null, 2);
    const resultStr = JSON.stringify(item.result, null, 2);
    
    content.innerHTML = `
      <h3>${item.toolName}</h3>
      <p><strong>执行时间:</strong> ${new Date(item.timestamp).toLocaleString()}</p>
      <p><strong>状态:</strong> ${item.success ? '成功' : '失败'}</p>
      
      <h4>参数:</h4>
      <pre class="code-block">${paramsStr}</pre>
      
      <h4>结果:</h4>
      <pre class="code-block">${resultStr}</pre>
    `;
    
    modal.style.display = 'block';
  }
}