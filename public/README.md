# Skill-Router

A powerful web-based AI agent system with advanced long-running task management capabilities.

## 🌟 Features

### 🤖 AI Agent System
- Multiple specialized agent types (General, Researcher, Coder)
- Configurable agent definitions via Markdown files
- Background and foreground execution modes

### 📋 Long-Running Task Management
- **Agent Tasks**: Execute AI agents for complex reasoning and tool use
- **Shell Tasks**: Run system commands with intelligent monitoring
- **Task Lifecycle**: Complete state management (pending → running → completed/failed)
- **Background Processing**: Seamless foreground-to-background task migration
- **Smart Monitoring**: Automatic detection of interactive prompts and stalled processes
- **Real-time Updates**: Live task status and progress tracking

### 🌐 Multiple Interfaces
- **Web Interface**: Full-featured task management dashboard at `/tasks.html`
- **Terminal Mode**: Interactive command-line interface with natural language support
- **REST API**: Complete programmatic access to all task management features
- **SSE Events**: Real-time task event streaming

### 🔧 Advanced Capabilities
- Task prioritization and tagging
- Intelligent shell command monitoring
- Interactive prompt detection
- Resource management and cleanup
- Comprehensive logging and debugging

## 🚀 Quick Start

### Web Mode
```bash
npm install
npm run dev
# Visit http://localhost:8080 for the main interface
# Visit http://localhost:8080/tasks.html for task management
```

### Terminal Mode
```bash
npm run dev:terminal
```

### Available Commands (Terminal)
```bash
/help                    # Show help
/agents                  # List available agents  
/spawn <type> <task>     # Create agent task
/shell <command>         # Execute shell command
/tasks                   # List all tasks
/kill <task-id>          # Terminate task
/background [task-id]    # Background task(s)
/status                  # System status
```

### Natural Language Support
You can also interact using natural language:
```bash
"create a python script to sort files"
"what is the weather today?"
"analyze the current market trends"
```

## 📋 Task Management API

### Create Agent Task
```bash
POST /api/tasks/agent
{
  "agentType": "researcher",
  "prompt": "Research AI trends",
  "description": "Market research task",
  "background": true,
  "priority": "high"
}
```

### Create Shell Task  
```bash
POST /api/tasks/shell
{
  "command": "python script.py",
  "description": "Run analysis script",
  "background": true
}
```

### Get Tasks
```bash
GET /api/tasks           # All tasks
GET /api/tasks/stats     # Statistics
GET /api/tasks/events    # Real-time event stream
```

## 🏗️ Architecture

The system implements a sophisticated task management architecture inspired by claude-code:

- **TaskManager**: Central task state management and lifecycle control
- **AgentTaskExecutor**: Specialized executor for AI agent tasks
- **ShellTaskExecutor**: Advanced shell command execution with monitoring
- **TaskAPI**: Unified interface for all task operations
- **Real-time Events**: SSE-based live updates for web interfaces

## 📚 Documentation

- [Task System Guide](../docs/skill-router-task-system.md) - Comprehensive usage guide
- [Claude-Code Implementation Analysis](../docs/claude-code-long-task-implementation.md) - Technical deep-dive

## 🧪 Testing

```bash
npm run test:tasks       # Test task system
npm run test:agents      # Test agent system
npm run typecheck        # Type checking
```

---

## 🎯 Legacy Web Interface

The system also includes a fully refactored modern web interface with IDE-like experience:

### Web Interface Features
- **Smart Chat**: Natural language interaction with document upload
- **Agent Management**: Create and monitor AI agents
- **Tool Execution**: Visual tool interface with auto-generated forms
- **Memory Management**: Context browsing and file management
- **Web Terminal**: Integrated terminal with agent operations
- **System Settings**: OpenAI configuration and model settings

### Access Points
- Main Interface: http://localhost:8080/index-new.html
- Task Manager: http://localhost:8080/tasks.html
- Demo Page: http://localhost:8080/demo.html

### Keyboard Shortcuts
- `Ctrl+1-6`: Quick page switching
- Terminal commands and natural language support

---

Experience the power of advanced task management with Skill-Router's comprehensive long-running task system!