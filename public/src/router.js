// Simple client-side router
export class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
  }

  addRoute(path, handler) {
    this.routes.set(path, handler);
  }

  async init() {
    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      this.handleRoute(window.location.pathname);
    });

    // Handle initial route
    const initialPath = window.location.pathname === '/' ? '/' : window.location.pathname;
    await this.handleRoute(initialPath);
  }

  async navigate(path) {
    if (path !== this.currentRoute) {
      window.history.pushState({}, '', path);
      await this.handleRoute(path);
    }
  }

  async handleRoute(path) {
    const handler = this.routes.get(path) || this.routes.get('/');
    if (handler) {
      this.currentRoute = path;
      await handler();
    }
  }
}