// Web-based terminal module
import { BaseModule } from './BaseModule.js';

export class TerminalModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.terminalHistory = [];
    this.commandHistory = [];
    this.historyIndex = -1;
    this.sessionId = this.generateSessionId();
  }

  async onActivate() {
    this.element = document.getElementById('terminal-page');
    if (!this.element) return;

    this.setupEventListeners();
    this.initializeTerminal();
  }

  setupEventListeners() {
    this.addEventListener('#terminal-input', 'keydown', (e) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          this.executeCommand();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navigateHistory(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.navigateHistory(1);
          break;
      }
    });

    this.addEventListener('#clear-terminal', 'click', () => this.clearTerminal());
    this.addEventListener('#connect-terminal', 'click', () => this.toggleConnection());
  }

  generateSessionId() {
    return 'terminal_' + Math.random().toString(36).substring(2, 11);
  }

  async initializeTerminal() {
    this.addToHistory('system', '🚀 Skill-Router Web Terminal');
    this.addToHistory('system', '═'.repeat(50));
    this.addToHistory('system', 'Type "help" for available commands');
    this.addToHistory('system', '');
  }

  navigateHistory(direction) {
    if (this.commandHistory.length === 0) return;

    if (direction === -1) {
      if (this.historyIndex === -1) {
        this.historyIndex = this.commandHistory.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex--;
      }
    } else {
      if (this.historyIndex < this.commandHistory.length - 1) {
        this.historyIndex++;
      } else {
        this.historyIndex = -1;
      }
    }

    const input = this.element.querySelector('#terminal-input');
    if (input) {
      if (this.historyIndex === -1) {
        input.value = '';
      } else {
        input.value = this.commandHistory[this.historyIndex];
      }
    }
  }

  async executeCommand() {
    const input = this.element.querySelector('#terminal-input');
    const command = input.value.trim();
    
    if (!command) return;

    if (this.commandHistory[this.commandHistory.length - 1] !== command) {
      this.commandHistory.push(command);
      if (this.commandHistory.length > 100) {
        this.commandHistory.shift();
      }
    }
    this.historyIndex = -1;

    this.addToHistory('user', `> ${command}`);
    input.value = '';

    try {
      await this.processCommand(command);
    } catch (error) {
      this.addToHistory('error', `Error: ${error.message}`);
    }
  }

  async processCommand(command) {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;
      case 'clear':
        this.clearTerminal();
        break;
      case 'agents':
        await this.listAgents();
        break;
      case 'spawn':
        if (args.length < 2) {
          this.addToHistory('error', 'Usage: spawn <agent-type> <description>');
          return;
        }
        await this.spawnAgent(args[0], args.slice(1).join(' '));
        break;
      case 'kill':
        if (args.length < 1) {
          this.addToHistory('error', 'Usage: kill <agent-id>');
          return;
        }
        await this.killAgent(args[0]);
        break;
      case 'tools':
        await this.listTools();
        break;
      case 'status':
        await this.showStatus();
        break;
      case 'chat':
        await this.chatCommand(args.join(' '));
        break;
      default:
        await this.executeNaturalLanguage(command);
    }
  }

  async executeNaturalLanguage(command) {
    this.addToHistory('system', '🤖 Processing...');
    
    try {
      const result = await this.api.post('/run', {
        query: command,
        tools: { enabled: true },
        memory: { enabled: true }
      });

      this.addToHistory('assistant', result.response || 'Task completed');
      
      if (result.used_skills && result.used_skills.length > 0) {
        this.addToHistory('system', `Used skills: ${result.used_skills.join(', ')}`);
      }
    } catch (error) {
      this.addToHistory('error', `Failed: ${error.message}`);
    }
  }

  async chatCommand(message) {
    if (!message) {
      this.addToHistory('error', 'Usage: chat <message>');
      return;
    }

    try {
      const result = await this.api.post('/run', {
        query: message,
        tools: { enabled: false },
        memory: { enabled: true }
      });

      this.addToHistory('assistant', result.response || 'No response');
    } catch (error) {
      this.addToHistory('error', `Chat failed: ${error.message}`);
    }
  }

  showHelp() {
    const helpText = `
Available Commands:
─────────────────────────────────────────────────
help                     - Show this help
clear                    - Clear terminal
agents                   - List available agents
spawn <type> <desc>      - Spawn an agent
kill <agent-id>          - Kill a running agent
tools                    - List available tools
status                   - Show system status
chat <message>           - Send message to chat

💡 You can also type natural language requests!
    `;
    this.addToHistory('system', helpText);
  }

  async listAgents() {
    try {
      const data = await this.api.getAgents();
      const available = data.available || [];
      const running = data.running || [];

      let output = '\n🤖 Available Agents:\n';
      output += '─'.repeat(40) + '\n';
      
      if (available.length === 0) {
        output += 'No agents available\n';
      } else {
        available.forEach(agent => {
          const status = agent.background ? '🔄' : '⚡';
          output += `${status} ${agent.agentType} - ${agent.name}\n`;
          output += `   ${agent.description}\n`;
        });
      }

      if (running.length > 0) {
        output += '\n🔄 Running Agents:\n';
        output += '─'.repeat(40) + '\n';
        running.forEach(agent => {
          output += `🤖 ${agent.id} - ${agent.description}\n`;
        });
      }

      this.addToHistory('system', output);
    } catch (error) {
      this.addToHistory('error', `Failed to list agents: ${error.message}`);
    }
  }

  async spawnAgent(type, description) {
    try {
      this.addToHistory('system', `🚀 Spawning ${type} agent: ${description}`);
      
      const result = await this.api.spawnAgent(type, description, {
        description,
        background: true
      });

      if (result.status === 'background') {
        this.addToHistory('success', `✅ Agent spawned (ID: ${result.agentId})`);
      } else if (result.status === 'completed') {
        this.addToHistory('success', `✅ Agent completed: ${result.result}`);
      }
    } catch (error) {
      this.addToHistory('error', `Failed to spawn agent: ${error.message}`);
    }
  }

  async killAgent(agentId) {
    try {
      await this.api.killAgent(agentId);
      this.addToHistory('success', `✅ Agent ${agentId} killed`);
    } catch (error) {
      this.addToHistory('error', `Failed to kill agent: ${error.message}`);
    }
  }

  async listTools() {
    try {
      const data = await this.api.getTools();
      const tools = data.tools || [];

      let output = '\n🔧 Available Tools:\n';
      output += '─'.repeat(40) + '\n';
      
      if (tools.length === 0) {
        output += 'No tools available\n';
      } else {
        tools.forEach(tool => {
          const type = tool.isReadOnly ? '📖' : '✏️';
          output += `${type} ${tool.name} - ${tool.description}\n`;
        });
      }

      this.addToHistory('system', output);
    } catch (error) {
      this.addToHistory('error', `Failed to list tools: ${error.message}`);
    }
  }

  async showStatus() {
    try {
      const [agentsData, toolsData] = await Promise.all([
        this.api.getAgents(),
        this.api.getTools()
      ]);

      const availableAgents = agentsData.available?.length || 0;
      const runningAgents = agentsData.running?.length || 0;
      const availableTools = toolsData.tools?.length || 0;

      let output = '\n📊 System Status:\n';
      output += '─'.repeat(40) + '\n';
      output += `🤖 Agents: ${availableAgents} available, ${runningAgents} running\n`;
      output += `🔧 Tools: ${availableTools} available\n`;
      output += `💾 Memory: ${this.config.getConfig().memoryEnabled ? 'Enabled' : 'Disabled'}\n`;
      output += `🆔 Session: ${this.sessionId}\n`;

      this.addToHistory('system', output);
    } catch (error) {
      this.addToHistory('error', `Failed to get status: ${error.message}`);
    }
  }

  addToHistory(type, content) {
    const timestamp = new Date().toLocaleTimeString();
    this.terminalHistory.push({
      type,
      content,
      timestamp
    });

    if (this.terminalHistory.length > 1000) {
      this.terminalHistory = this.terminalHistory.slice(-1000);
    }

    this.renderTerminal();
  }

  renderTerminal() {
    const output = this.element?.querySelector('#terminal-output');
    if (!output) return;

    output.innerHTML = '';

    this.terminalHistory.forEach(entry => {
      const line = this.createElement('div', `terminal-line ${entry.type}`);
      
      const timestamp = this.createElement('span', 'terminal-timestamp', entry.timestamp);
      const content = this.createElement('span', 'terminal-content');
      
      if (entry.content.includes('\n')) {
        content.innerHTML = entry.content.replace(/\n/g, '<br>');
      } else {
        content.textContent = entry.content;
      }

      line.appendChild(timestamp);
      line.appendChild(content);
      output.appendChild(line);
    });

    output.scrollTop = output.scrollHeight;
  }

  clearTerminal() {
    this.terminalHistory = [];
    this.renderTerminal();
    this.addToHistory('system', 'Terminal cleared');
  }

  toggleConnection() {
    const button = this.element.querySelector('#connect-terminal');
    
    if (button) {
      button.textContent = 'Connected';
      button.className = 'btn-success';
      button.disabled = true;
    }

    this.addToHistory('system', 'Terminal connected');
  }
}