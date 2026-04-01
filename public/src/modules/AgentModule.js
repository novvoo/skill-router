// Agent management module
import { BaseModule } from './BaseModule.js';

export class AgentModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.availableAgents = [];
    this.runningAgents = [];
    this.pollingInterval = null;
    this.showCreateForm = false;
  }

  async onActivate() {
    this.element = document.getElementById('agents-page');
    if (!this.element) return;

    this.setupEventListeners();
    await this.loadAgents();
  }

  async onDeactivate() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  setupEventListeners() {
    // Refresh button
    this.addEventListener('#refresh-agents', 'click', () => this.loadAgents());
    
    // Create agent button
    this.addEventListener('#create-agent-btn', 'click', () => this.toggleCreateForm());
    
    // Create form buttons
    this.addEventListener('#spawn-agent-btn', 'click', () => this.spawnAgent());
    this.addEventListener('#cancel-agent-btn', 'click', () => this.toggleCreateForm(false));
  }

  async loadAgents() {
    this.showLoading(true);
    try {
      const data = await this.api.getAgents();
      this.availableAgents = data.available || [];
      this.runningAgents = data.running || [];
      
      this.renderAgentsList();
      this.renderRunningAgents();
      
      // Start polling if there are running agents
      if (this.runningAgents.length > 0 && !this.pollingInterval) {
        this.startPolling();
      }
      
      this.clearStatus();
    } catch (error) {
      this.showStatus(`加载失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  renderAgentsList() {
    const container = this.element.querySelector('#agents-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.availableAgents.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无可用的Agent类型</div>';
      return;
    }

    this.availableAgents.forEach(agent => {
      const card = this.createElement('div', 'agent-card');
      
      card.innerHTML = `
        <div class="agent-header">
          <h3>${agent.name}</h3>
          <span class="agent-type">${agent.agentType}</span>
        </div>
        <p class="agent-description">${agent.description}</p>
        <div class="agent-meta">
          <span class="agent-mode">${agent.background ? '后台模式' : '同步模式'}</span>
        </div>
      `;
      
      container.appendChild(card);
    });
  }

  renderRunningAgents() {
    const container = this.element.querySelector('#running-agents-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.runningAgents.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无运行中的Agent</div>';
      return;
    }

    this.runningAgents.forEach(agent => {
      const card = this.createElement('div', 'running-agent-card');
      
      card.innerHTML = `
        <div class="agent-info">
          <h4>${agent.name}</h4>
          <p>${agent.description}</p>
          <div class="agent-status">
            <span class="status-indicator running"></span>
            <span>运行中</span>
          </div>
        </div>
        <div class="agent-actions">
          <button class="btn-secondary kill-agent-btn" data-agent-id="${agent.id}">
            停止
          </button>
        </div>
      `;
      
      // Add kill button event listener
      const killBtn = card.querySelector('.kill-agent-btn');
      killBtn.addEventListener('click', () => this.killAgent(agent.id));
      
      container.appendChild(card);
    });
  }

  toggleCreateForm(show = null) {
    this.showCreateForm = show !== null ? show : !this.showCreateForm;
    
    const form = this.element.querySelector('#create-agent-form');
    const button = this.element.querySelector('#create-agent-btn');
    
    if (form && button) {
      if (this.showCreateForm) {
        form.style.display = 'block';
        button.textContent = '取消创建';
        this.clearCreateForm();
      } else {
        form.style.display = 'none';
        button.textContent = '创建Agent';
      }
    }
  }

  clearCreateForm() {
    const form = this.element.querySelector('#create-agent-form');
    if (form) {
      form.reset();
    }
  }

  async spawnAgent() {
    const formData = this.getFormData('#create-agent-form');
    
    if (!formData.description || !formData.prompt) {
      this.showStatus('请填写任务描述和详细任务', true);
      return;
    }

    this.showLoading(true);
    try {
      const result = await this.api.spawnAgent(
        formData.agentType || 'general',
        formData.prompt,
        {
          description: formData.description,
          background: Boolean(formData.background)
        }
      );

      if (result.status === 'background') {
        this.showStatus(`Agent已在后台启动 (ID: ${result.agentId})`);
        this.startPolling();
      } else if (result.status === 'completed') {
        this.showStatus('Agent执行完成');
        if (result.result) {
          this.showAgentResult(result.result);
        }
      }

      this.toggleCreateForm(false);
      await this.loadAgents();

    } catch (error) {
      this.showStatus(`启动Agent失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async killAgent(agentId) {
    if (!confirm('确定要停止这个Agent吗？')) return;

    try {
      await this.api.killAgent(agentId);
      this.showStatus(`Agent ${agentId} 已停止`);
      await this.loadAgents();
    } catch (error) {
      this.showStatus(`停止Agent失败：${error.message}`, true);
    }
  }

  showAgentResult(result) {
    // Create a modal or notification to show the result
    const modal = this.createElement('div', 'agent-result-modal');
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Agent执行结果</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <pre>${result}</pre>
        </div>
      </div>
    `;

    // Add close functionality
    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    document.body.appendChild(modal);
  }

  startPolling() {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(async () => {
      try {
        await this.loadAgents();
        
        // Stop polling if no running agents
        if (this.runningAgents.length === 0) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
        }
      } catch (error) {
        console.error('Agent polling error:', error);
      }
    }, 3000);
  }
}