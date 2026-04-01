// Main application entry point
import { Router } from './router.js';
import { ConfigManager } from './config/ConfigManager.js';
import { ApiClient } from './api/ApiClient.js';
import { ChatModule } from './modules/ChatModule.js';
import { AgentModule } from './modules/AgentModule.js';
import { ToolModule } from './modules/ToolModule.js';
import { TaskModule } from './modules/TaskModule.js';
import { MemoryModule } from './modules/MemoryModule.js';
import { SettingsModule } from './modules/SettingsModule.js';
import { TerminalModule } from './modules/TerminalModule.js';
import { notifications } from './utils/notifications.js';

class App {
  constructor() {
    this.config = new ConfigManager();
    this.api = new ApiClient(this.config);
    this.router = new Router();
    this.modules = new Map();
    this.notifications = notifications;
    
    this.init();
  }

  async init() {
    // Initialize modules
    this.modules.set('chat', new ChatModule(this.api, this.config));
    this.modules.set('agents', new AgentModule(this.api, this.config));
    this.modules.set('tools', new ToolModule(this.api, this.config));
    this.modules.set('tasks', new TaskModule(this.api, this.config));
    this.modules.set('memory', new MemoryModule(this.api, this.config));
    this.modules.set('settings', new SettingsModule(this.api, this.config));
    this.modules.set('terminal', new TerminalModule(this.api, this.config));

    // Setup routes
    this.setupRoutes();
    
    // Initialize router
    await this.router.init();
    
    // Setup global event listeners
    this.setupGlobalEvents();
    
    console.log('🚀 Skill-Router Web App initialized');
  }

  setupRoutes() {
    this.router.addRoute('/', () => this.showModule('chat'));
    this.router.addRoute('/chat', () => this.showModule('chat'));
    this.router.addRoute('/agents', () => this.showModule('agents'));
    this.router.addRoute('/tools', () => this.showModule('tools'));
    this.router.addRoute('/tasks', () => this.showModule('tasks'));
    this.router.addRoute('/memory', () => this.showModule('memory'));
    this.router.addRoute('/settings', () => this.showModule('settings'));
    this.router.addRoute('/terminal', () => this.showModule('terminal'));
  }

  async showModule(moduleName) {
    // Hide all modules
    this.modules.forEach((module, name) => {
      const element = document.getElementById(`${name}-page`);
      if (element) {
        element.style.display = 'none';
      }
    });

    // Show target module
    const targetModule = this.modules.get(moduleName);
    const element = document.getElementById(`${moduleName}-page`);
    
    if (targetModule && element) {
      element.style.display = 'block';
      await targetModule.activate();
      this.updateNavigation(moduleName);
    }
  }

  updateNavigation(activeModule) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    
    const activeItem = document.querySelector(`[data-route="${activeModule}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }
  }

  setupGlobalEvents() {
    // Handle navigation clicks
    document.addEventListener('click', (e) => {
      const navItem = e.target.closest('[data-route]');
      if (navItem) {
        e.preventDefault();
        const route = navItem.dataset.route;
        this.router.navigate(`/${route}`);
        
        // Close mobile menu on navigation
        this.closeMobileMenu();
      }
    });

    // Handle mobile menu toggle
    const mobileToggle = document.getElementById('mobile-menu-toggle');
    const navbar = document.getElementById('navbar');
    
    if (mobileToggle && navbar) {
      mobileToggle.addEventListener('click', () => {
        navbar.classList.toggle('open');
      });
      
      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!navbar.contains(e.target) && !mobileToggle.contains(e.target)) {
          this.closeMobileMenu();
        }
      });
    }

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            this.router.navigate('/chat');
            break;
          case '2':
            e.preventDefault();
            this.router.navigate('/agents');
            break;
          case '3':
            e.preventDefault();
            this.router.navigate('/tools');
            break;
          case '4':
            e.preventDefault();
            this.router.navigate('/tasks');
            break;
          case '5':
            e.preventDefault();
            this.router.navigate('/memory');
            break;
          case '6':
            e.preventDefault();
            this.router.navigate('/settings');
            break;
          case '7':
            e.preventDefault();
            this.router.navigate('/terminal');
            break;
        }
      }
    });
  }

  closeMobileMenu() {
    const navbar = document.getElementById('navbar');
    if (navbar) {
      navbar.classList.remove('open');
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});