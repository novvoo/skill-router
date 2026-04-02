import { IncomingMessage, ServerResponse } from 'http';

export class TaskAPI {
  async getAllTasks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 200, { tasks: [] });
  }

  async getTask(req: IncomingMessage, res: ServerResponse, taskId: string): Promise<void> {
    this.sendError(res, 404, 'Task not found');
  }

  async createAgentTask(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const { readJsonBody } = await import('../handler.js');
      const body = await readJsonBody(req, 10 * 1024);
      const { agentType, prompt, description, priority, background, workingDir } = body;
      
      if (!agentType || !prompt) {
        return this.sendError(res, 400, 'Missing required fields: agentType, prompt');
      }
      
      const { agentTaskExecutor } = await import('../tasks/AgentTaskExecutor.js');
      const taskId = await agentTaskExecutor.spawnAgentTask({
        agentType,
        prompt,
        description: description || 'Agent task',
        priority: priority || 'normal',
        background: background || false,
        workingDir
      });
      
      this.sendJson(res, 201, { taskId, message: 'Agent task created' });
    } catch (error: any) {
      this.sendError(res, 500, 'Failed to create agent task', error);
    }
  }

  async createShellTask(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const { readJsonBody } = await import('../handler.js');
      const body = await readJsonBody(req, 10 * 1024);
      const { command, description, priority, background, workingDir } = body;
      
      if (!command) {
        return this.sendError(res, 400, 'Missing required field: command');
      }
      
      const { shellTaskExecutor } = await import('../tasks/ShellTaskExecutor.js');
      const taskId = await shellTaskExecutor.spawnShellTask({
        command,
        description: description || 'Shell task',
        priority: priority || 'normal',
        background: background || false,
        workingDir
      });
      
      this.sendJson(res, 201, { taskId, message: 'Shell task created' });
    } catch (error: any) {
      this.sendError(res, 500, 'Failed to create shell task', error);
    }
  }

  async killTask(req: IncomingMessage, res: ServerResponse, taskId: string): Promise<void> {
    this.sendJson(res, 200, { message: 'Task killed' });
  }

  async getTaskStats(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 200, { stats: {} });
  }

  async getTaskEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write('event: connected\n');
    res.write('data: {"message": "Connected to task events"}\n\n');

    req.on('close', () => {
      // cleanup
    });
  }

  private sendJson(res: ServerResponse, status: number, data: any): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify(data));
  }

  private sendError(res: ServerResponse, status: number, message: string, error?: any): void {
    console.error(`API Error: ${message}`, error);
    this.sendJson(res, status, {
      error: message,
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

export const taskAPI = new TaskAPI();