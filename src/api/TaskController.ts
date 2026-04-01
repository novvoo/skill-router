import { IncomingMessage, ServerResponse } from 'http';

class TaskController {
  async getAllTasks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 200, { tasks: [] });
  }

  private sendJson(res: ServerResponse, status: number, data: any): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }
}

export { TaskController };
export default TaskController;
export const taskController = new TaskController();