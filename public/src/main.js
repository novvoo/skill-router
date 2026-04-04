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
import { FilesModule } from './modules/FilesModule.js';
import { DeepSearchModule } from './modules/DeepSearchModule.js';
import { logger, LOG_LEVELS } from './utils/logger.js';
import { initErrorHandler, getErrorHandler } from './utils/errorHandler.js';
import { initEventBus, getEventBus } from './utils/eventBus.js';
import { dom } from './utils/utils.js';

class App {
  constructor() {
    logger.setLevel(LOG_LEVELS.DEBUG);
    logger.info('Initializing Skill-Router App...');
    
    this.config = new ConfigManager();
    this.api = new ApiClient(this.config);
    this.router = new Router();
    this.modules = new Map();
    this.currentModule = null;
    this.errorHandler = initErrorHandler();
    this.eventBus = initEventBus({ debug: true });
    
    this.init();
  }

  async init() {
    try {
      await this.initModules();
      this.setupRoutes();
      this.setupRouterGuards();
      await this.router.init();
      this.setupGlobalEvents();
      
      logger.info('🚀 Skill-Router Web App initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize app:', error);
      this.errorHandler.handleError(error, { source: 'app.init' });
    }
  }

  async initModules() {
    logger.debug('Initializing modules...');
    
    this.modules.set('chat', new ChatModule(this.api, this.config));
    this.modules.set('agents', new AgentModule(this.api, this.config));
    this.modules.set('tools', new ToolModule(this.api, this.config));
    this.modules.set('tasks', new TaskModule(this.api, this.config));
    this.modules.set('memory', new MemoryModule(this.api, this.config));
    this.modules.set('settings', new SettingsModule(this.api, this.config));
    this.modules.set('files', new FilesModule(this.api, this.config));
    this.modules.set('terminal', new TerminalModule(this.api, this.config));
    this.modules.set('deepsearch', new DeepSearchModule(this.api, this.config));
    
    logger.debug(`Initialized ${this.modules.size} modules`);
  }

  setupRoutes() {
    logger.debug('Setting up routes...');
    
    this.router.addRoute('/', () => this.showModule('chat'), { name: 'home' });
    this.router.addRoute('/chat', () => this.showModule('chat'), { name: 'chat' });
    this.router.addRoute('/agents', () => this.showModule('agents'), { name: 'agents' });
    this.router.addRoute('/tools', () => this.showModule('tools'), { name: 'tools' });
    this.router.addRoute('/tasks', () => this.showModule('tasks'), { name: 'tasks' });
    this.router.addRoute('/memory', () => this.showModule('memory'), { name: 'memory' });
    this.router.addRoute('/settings', () => this.showModule('settings'), { name: 'settings' });
    this.router.addRoute('/files', () => this.showModule('files'), { name: 'files' });
    this.router.addRoute('/terminal', () => this.showModule('terminal'), { name: 'terminal' });
    this.router.addRoute('/deepsearch', () => this.showModule('deepsearch'), { name: 'deepsearch' });
    
    this.router.setNotFoundHandler((path) => {
      logger.warn(`Route not found: ${path}, redirecting to home`);
      this.router.navigate('/');
    });
  }

  setupRouterGuards() {
    this.router.beforeEach((to, from) => {
      logger.debug(`Navigation: ${from?.path || 'init'} -> ${to.path}`);
      this.eventBus.emit('navigation:before', { to, from });
      return true;
    });

    this.router.afterEach((to, from) => {
      this.eventBus.emit('navigation:after', { to, from });
    });
  }

  async showModule(moduleName) {
    logger.debug(`Showing module: ${moduleName}`);
    
    if (this.currentModule && this.currentModule !== moduleName) {
      const previousModule = this.modules.get(this.currentModule);
      if (previousModule && previousModule.deactivate) {
        try {
          await previousModule.deactivate();
          logger.debug(`Deactivated module: ${this.currentModule}`);
        } catch (error) {
          logger.error(`Error deactivating module ${this.currentModule}:`, error);
        }
      }
    }

    this.modules.forEach((module, name) => {
      const element = document.getElementById(`${name}-page`);
      if (element) {
        element.style.display = 'none';
      }
    });

    const targetModule = this.modules.get(moduleName);
    const element = document.getElementById(`${moduleName}-page`);
    
    if (targetModule && element) {
      element.style.display = 'block';
      
      try {
        await targetModule.activate();
        logger.debug(`Activated module: ${moduleName}`);
      } catch (error) {
        logger.error(`Error activating module ${moduleName}:`, error);
        this.errorHandler.handleError(error, { source: 'module.activate', moduleName });
      }
      
      this.currentModule = moduleName;
      this.updateNavigation(moduleName);
      this.eventBus.emit('module:activated', { moduleName });
    } else {
      logger.error(`Module not found: ${moduleName}`);
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
    logger.debug('Setting up global event listeners...');
    
    document.addEventListener('click', (e) => {
      const navItem = e.target.closest('[data-route]');
      if (navItem) {
        e.preventDefault();
        const route = navItem.dataset.route;
        this.router.navigate(`/${route}`);
        this.closeMobileMenu();
        return;
      }
      
      if (e.target.classList.contains('modal-close')) {
        const modal = e.target.closest('.modal');
        if (modal) {
          modal.style.display = 'none';
        }
        return;
      }
      
      if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
        return;
      }
    });

    const mobileToggle = document.getElementById('mobile-menu-toggle');
    const navbar = document.getElementById('navbar');
    
    if (mobileToggle && navbar) {
      mobileToggle.addEventListener('click', () => {
        navbar.classList.toggle('open');
      });
      
      document.addEventListener('click', (e) => {
        if (!navbar.contains(e.target) && !mobileToggle.contains(e.target)) {
          this.closeMobileMenu();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal[style*="display: block"], .modal[style*="display:block"]');
        if (openModal) {
          openModal.style.display = 'none';
          e.preventDefault();
          return;
        }
      }
      
      if (e.ctrlKey || e.metaKey) {
        const keyMap = {
          '1': '/chat',
          '2': '/agents',
          '3': '/tools',
          '4': '/tasks',
          '5': '/memory',
          '6': '/settings',
          '7': '/terminal',
          '8': '/files',
          '9': '/deepsearch'
        };
        
        if (keyMap[e.key]) {
          e.preventDefault();
          this.router.navigate(keyMap[e.key]);
        }
      }
    });

    window.addEventListener('beforeunload', (e) => {
      this.cleanup();
    });
  }

  closeMobileMenu() {
    const navbar = document.getElementById('navbar');
    if (navbar) {
      navbar.classList.remove('open');
    }
  }

  cleanup() {
    logger.info('Cleaning up app...');
    
    this.modules.forEach(async (module, name) => {
      if (module.deactivate) {
        try {
          await module.deactivate();
        } catch (error) {
          logger.error(`Error cleaning up module ${name}:`, error);
        }
      }
      if (module.cleanup) {
        module.cleanup();
      }
    });
    
    this.router.destroy();
    this.eventBus.destroy();
    this.errorHandler.destroy();
    
    logger.info('App cleanup complete');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});