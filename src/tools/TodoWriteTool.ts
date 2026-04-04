import { z } from 'zod'
import { buildTool, type ToolDef } from './Tool.js'

// 任务项类型
interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
  createdAt: number
  updatedAt: number
}

// 全局任务存储
class TodoStore {
  private static instance: TodoStore
  private todos: Map<string, TodoItem[]> = new Map()

  private constructor() {}

  static getInstance(): TodoStore {
    if (!TodoStore.instance) {
      TodoStore.instance = new TodoStore()
    }
    return TodoStore.instance
  }

  private getSessionTodos(sessionId?: string): TodoItem[] {
    const key = sessionId || 'default'
    if (!this.todos.has(key)) {
      this.todos.set(key, [])
    }
    return this.todos.get(key)!
  }

  addTodo(sessionId: string | undefined, content: string, priority: 'low' | 'medium' | 'high'): TodoItem {
    const todos = this.getSessionTodos(sessionId)
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
    const todo: TodoItem = {
      id,
      content,
      status: 'pending',
      priority,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    todos.push(todo)
    return todo
  }

  updateTodoStatus(sessionId: string | undefined, id: string, status: 'pending' | 'in_progress' | 'completed'): TodoItem | null {
    const todos = this.getSessionTodos(sessionId)
    const todo = todos.find(t => t.id === id)
    if (todo) {
      todo.status = status
      todo.updatedAt = Date.now()
      return todo
    }
    return null
  }

  updateTodoContent(sessionId: string | undefined, id: string, content: string): TodoItem | null {
    const todos = this.getSessionTodos(sessionId)
    const todo = todos.find(t => t.id === id)
    if (todo) {
      todo.content = content
      todo.updatedAt = Date.now()
      return todo
    }
    return null
  }

  deleteTodo(sessionId: string | undefined, id: string): boolean {
    const todos = this.getSessionTodos(sessionId)
    const index = todos.findIndex(t => t.id === id)
    if (index !== -1) {
      todos.splice(index, 1)
      return true
    }
    return false
  }

  getTodos(sessionId: string | undefined): TodoItem[] {
    return [...this.getSessionTodos(sessionId)]
  }

  clearTodos(sessionId: string | undefined): void {
    const key = sessionId || 'default'
    this.todos.set(key, [])
  }
}

export const todoStore = TodoStore.getInstance()

// 输入 schema
const inputSchema = z.object({
  action: z.enum(['add', 'update_status', 'update_content', 'delete', 'list', 'clear']).describe('Action to perform'),
  content: z.string().optional().describe('Content for add/update operations'),
  id: z.string().optional().describe('Todo ID for update/delete operations'),
  status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('Status for update operations'),
  priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Priority for new todos'),
})

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  todos: z.array(z.object({
    id: z.string(),
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed']),
    priority: z.enum(['low', 'medium', 'high']),
  })),
})

export type TodoWriteInput = z.infer<typeof inputSchema>
export type TodoWriteOutput = z.infer<typeof outputSchema>

export type TodoWriteProgress = {
  type: 'todo_updated' | 'todo_added' | 'todo_deleted'
  todo?: TodoItem
}

