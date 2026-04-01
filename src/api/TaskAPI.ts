import { IncomingMessage, ServerResponse } from 'http';

export class TaskAPI {
  async getAllTasks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 200, { tasks: [] });
  }

  async getTask(req: IncomingMessage, res: ServerResponse, taskId: string): Promise<void> {
    this.sendError(res, 404, 'Task not found');
  }

  async createAgentTask(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 201, { taskId: 'test', message: 'Agent task created' });
  }

  async createShellTask(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 201, { taskId: 'test', message: 'Shell task created' });
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