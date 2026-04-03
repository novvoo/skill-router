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
    this.renderTerminalToolsMenu();
    this.initializeTerminal();
  }

  initializeTerminal() {
    // Clear terminal output on load
    const terminalOutput = document.getElementById('tools-terminal-output');
    if (terminalOutput) {
      terminalOutput.innerHTML = '<div class="terminal-line system">欢迎使用工具终端</div>';
    }
  }

  addTerminalOutput(text, isSystem = false) {
    const terminalOutput = document.getElementById('tools-terminal-output');
    if (!terminalOutput) return;

    const line = document.createElement('div');
    line.className = `terminal-line ${isSystem ? 'system' : 'user'}`;
    line.textContent = text;
    terminalOutput.appendChild(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  clearTerminal() {
    const terminalOutput = document.getElementById('tools-terminal-output');
    if (terminalOutput) {
      terminalOutput.innerHTML = '<div class="terminal-line system">终端已清空</div>';
    }
  }

  setupEventListeners() {
    // Refresh button
    this.addEventListener('#refresh-tools', 'click', () => this.loadTools());
    
    // Terminal page refresh button
    this.addEventListener('#refresh-tools-terminal', 'click', () => this.loadTools());
    
    // Execute tool modal buttons
    this.addEventListener('#execute-tool-btn', 'click', () => this.executeTool());
    this.addEventListener('#cancel-execute-btn', 'click', () => this.hideExecuteModal());
    
    // Terminal tool button
    this.addEventListener('#open-terminal-btn', 'click', () => this.openTerminal());
    
    // Tools terminal clear button
    this.addEventListener('#clear-tools-terminal', 'click', () => this.clearTerminal());
    
    // Tools terminal input
    const terminalInput = document.getElementById('tools-terminal-input');
    if (terminalInput) {
      terminalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const command = terminalInput.value.trim();
          if (command) {
            this.addTerminalOutput(`$ ${command}`, false);
            terminalInput.value = '';
            this.handleTerminalCommand(command);
          }
        }
      });
    }
  }

  async handleTerminalCommand(command) {
    // 检查是否正在执行工具
    if (this.selectedTool) {
      // 处理工具参数输入
      if (command.toLowerCase() === 'cancel') {
        this.addTerminalOutput('执行已取消', true);
        this.selectedTool = null;
        return;
      }
      
      // 解析参数
      const params = this.parseToolParameters(command, this.selectedTool);
      if (params === null) {
        return;
      }
      
      // 执行工具
      await this.executeToolFromTerminal(params);
      return;
    }
    
    try {
      // Add loading message
      this.addTerminalOutput('执行中...', true);
      
      // Execute the command using the terminal tool
      const result = await this.api.executeTools([{
        id: `tool_${Date.now()}`,
        name: 'terminal',
        arguments: {
          command: command,
          wait_ms: 3000,
          clear_buffer: false
        }
      }]);
      
      // Clear loading message and add result
      const terminalOutput = document.getElementById('tools-terminal-output');
      if (terminalOutput) {
        const lines = terminalOutput.children;
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          if (lastLine.textContent === '执行中...') {
            terminalOutput.removeChild(lastLine);
          }
        }
      }
      
      // Add result to terminal
      if (result.results && result.results.length > 0) {
        const toolResult = result.results[0];
        if (toolResult.error) {
          this.addTerminalOutput(`错误: ${toolResult.error}`, true);
        } else if (toolResult.result) {
          const output = typeof toolResult.result === 'string' 
            ? toolResult.result 
            : JSON.stringify(toolResult.result, null, 2);
          this.addTerminalOutput(output, true);
        }
      }
    } catch (error) {
      this.addTerminalOutput(`错误: ${error.message}`, true);
    }
  }
  
  parseToolParameters(input, tool) {
    const params = {};
    const parts = input.split(' ');
    
    for (const part of parts) {
      if (!part.includes('=')) {
        this.addTerminalOutput(`参数格式错误: ${part} (正确格式: 参数名=值)`, true);
        return null;
      }
      
      const [key, ...valueParts] = part.split('=');
      const value = valueParts.join('=');
      
      // 验证参数是否存在
      if (!tool.parameters.properties[key]) {
        this.addTerminalOutput(`未知参数: ${key}`, true);
        return null;
      }
      
      // 类型转换
      const schema = tool.parameters.properties[key];
      let parsedValue;
      
      switch (schema.type) {
        case 'boolean':
          parsedValue = value.toLowerCase() === 'true' || value === '1';
          break;
        case 'number':
        case 'integer':
          parsedValue = parseFloat(value);
          if (isNaN(parsedValue)) {
            this.addTerminalOutput(`参数 ${key} 必须是数字`, true);
            return null;
          }
          break;
        case 'array':
          try {
            parsedValue = JSON.parse(value);
            if (!Array.isArray(parsedValue)) {
              throw new Error('不是数组');
            }
          } catch (e) {
            this.addTerminalOutput(`参数 ${key} 必须是有效的 JSON 数组`, true);
            return null;
          }
          break;
        case 'object':
          try {
            parsedValue = JSON.parse(value);
            if (typeof parsedValue !== 'object' || parsedValue === null) {
              throw new Error('不是对象');
            }
          } catch (e) {
            this.addTerminalOutput(`参数 ${key} 必须是有效的 JSON 对象`, true);
            return null;
          }
          break;
        default:
          parsedValue = value;
      }
      
      params[key] = parsedValue;
    }
    
    // 检查必填参数
    if (tool.parameters.required) {
      for (const requiredParam of tool.parameters.required) {
        if (!(requiredParam in params)) {
          this.addTerminalOutput(`缺少必填参数: ${requiredParam}`, true);
          return null;
        }
      }
    }
    
    // 设置默认值
    Object.entries(tool.parameters.properties).forEach(([key, schema]) => {
      if (!(key in params) && schema.default !== undefined) {
        params[key] = schema.default;
      }
    });
    
    return params;
  }
  
  async executeToolFromTerminal(params) {
    if (!this.selectedTool) return;
    
    this.addTerminalOutput('执行中...', true);
    
    try {
      const result = await this.api.executeTools([{
        id: `tool_${Date.now()}`,
        name: this.selectedTool.name,
        arguments: params
      }]);
      
      // 清除加载消息
      const terminalOutput = document.getElementById('tools-terminal-output');
      if (terminalOutput) {
        const lines = terminalOutput.children;
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          if (lastLine.textContent === '执行中...') {
            terminalOutput.removeChild(lastLine);
          }
        }
      }
      
      // 显示执行结果
      this.addTerminalOutput('=== 执行结果 ===', true);
      if (result.results && Array.isArray(result.results)) {
        result.results.forEach((toolResult) => {
          this.addTerminalOutput(`工具: ${toolResult.name} (${toolResult.duration}ms)`, true);
          
          if (toolResult.error) {
            this.addTerminalOutput(`错误: ${toolResult.error}`, true);
          } else {
            const resultStr = typeof toolResult.result === 'string' 
              ? toolResult.result 
              : JSON.stringify(toolResult.result, null, 2);
            this.addTerminalOutput(resultStr, true);
          }
        });
      }
      
      if (result.formatted) {
        this.addTerminalOutput('=== 格式化结果 ===', true);
        this.addTerminalOutput(result.formatted, true);
      }
      
      // 添加到执行历史
      this.addToExecutionHistory(this.selectedTool.name, params, result);
      
    } catch (error) {
      this.addTerminalOutput(`工具执行失败: ${error.message}`, true);
    } finally {
      // 重置选中的工具
      this.selectedTool = null;
    }
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
      
      // Use default tools if no tools are available
      if (this.availableTools.length === 0) {
        this.availableTools = this.getDefaultTools();
      } else {
        // 补全工具的参数定义
        const defaultTools = this.getDefaultTools();
        this.availableTools = this.availableTools.map(tool => {
          const defaultTool = defaultTools.find(t => t.name === tool.name);
          if (defaultTool && (!tool.parameters || !tool.parameters.properties || Object.keys(tool.parameters.properties).length === 0)) {
            return {
              ...tool,
              parameters: defaultTool.parameters
            };
          }
          return tool;
        });
      }
      
      this.renderToolsList();
      this.renderTerminalToolsMenu();
      this.clearStatus();
    } catch (error) {
      console.error('Failed to load tools:', error);
      // Use default tools on error
      this.availableTools = this.getDefaultTools();
      this.renderToolsList();
      this.renderTerminalToolsMenu();
      this.showStatus(`使用默认工具列表：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  getDefaultTools() {
    return [
      {
        name: 'bash',
        description: '执行bash命令',
        searchHint: '执行shell命令',
        isReadOnly: false,
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: '要执行的bash命令'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'file_read',
        description: '读取文件内容',
        searchHint: '读取文件',
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'file_write',
        description: '写入文件内容',
        searchHint: '写入文件',
        isReadOnly: false,
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径'
            },
            content: {
              type: 'string',
              description: '文件内容'
            },
            create_dirs: {
              type: 'boolean',
              description: '是否创建目录'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'file_edit',
        description: '编辑文件内容',
        searchHint: '编辑文件',
        isReadOnly: false,
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径'
            },
            old_str: {
              type: 'string',
              description: '要替换的旧字符串'
            },
            new_str: {
              type: 'string',
              description: '替换的新字符串'
            }
          },
          required: ['path', 'old_str', 'new_str']
        }
      },
      {
        name: 'grep',
        description: '搜索文件内容',
        searchHint: '搜索文件',
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: '搜索模式'
            },
            path: {
              type: 'string',
              description: '文件路径'
            }
          },
          required: ['pattern', 'path']
        }
      },
      {
        name: 'glob',
        description: '匹配文件路径',
        searchHint: '匹配文件',
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: '文件路径模式'
            }
          },
          required: ['pattern']
        }
      },
      {
        name: 'web_search',
        description: '搜索网络信息',
        searchHint: '网络搜索',
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询'
            },
            adapter: {
              type: 'string',
              description: '搜索适配器 (e.g., bing)',
              default: 'bing'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'web_fetch',
        description: '获取网页内容',
        searchHint: '获取网页',
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: '网页URL'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'terminal',
        description: '在持久化终端会话中执行命令',
        searchHint: '终端命令',
        isReadOnly: false,
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: '要执行的命令'
            },
            wait_ms: {
              type: 'number',
              description: '命令执行后等待的时间'
            },
            clear_buffer: {
              type: 'boolean',
              description: '是否清空缓冲区'
            }
          },
          required: ['command']
        }
      }
    ];
  }

  renderToolsList() {
    const container = document.getElementById('tools-list');
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
    // 改为在终端中执行工具，而不是弹窗
    this.selectedTool = tool;
    
    // 清空终端并显示工具执行信息
    this.clearTerminal();
    this.addTerminalOutput(`=== 执行工具: ${tool.name} ===`, true);
    this.addTerminalOutput(`描述: ${tool.searchHint || tool.description || '无描述'}`, true);
    this.addTerminalOutput(`类型: ${tool.isReadOnly ? '只读' : '读写'}`, true);
    this.addTerminalOutput('', true);
    
    // 检查工具是否需要参数
    if (tool.parameters && tool.parameters.properties) {
      this.addTerminalOutput('请输入工具参数:', true);
      this.addTerminalOutput('格式: 参数名=值 (多个参数用空格分隔)', true);
      this.addTerminalOutput('例如: command=ls -la path=/home/user', true);
      this.addTerminalOutput('', true);
      this.addTerminalOutput('输入 "cancel" 取消执行', true);
      this.addTerminalOutput('', true);
      
      // 显示必填参数提示
      if (tool.parameters.required && tool.parameters.required.length > 0) {
        this.addTerminalOutput(`必填参数: ${tool.parameters.required.join(', ')}`, true);
        this.addTerminalOutput('', true);
      }
      
      // 显示参数描述
      this.addTerminalOutput('参数描述:', true);
      Object.entries(tool.parameters.properties).forEach(([key, schema]) => {
        const required = tool.parameters.required && tool.parameters.required.includes(key) ? ' *' : '';
        const defaultVal = schema.default !== undefined ? ` (默认: ${schema.default})` : '';
        this.addTerminalOutput(`- ${key}${required}: ${schema.description || '无描述'}${defaultVal}`, true);
      });
      this.addTerminalOutput('', true);
      
      // 自动填充测试内容
      const testParams = this.getToolTestParams(tool.name);
      if (testParams) {
        this.addTerminalOutput('自动填充测试内容:', true);
        this.addTerminalOutput(`$ ${testParams}`, true);
        this.addTerminalOutput('', true);
        
        // 自动填充到终端输入框
        const terminalInput = document.getElementById('tools-terminal-input');
        if (terminalInput) {
          terminalInput.value = testParams;
          terminalInput.focus();
        }
      }
    } else {
      // 无参数工具，直接执行
      this.executeToolFromTerminal({});
    }
    
    // 不需要切换到终端页面，在当前页面的终端中执行
  }
  
  getToolTestParams(toolName) {
    const testParams = {
      'bash': 'command=ls -la',
      'file_read': 'path=test.txt',
      'file_write': 'path=output.txt content=Hello from file_write tool! create_dirs=true',
      'file_edit': 'path=test.txt old_str=Hello new_str=Hello, World!',
      'grep': 'pattern=Hello path=test.txt',
      'glob': 'pattern=*.txt',
      'web_search': 'query=上海今天的天气怎么样',
      'web_fetch': 'url=https://example.com',
      'terminal': 'command=echo "Hello from Terminal Tool!" wait_ms=1000 clear_buffer=true'
    };
    
    return testParams[toolName] || '';
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
    const modal = document.querySelector('#execute-tool-modal');
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
          <h4>测试搜索数据</h4>
          <pre class="code-block">{
  "query": "今天上海天气怎么样"
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"query": "今天上海天气怎么样","adapter":"bing"}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="web_search" data-params='{"query": "今天上海天气怎么样","adapter":"bing"}'>执行</button>
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
      `,
      'terminal': `
        <div class="test-example">
          <h4>测试样例 1: 执行简单命令</h4>
          <pre class="code-block">{
  "command": "echo \"Hello from Terminal Tool!\"",
  "wait_ms": 1000,
  "clear_buffer": true
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"command": "echo \"Hello from Terminal Tool!\"", "wait_ms": 1000, "clear_buffer": true}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="terminal" data-params='{"command": "echo \"Hello from Terminal Tool!\"", "wait_ms": 1000, "clear_buffer": true}'>执行</button>
          </div>
        </div>
        
        <div class="test-example">
          <h4>测试样例 2: 查看当前目录</h4>
          <pre class="code-block">{
  "command": "pwd",
  "wait_ms": 1000
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"command": "pwd", "wait_ms": 1000}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="terminal" data-params='{"command": "pwd", "wait_ms": 1000}'>执行</button>
          </div>
        </div>
        
        <div class="test-example">
          <h4>测试样例 3: 列出文件</h4>
          <pre class="code-block">{
  "command": "ls -la",
  "wait_ms": 1000
}</pre>
          <div class="example-actions">
            <button class="btn-secondary copy-example-btn" data-example='{"command": "ls -la", "wait_ms": 1000}'>复制</button>
            <button class="btn-primary execute-example-btn" data-tool="terminal" data-params='{"command": "ls -la", "wait_ms": 1000}'>执行</button>
          </div>
        </div>
      `
    };
    
    return examples[toolName] || '<p>暂无测试样例</p>';
  }

  async executeTool() {
    if (!this.selectedTool) return;

    // 改为在终端中执行工具
    const form = document.querySelector('#tool-execute-form');
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
      // 在当前页面的终端中执行工具
      this.clearTerminal();
      this.addTerminalOutput(`=== 执行工具: ${this.selectedTool.name} ===`, true);
      this.addTerminalOutput('执行中...', true);
      
      const result = await this.api.executeTools([{
        id: `tool_${Date.now()}`,
        name: this.selectedTool.name,
        arguments: params
      }]);

      this.hideExecuteModal();
      
      // 在终端中显示结果
      const terminalOutput = document.getElementById('tools-terminal-output');
      if (terminalOutput) {
        const lines = terminalOutput.children;
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          if (lastLine.textContent === '执行中...') {
            terminalOutput.removeChild(lastLine);
          }
        }
      }
      
      this.addTerminalOutput('=== 执行结果 ===', true);
      if (result.results && Array.isArray(result.results)) {
        result.results.forEach((toolResult) => {
          this.addTerminalOutput(`工具: ${toolResult.name} (${toolResult.duration}ms)`, true);
          
          if (toolResult.error) {
            this.addTerminalOutput(`错误: ${toolResult.error}`, true);
          } else {
            const resultStr = typeof toolResult.result === 'string' 
              ? toolResult.result 
              : JSON.stringify(toolResult.result, null, 2);
            this.addTerminalOutput(resultStr, true);
          }
        });
      }
      
      if (result.formatted) {
        this.addTerminalOutput('=== 格式化结果 ===', true);
        this.addTerminalOutput(result.formatted, true);
      }
      
      this.addToExecutionHistory(this.selectedTool.name, params, result);

    } catch (error) {
      this.showStatus(`工具执行失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
      this.selectedTool = null;
    }
  }

  showToolResult(result) {
    const modal = document.querySelector('#tool-result-modal');
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
    const modal = document.querySelector('#history-detail-modal');
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

  renderTerminalToolCard() {
    const toolsList = this.element.querySelector('#tools-list');
    if (!toolsList) return;

    // Create terminal tool card
    const terminalCard = this.createElement('div', 'tool-card terminal-tool-card');
    terminalCard.innerHTML = `
      <div class="tool-header">
        <h3>📱 终端</h3>
        <span class="tool-type readwrite">读写</span>
      </div>
      <p class="tool-description">在持久化终端会话中执行命令</p>
      <div class="terminal-preview">
        <div class="terminal-header">
          <div class="terminal-title">终端会话</div>
        </div>
        <div class="terminal-content">
          <div class="terminal-line system">$ echo "Hello from Terminal Tool!"</div>
          <div class="terminal-line system">Hello from Terminal Tool!</div>
          <div class="terminal-line system">$ pwd</div>
          <div class="terminal-line system">/path/to/project</div>
        </div>
      </div>
      <div class="tool-actions">
        <button id="open-terminal-btn" class="btn-primary">打开终端</button>
      </div>
    `;

    // Add the card to the tools list
    toolsList.appendChild(terminalCard);
  }

  renderTerminalToolsMenu() {
    const container = document.getElementById('tools-list-terminal');
    if (!container) return;

    container.innerHTML = '';

    if (this.availableTools.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无可用的工具</div>';
      return;
    }

    this.availableTools.forEach(tool => {
      const menuItem = this.createElement('div', 'tool-menu-item');
      
      menuItem.innerHTML = `
        <div class="tool-menu-header">
          <span class="tool-menu-name">${tool.name}</span>
          <span class="tool-menu-type ${tool.isReadOnly ? 'readonly' : 'readwrite'}">
            ${tool.isReadOnly ? '只读' : '读写'}
          </span>
        </div>
        <div class="tool-menu-description">${tool.searchHint || tool.description || '无描述'}</div>
      `;
      
      // Add click event listener
      menuItem.addEventListener('click', () => this.showExecuteModal(tool));
      
      container.appendChild(menuItem);
    });
  }

  openTerminal() {
    // Navigate to terminal page using the app's router
    if (window.app && window.app.router) {
      window.app.router.navigate('/terminal');
    } else {
      // Fallback to manual navigation if app router is not available
      const navItems = document.querySelectorAll('.nav-item');
      navItems.forEach(item => item.classList.remove('active'));
      
      const terminalNav = document.querySelector('[data-route="terminal"]');
      if (terminalNav) {
        terminalNav.classList.add('active');
      }
      
      // Hide all pages
      const pages = document.querySelectorAll('.page');
      pages.forEach(page => page.style.display = 'none');
      
      // Show terminal page
      const terminalPage = document.getElementById('terminal-page');
      if (terminalPage) {
        terminalPage.style.display = 'block';
      }
      
      // Activate TerminalModule if available
      if (window.app && window.app.modules) {
        const terminalModule = window.app.modules.get('terminal');
        if (terminalModule) {
          terminalModule.activate();
        }
      }
    }
    
    // Render tools menu in terminal page
    this.renderTerminalToolsMenu();
  }
}