export const TodoWriteTool = buildTool({
  name: 'todo_write',
  searchHint: 'manage and track tasks and to-do items',
  category: 'planning',
  tags: ['tasks', 'planning', 'todo', 'tracking'],
  maxResultSizeChars: 10_000,
  alwaysLoad: true,

  async description(input) {
    switch (input.action) {
      case 'add':
        return `Add todo: ${input.content}`
      case 'update_status':
        return `Update todo ${input.id} status to ${input.status}`
      case 'update_content':
        return `Update todo ${input.id} content`
      case 'delete':
        return `Delete todo ${input.id}`
      case 'list':
        return 'List all todos'
      case 'clear':
        return 'Clear all todos'
      default:
        return 'Todo management'
    }
  },

  inputSchema,
  outputSchema,

  isConcurrencySafe() {
    return true
  },

  isReadOnly(input) {
    return input.action === 'list'
  },

  userFacingName() {
    return 'Todo Write'
  },

  getToolUseSummary(input) {
    if (!input) return null
    switch (input.action) {
      case 'add':
        return input.content ? `Add: ${input.content.substring(0, 50)}` : 'Add todo'
      case 'update_status':
        return `Update ${input.id} to ${input.status}`
      case 'delete':
        return `Delete ${input.id}`
      case 'list':
        return 'List todos'
      case 'clear':
        return 'Clear todos'
      default:
        return 'Todo operation'
    }
  },

  getActivityDescription(input) {
    const summary = this.getToolUseSummary?.(input)
    return summary || 'Managing todos'
  },

  async validateInput(input) {
    switch (input.action) {
      case 'add':
        if (!input.content || !input.content.trim()) {
          return {
            result: false,
            message: 'Todo content cannot be empty',
            errorCode: 1,
          }
        }
        break
      case 'update_status':
      case 'update_content':
      case 'delete':
        if (!input.id) {
          return {
            result: false,
            message: 'Todo ID is required',
            errorCode: 2,
          }
        }
        if (input.action === 'update_content' && (!input.content || !input.content.trim())) {
          return {
            result: false,
            message: 'Todo content cannot be empty',
            errorCode: 3,
          }
        }
        if (input.action === 'update_status' && !input.status) {
          return {
            result: false,
            message: 'Status is required',
            errorCode: 4,
          }
        }
        break
    }
    return { result: true }
  },

  async call({ action, content, id, status, priority }, context, onProgress) {
    try {
      let message = ''
      let success = true

      switch (action) {
        case 'add':
          if (!content) throw new Error('Content required')
          const newTodo = todoStore.addTodo(context.sessionId, content, priority)
          message = `Added todo: ${content}`
          onProgress?.({
            toolUseID: 'todo-write',
            data: { type: 'todo_added', todo: newTodo },
          })
          break

        case 'update_status':
          if (!id || !status) throw new Error('ID and status required')
          const updatedStatus = todoStore.updateTodoStatus(context.sessionId, id, status)
          if (updatedStatus) {
            message = `Updated todo ${id} status to ${status}`
            onProgress?.({
              toolUseID: 'todo-write',
              data: { type: 'todo_updated', todo: updatedStatus },
            })
          } else {
            message = `Todo ${id} not found`
            success = false
          }
          break

        case 'update_content':
          if (!id || !content) throw new Error('ID and content required')
          const updatedContent = todoStore.updateTodoContent(context.sessionId, id, content)
          if (updatedContent) {
            message = `Updated todo ${id} content`
            onProgress?.({
              toolUseID: 'todo-write',
              data: { type: 'todo_updated', todo: updatedContent },
            })
          } else {
            message = `Todo ${id} not found`
            success = false
          }
          break

        case 'delete':
          if (!id) throw new Error('ID required')
          const deleted = todoStore.deleteTodo(context.sessionId, id)
          if (deleted) {
            message = `Deleted todo ${id}`
            onProgress?.({
              toolUseID: 'todo-write',
              data: { type: 'todo_deleted' },
            })
          } else {
            message = `Todo ${id} not found`
            success = false
          }
          break

        case 'list':
          message = 'Listed todos'
          break

        case 'clear':
          todoStore.clearTodos(context.sessionId)
          message = 'Cleared all todos'
          break
      }

      const todos = todoStore.getTodos(context.sessionId)
      const output: TodoWriteOutput = {
        success,
        message,
        todos: todos.map(t => ({
          id: t.id,
          content: t.content,
          status: t.status,
          priority: t.priority,
        })),
      }

      return { data: output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const output: TodoWriteOutput = {
        success: false,
        message,
        todos: [],
      }
      return { data: output, error: message }
    }
  },
} satisfies ToolDef<typeof inputSchema, TodoWriteOutput, TodoWriteProgress>)
