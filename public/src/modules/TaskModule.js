// Task management module - 统一的任务管理模块
import { BaseModule } from './BaseModule.js';

export class TaskModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.tasks = [];
    this.taskStats = {};
    this.currentFilter = 'all';
    this.eventSource = null;
    this.showCreateForm = false;
  }

  async onActivate() {
    this.element = document.getElementById('tasks-page');
    if (!this.element) {
      console.error('Tasks page element not found');
      return;
    }

    this.setupEventListeners();
    await this.loadTasks();
    await this.loadStats();
    this.connectEventStream();
  }

  async onDeactivate() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  setupEventListeners() {
    // 创建任务按钮
    this.addEventListener('#create-task-btn', 'click', () => this.toggleCreateForm());
    this.addEventListener('#cancel-task-btn', 'click', () => this.toggleCreateForm(false));
    this.addEventListener('#submit-task-btn', 'click', () => this.createTask());
    
    // 刷新按钮
    this.addEventListener('#refresh-tasks', 'click', () => this.refreshTasks());
    
    // 任务类型切换
    this.addEventListener('#task-type', 'change', () => this.toggleTaskTypeFields());
    
    // 过滤按钮
    this.addEventListener('.filter-btn', 'click', (e) => {
      const filter = e.target.dataset.filter;
      if (filter) this.filterTasks(filter);
    });
  }

  async loadTasks() {
    this.showLoading(true);
    try {
      const response = await this.api.get('/api/tasks');
      this.tasks = response.tasks || [];
      this.renderTasks();
      this.clearStatus();
    } catch (error) {
      this.showStatus(`加载任务失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async loadStats() {
    try {
      const response = await this.api.get('/api/tasks/stats');
      this.taskStats = response.stats || {};
      this.renderStats();
    } catch (error) {
      console.error('Failed to load task stats:', error);
    }
  }

  renderStats() {
    const container = this.element.querySelector('#task-stats');
    if (!container) return;

    const stats = this.taskStats;
    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-number">${stats.total || 0}</div>
        <div class="stat-label">总任务</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.running || 0}</div>
        <div class="stat-label">运行中</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.completed || 0}</div>
        <div class="stat-label">已完成</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.failed || 0}</div>
        <div class="stat-label">失败</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.background || 0}</div>
        <div class="stat-label">后台运行</div>
      </div>
    `;
  }

  renderTasks() {
    const container = this.element.querySelector('#task-list');
    if (!container) return;

    const filteredTasks = this.filterTasksByStatus(this.tasks, this.currentFilter);
    
    if (filteredTasks.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无任务</div>';
      return;
    }

    container.innerHTML = filteredTasks.map(task => this.renderTaskItem(task)).join('');
    
    // 绑定任务操作事件
    container.querySelectorAll('.kill-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = e.target.dataset.taskId;
        this.killTask(taskId);
      });
    });

    container.querySelectorAll('.background-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = e.target.dataset.taskId;
        this.backgroundTask(taskId);
      });
    });

    container.querySelectorAll('.view-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = e.target.dataset.taskId;
        this.viewTaskDetails(taskId);
      });
    });
  }

  renderTaskItem(task) {
    const statusClass = `status-${task.status}`;
    const typeClass = `type-${task.type}`;
    const startTime = new Date(task.startTime).toLocaleString();
    const duration = task.endTime ? this.formatDuration(task.endTime - task.startTime) : '';

    return `
      <div class="task-item">
        <div class="task-info">
          <div class="task-title">
            <span class="task-type ${typeClass}">${this.formatTaskType(task.type)}</span>
            <span class="task-status ${statusClass}">${task.status}</span>
            <span class="task-description">${task.description}</span>
          </div>
          <div class="task-meta">
            ID: ${task.id} | 优先级: ${task.priority} | 开始时间: ${startTime}
            ${duration ? ` | 耗时: ${duration}` : ''}
          </div>
          ${task.tags.length > 0 ? `<div class="task-tags">标签: ${task.tags.join(', ')}</div>` : ''}
        </div>
        <div class="task-actions">
          ${task.status === 'running' ? `
            <button class="btn-secondary btn-small background-task-btn" data-task-id="${task.id}">后台</button>
            <button class="btn-danger btn-small kill-task-btn" data-task-id="${task.id}">终止</button>
          ` : ''}
          <button class="btn-secondary btn-small view-task-btn" data-task-id="${task.id}">详情</button>
        </div>
      </div>
    `;
  }

  formatTaskType(type) {
    const typeMap = {
      'agent_task': 'Agent任务',
      'shell_task': 'Shell任务',
      'tool_task': '工具任务',
      'workflow_task': '工作流',
      'coordinator_task': '协调器'
    };
    return typeMap[type] || type;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分${seconds % 60}秒`;
    const hours = Math.floor(minutes / 60);
    return `${hours}时${minutes % 60}分`;
  }

  filterTasksByStatus(tasks, status) {
    if (status === 'all') return tasks;
    return tasks.filter(task => task.status === status);
  }

  filterTasks(status) {
    this.currentFilter = status;
    this.renderTasks();
    
    // 更新过滤按钮状态
    this.element.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    this.element.querySelector(`[data-filter="${status}"]`)?.classList.add('active');
  }

  toggleCreateForm(show = null) {
    this.showCreateForm = show !== null ? show : !this.showCreateForm;
    
    const form = this.element.querySelector('#create-task-form');
    const button = this.element.querySelector('#create-task-btn');
    
    if (form && button) {
      if (this.showCreateForm) {
        form.style.display = 'block';
        button.textContent = '取消创建';
        this.clearCreateForm();
      } else {
        form.style.display = 'none';
        button.textContent = '创建任务';
      }
    }
  }

  clearCreateForm() {
    const form = this.element.querySelector('#create-task-form');
    if (form) {
      form.reset();
      this.toggleTaskTypeFields();
    }
  }

  toggleTaskTypeFields() {
    const taskType = this.element.querySelector('#task-type')?.value;
    const agentFields = this.element.querySelector('#agent-fields');
    const shellFields = this.element.querySelector('#shell-fields');
    
    if (agentFields && shellFields) {
      if (taskType === 'agent') {
        agentFields.style.display = 'block';
        shellFields.style.display = 'none';
      } else {
        agentFields.style.display = 'none';
        shellFields.style.display = 'block';
      }
    }
  }

  async createTask() {
    const formData = this.getFormData('#create-task-form');
    
    if (!formData.description) {
      this.showStatus('请填写任务描述', true);
      return;
    }

    let endpoint, taskData;
    
    if (formData.taskType === 'agent') {
      if (!formData.agentPrompt) {
        this.showStatus('请填写Agent提示词', true);
        return;
      }
      
      endpoint = '/api/tasks/agent';
      taskData = {
        agentType: formData.agentType || 'general',
        prompt: formData.agentPrompt,
        description: formData.description,
        priority: formData.priority || 'normal',
        background: Boolean(formData.background)
      };
    } else {
      if (!formData.shellCommand) {
        this.showStatus('请填写Shell命令', true);
        return;
      }
      
      endpoint = '/api/tasks/shell';
      taskData = {
        command: formData.shellCommand,
        description: formData.description,
        priority: formData.priority || 'normal',
        background: Boolean(formData.background)
      };
    }

    this.showLoading(true);
    try {
      const result = await this.api.post(endpoint, taskData);
      this.showStatus(`任务创建成功: ${result.taskId}`);
      this.toggleCreateForm(false);
      await this.loadTasks();
      await this.loadStats();
    } catch (error) {
      this.showStatus(`创建任务失败：${error.message}`, true);
    } finally {
      this.showLoading(false);
    }
  }

  async killTask(taskId) {
    if (!confirm('确定要终止这个任务吗？')) return;

    try {
      await this.api.delete(`/api/tasks/${taskId}`);
      this.showStatus(`任务 ${taskId} 已终止`);
      await this.loadTasks();
      await this.loadStats();
    } catch (error) {
      this.showStatus(`终止任务失败：${error.message}`, true);
    }
  }

  async backgroundTask(taskId) {
    try {
      await this.api.post(`/api/tasks/${taskId}/background`);
      this.showStatus(`任务 ${taskId} 已后台运行`);
      await this.loadTasks();
    } catch (error) {
      this.showStatus(`后台化任务失败：${error.message}`, true);
    }
  }

  viewTaskDetails(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const details = [
      `ID: ${task.id}`,
      `类型: ${this.formatTaskType(task.type)}`,
      `状态: ${task.status}`,
      `描述: ${task.description}`,
      `优先级: ${task.priority}`,
      `开始时间: ${new Date(task.startTime).toLocaleString()}`,
      task.endTime ? `结束时间: ${new Date(task.endTime).toLocaleString()}` : '',
      task.tags.length > 0 ? `标签: ${task.tags.join(', ')}` : ''
    ].filter(Boolean).join('\n');

    alert(`任务详情:\n\n${details}`);
  }

  connectEventStream() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource('/api/tasks/events');
      
      this.eventSource.addEventListener('taskEvent', (event) => {
        const data = JSON.parse(event.data);
        this.handleTaskEvent(data);
      });

      this.eventSource.addEventListener('notification', (event) => {
        const data = JSON.parse(event.data);
        this.showStatus(data.summary, data.status === 'failed');
      });

      this.eventSource.onerror = () => {
        console.warn('Task event stream connection error, retrying...');
        setTimeout(() => this.connectEventStream(), 5000);
      };
    } catch (error) {
      console.error('Failed to connect to task event stream:', error);
    }
  }

  handleTaskEvent(event) {
    // 实时更新任务状态
    if (event.type === 'created' || event.type === 'progress' || 
        event.type === 'completed' || event.type === 'failed' || 
        event.type === 'killed') {
      this.loadTasks();
      this.loadStats();
    }
  }

  async refreshTasks() {
    await this.loadTasks();
    await this.loadStats();
    this.showStatus('任务列表已刷新');
  }
}