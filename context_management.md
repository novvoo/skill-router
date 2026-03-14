# Context and Memory Management

## Directory Structure

```
file://
├── resources/              # Resources: Project docs, code repos, web pages, etc.
│   └── sessions/
├── user/                   # User: Personal preferences, habits, etc.
│   └── memories/
└── agent/                  # Agent: Skills, instructions, task memories, etc.
    ├── skills/
    └── memories/
```

## Data Types

| Type | Purpose | Lifecycle |
| :--- | :--- | :--- |
| **Resource** | Knowledge and rules (documentation, code, FAQ) | Long-term, relatively static |
| **Memory** | Agent's cognition (user preferences, learning experience) | Long-term, dynamic updates |
| **Skill** | Callable capabilities (tools, MCP) | Long-term, static |

## Example Structure (resources/sessions/)

```
file://resources/sessions/
├── .abstract.md               # L0 Layer: Abstract
├── .overview.md               # L1 Layer: Overview
├── docs/
│   ├── .abstract.md          # Each directory has L0/L1 layers
│   ├── .overview.md
│   └── api.md                # L2 Layer: Full content
└── src/
```

## Retrieval Strategy: "Directory Path Localization + Semantic Search"

### Process:

1.  **Intent Analysis**: Extract multiple retrieval dimensions from the query.
2.  **Initial Localization**: Use vector retrieval to quickly locate high-score directories.
3.  **Fine-grained Exploration**: Perform secondary retrieval within high-score directories.
4.  **Recursive Drilling**: Recursively repeat retrieval for subdirectories.
5.  **Result Aggregation**: Return the most relevant context.
