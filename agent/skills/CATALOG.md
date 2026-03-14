# CATALOG

## Skills（按主题归类）

### C++

| 名称 | 说明 | 位置 |
|---|---|---|
| [cpp-coding-standards](cpp-coding-standards/SKILL.md) | C++ coding standards based on the C++ Core Guidelines (isocpp.github.io). Use when writing, reviewing, or refactoring C++ code to enforce modern, safe, and idiomatic practices. | cpp-coding-standards/ |
| [cpp-testing](cpp-testing/SKILL.md) | Use only when writing/updating/fixing C++ tests, configuring GoogleTest/CTest, diagnosing failing or flaky tests, or adding coverage/sanitizers. | cpp-testing/ |

### Django

| 名称 | 说明 | 位置 |
|---|---|---|
| [django-patterns](django-patterns/SKILL.md) | Django architecture patterns, REST API design with DRF, ORM best practices, caching, signals, middleware, and production-grade Django apps. | django-patterns/ |
| [django-security](django-security/SKILL.md) | Django security best practices, authentication, authorization, CSRF protection, SQL injection prevention, XSS prevention, and secure deployment configurations. | django-security/ |
| [django-tdd](django-tdd/SKILL.md) | Django testing strategies with pytest-django, TDD methodology, factory_boy, mocking, coverage, and testing Django REST Framework APIs. | django-tdd/ |
| [django-verification](django-verification/SKILL.md) | Verification loop for Django projects: migrations, linting, tests with coverage, security scans, and deployment readiness checks before release or PR. | django-verification/ |

### General

| 名称 | 说明 | 位置 |
|---|---|---|
| [api-design](api-design/SKILL.md) | REST API design patterns including resource naming, status codes, pagination, filtering, error responses, versioning, and rate limiting for production APIs. | api-design/ |
| [article-writing](article-writing/SKILL.md) | Write articles, guides, blog posts, tutorials, newsletter issues, and other long-form content in a distinctive voice derived from supplied examples or brand guidance. Use when the user wants polished written content longer than a paragraph, especially when voice consistency, structure, and credibility matter. | article-writing/ |
| [autonomous-loops](autonomous-loops/SKILL.md) | Patterns and architectures for autonomous Claude Code loops — from simple sequential pipelines to RFC-driven multi-agent DAG systems. | autonomous-loops/ |
| [clickhouse-io](clickhouse-io/SKILL.md) | ClickHouse database patterns, query optimization, analytics, and data engineering best practices for high-performance analytical workloads. | clickhouse-io/ |
| [coding-standards](coding-standards/SKILL.md) | Universal coding standards, best practices, and patterns for TypeScript, JavaScript, React, and Node.js development. | coding-standards/ |
| [configure-ecc](configure-ecc/SKILL.md) | Interactive installer for Everything Claude Code — guides users through selecting and installing skills and rules to user-level or project-level directories, verifies paths, and optionally optimizes installed files. | configure-ecc/ |
| [content-engine](content-engine/SKILL.md) | Create platform-native content systems for X, LinkedIn, TikTok, YouTube, newsletters, and repurposed multi-platform campaigns. Use when the user wants social posts, threads, scripts, content calendars, or one source asset adapted cleanly across platforms. | content-engine/ |
| [content-hash-cache-pattern](content-hash-cache-pattern/SKILL.md) | Cache expensive file processing results using SHA-256 content hashes — path-independent, auto-invalidating, with service layer separation. | content-hash-cache-pattern/ |
| [continuous-learning](continuous-learning/SKILL.md) | Automatically extract reusable patterns from Claude Code sessions and save them as learned skills for future use. | continuous-learning/ |
| [continuous-learning-v2](continuous-learning-v2/SKILL.md) | Instinct-based learning system that observes sessions via hooks, creates atomic instincts with confidence scoring, and evolves them into skills/commands/agents. v2.1 adds project-scoped instincts to prevent cross-project contamination. | continuous-learning-v2/ |
| [cost-aware-llm-pipeline](cost-aware-llm-pipeline/SKILL.md) | Cost optimization patterns for LLM API usage — model routing by task complexity, budget tracking, retry logic, and prompt caching. | cost-aware-llm-pipeline/ |
| [database-migrations](database-migrations/SKILL.md) | Database migration best practices for schema changes, data migrations, rollbacks, and zero-downtime deployments across PostgreSQL, MySQL, and common ORMs (Prisma, Drizzle, Django, TypeORM, golang-migrate). | database-migrations/ |
| [eval-harness](eval-harness/SKILL.md) | Formal evaluation framework for Claude Code sessions implementing eval-driven development (EDD) principles | eval-harness/ |
| [foundation-models-on-device](foundation-models-on-device/SKILL.md) | Apple FoundationModels framework for on-device LLM — text generation, guided generation with @Generable, tool calling, and snapshot streaming in iOS 26+. | foundation-models-on-device/ |
| [frontend-slides](frontend-slides/SKILL.md) | Create stunning, animation-rich HTML presentations from scratch or by converting PowerPoint files. Use when the user wants to build a presentation, convert a PPT/PPTX to web, or create slides for a talk/pitch. Helps non-designers discover their aesthetic through visual exploration rather than abstract choices. | frontend-slides/ |
| [investor-materials](investor-materials/SKILL.md) | Create and update pitch decks, one-pagers, investor memos, accelerator applications, financial models, and fundraising materials. Use when the user needs investor-facing documents, projections, use-of-funds tables, milestone plans, or materials that must stay internally consistent across multiple fundraising assets. | investor-materials/ |
| [investor-outreach](investor-outreach/SKILL.md) | Draft cold emails, warm intro blurbs, follow-ups, update emails, and investor communications for fundraising. Use when the user wants outreach to angels, VCs, strategic investors, or accelerators and needs concise, personalized, investor-facing messaging. | investor-outreach/ |
| [kreuzberg](kreuzberg/SKILL.md) | >- | kreuzberg/ |
| [liquid-glass-design](liquid-glass-design/SKILL.md) | iOS 26 Liquid Glass design system — dynamic glass material with blur, reflection, and interactive morphing for SwiftUI, UIKit, and WidgetKit. | liquid-glass-design/ |
| [market-research](market-research/SKILL.md) | Conduct market research, competitive analysis, investor due diligence, and industry intelligence with source attribution and decision-oriented summaries. Use when the user wants market sizing, competitor comparisons, fund research, technology scans, or research that informs business decisions. | market-research/ |
| [nutrient-document-processing](nutrient-document-processing/SKILL.md) | Process, convert, OCR, extract, redact, sign, and fill documents using the Nutrient DWS API. Works with PDFs, DOCX, XLSX, PPTX, HTML, and images. | nutrient-document-processing/ |
| [plankton-code-quality](plankton-code-quality/SKILL.md) | Write-time code quality enforcement using Plankton — auto-formatting, linting, and Claude-powered fixes on every file edit via hooks. | plankton-code-quality/ |
| [project-guidelines-example](project-guidelines-example/SKILL.md) | Example project-specific skill template based on a real production application. | project-guidelines-example/ |
| [regex-vs-llm-structured-text](regex-vs-llm-structured-text/SKILL.md) | Decision framework for choosing between regex and LLM when parsing structured text — start with regex, add LLM only for low-confidence edge cases. | regex-vs-llm-structured-text/ |
| [skill-stocktake](skill-stocktake/SKILL.md) | Use when auditing Claude skills and commands for quality. Supports Quick Scan (changed skills only) and Full Stocktake modes with sequential subagent batch evaluation. | skill-stocktake/ |
| [strategic-compact](strategic-compact/SKILL.md) | Suggests manual context compaction at logical intervals to preserve context through task phases rather than arbitrary auto-compaction. | strategic-compact/ |
| [visa-doc-translate](visa-doc-translate/SKILL.md) | Translate visa application documents (images) to English and create a bilingual PDF with original and translation | visa-doc-translate/ |

### Go

| 名称 | 说明 | 位置 |
|---|---|---|
| [golang-patterns](golang-patterns/SKILL.md) | Idiomatic Go patterns, best practices, and conventions for building robust, efficient, and maintainable Go applications. | golang-patterns/ |
| [golang-testing](golang-testing/SKILL.md) | Go testing patterns including table-driven tests, subtests, benchmarks, fuzzing, and test coverage. Follows TDD methodology with idiomatic Go practices. | golang-testing/ |

### Java

| 名称 | 说明 | 位置 |
|---|---|---|
| [java-coding-standards](java-coding-standards/SKILL.md) | Java coding standards for Spring Boot services: naming, immutability, Optional usage, streams, exceptions, generics, and project layout. | java-coding-standards/ |

### Patterns

| 名称 | 说明 | 位置 |
|---|---|---|
| [backend-patterns](backend-patterns/SKILL.md) | Backend architecture patterns, API design, database optimization, and server-side best practices for Node.js, Express, and Next.js API routes. | backend-patterns/ |
| [deployment-patterns](deployment-patterns/SKILL.md) | Deployment workflows, CI/CD pipeline patterns, Docker containerization, health checks, rollback strategies, and production readiness checklists for web applications. | deployment-patterns/ |
| [docker-patterns](docker-patterns/SKILL.md) | Docker and Docker Compose patterns for local development, container security, networking, volume strategies, and multi-service orchestration. | docker-patterns/ |
| [frontend-patterns](frontend-patterns/SKILL.md) | Frontend development patterns for React, Next.js, state management, performance optimization, and UI best practices. | frontend-patterns/ |
| [jpa-patterns](jpa-patterns/SKILL.md) | JPA/Hibernate patterns for entity design, relationships, query optimization, transactions, auditing, indexing, pagination, and pooling in Spring Boot. | jpa-patterns/ |
| [postgres-patterns](postgres-patterns/SKILL.md) | PostgreSQL database patterns for query optimization, schema design, indexing, and security. Based on Supabase best practices. | postgres-patterns/ |

### Python

| 名称 | 说明 | 位置 |
|---|---|---|
| [python-patterns](python-patterns/SKILL.md) | Pythonic idioms, PEP 8 standards, type hints, and best practices for building robust, efficient, and maintainable Python applications. | python-patterns/ |
| [python-testing](python-testing/SKILL.md) | Python testing strategies using pytest, TDD methodology, fixtures, mocking, parametrization, and coverage requirements. | python-testing/ |

### Security

| 名称 | 说明 | 位置 |
|---|---|---|
| [security-review](security-review/SKILL.md) | Use this skill when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment/sensitive features. Provides comprehensive security checklist and patterns. | security-review/ |
| [security-scan](security-scan/SKILL.md) | Scan your Claude Code configuration (.claude/ directory) for security vulnerabilities, misconfigurations, and injection risks using AgentShield. Checks CLAUDE.md, settings.json, MCP servers, hooks, and agent definitions. | security-scan/ |

### Spring Boot

| 名称 | 说明 | 位置 |
|---|---|---|
| [springboot-patterns](springboot-patterns/SKILL.md) | Spring Boot architecture patterns, REST API design, layered services, data access, caching, async processing, and logging. Use for Java Spring Boot backend work. | springboot-patterns/ |
| [springboot-security](springboot-security/SKILL.md) | Spring Security best practices for authn/authz, validation, CSRF, secrets, headers, rate limiting, and dependency security in Java Spring Boot services. | springboot-security/ |
| [springboot-tdd](springboot-tdd/SKILL.md) | Test-driven development for Spring Boot using JUnit 5, Mockito, MockMvc, Testcontainers, and JaCoCo. Use when adding features, fixing bugs, or refactoring. | springboot-tdd/ |
| [springboot-verification](springboot-verification/SKILL.md) | Verification loop for Spring Boot projects: build, static analysis, tests with coverage, security scans, and diff review before release or PR. | springboot-verification/ |

### Swift

| 名称 | 说明 | 位置 |
|---|---|---|
| [swift-actor-persistence](swift-actor-persistence/SKILL.md) | Thread-safe data persistence in Swift using actors — in-memory cache with file-backed storage, eliminating data races by design. | swift-actor-persistence/ |
| [swift-concurrency-6-2](swift-concurrency-6-2/SKILL.md) | Swift 6.2 Approachable Concurrency — single-threaded by default, @concurrent for explicit background offloading, isolated conformances for main actor types. | swift-concurrency-6-2/ |
| [swift-protocol-di-testing](swift-protocol-di-testing/SKILL.md) | Protocol-based dependency injection for testable Swift code — mock file system, network, and external APIs using focused protocols and Swift Testing. | swift-protocol-di-testing/ |
| [swiftui-patterns](swiftui-patterns/SKILL.md) | SwiftUI architecture patterns, state management with @Observable, view composition, navigation, performance optimization, and modern iOS/macOS UI best practices. | swiftui-patterns/ |

### Testing

| 名称 | 说明 | 位置 |
|---|---|---|
| [e2e-testing](e2e-testing/SKILL.md) | Playwright E2E testing patterns, Page Object Model, configuration, CI/CD integration, artifact management, and flaky test strategies. | e2e-testing/ |
| [tdd-workflow](tdd-workflow/SKILL.md) | Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage including unit, integration, and E2E tests. | tdd-workflow/ |
| [test-driven-development](test-driven-development/SKILL.md) | Use when implementing any feature or bugfix, before writing implementation code | test-driven-development/ |

### Workflow

| 名称 | 说明 | 位置 |
|---|---|---|
| [brainstorming](brainstorming/SKILL.md) | You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation. | brainstorming/ |
| [dispatching-parallel-agents](dispatching-parallel-agents/SKILL.md) | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies | dispatching-parallel-agents/ |
| [executing-plans](executing-plans/SKILL.md) | Use when you have a written implementation plan to execute in a separate session with review checkpoints | executing-plans/ |
| [finishing-a-development-branch](finishing-a-development-branch/SKILL.md) | Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup | finishing-a-development-branch/ |
| [iterative-retrieval](iterative-retrieval/SKILL.md) | Pattern for progressively refining context retrieval to solve the subagent context problem | iterative-retrieval/ |
| [receiving-code-review](receiving-code-review/SKILL.md) | Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation | receiving-code-review/ |
| [requesting-code-review](requesting-code-review/SKILL.md) | Use when completing tasks, implementing major features, or before merging to verify work meets requirements | requesting-code-review/ |
| [search-first](search-first/SKILL.md) | Research-before-coding workflow. Search for existing tools, libraries, and patterns before writing custom code. Invokes the researcher agent. | search-first/ |
| [subagent-driven-development](subagent-driven-development/SKILL.md) | Use when executing implementation plans with independent tasks in the current session | subagent-driven-development/ |
| [systematic-debugging](systematic-debugging/SKILL.md) | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes | systematic-debugging/ |
| [using-git-worktrees](using-git-worktrees/SKILL.md) | Use when starting feature work that needs isolation from current workspace or before executing implementation plans - creates isolated git worktrees with smart directory selection and safety verification | using-git-worktrees/ |
| [using-superpowers](using-superpowers/SKILL.md) | Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions | using-superpowers/ |
| [verification-before-completion](verification-before-completion/SKILL.md) | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always | verification-before-completion/ |
| [verification-loop](verification-loop/SKILL.md) | A comprehensive verification system for Claude Code sessions. | verification-loop/ |
| [writing-plans](writing-plans/SKILL.md) | Use when you have a spec or requirements for a multi-step task, before touching code | writing-plans/ |
| [writing-skills](writing-skills/SKILL.md) | Use when creating new skills, editing existing skills, or verifying skills work before deployment | writing-skills/ |

## Agent Prompts（按目录归类）

### agent-tools/

| 名称 | 说明 | 文件 |
|---|---|---|
| [architect](agent-tools/architect.md) | Software architecture specialist for system design, scalability, and technical decision-making. Use PROACTIVELY when planning new features, refactoring large systems, or making architectural decisions. | agent-tools/architect.md |
| [build-error-resolver](agent-tools/build-error-resolver.md) | Build and TypeScript error resolution specialist. Use PROACTIVELY when build fails or type errors occur. Fixes build/type errors only with minimal diffs, no architectural edits. Focuses on getting the build green quickly. | agent-tools/build-error-resolver.md |
| [chief-of-staff](agent-tools/chief-of-staff.md) | Personal communication chief of staff that triages email, Slack, LINE, and Messenger. Classifies messages into 4 tiers (skip/info_only/meeting_info/action_required), generates draft replies, and enforces post-send follow-through via hooks. Use when managing multi-channel communication workflows. | agent-tools/chief-of-staff.md |
| [code-reviewer](agent-tools/code-reviewer.md) | Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code. MUST BE USED for all code changes. | agent-tools/code-reviewer.md |
| [database-reviewer](agent-tools/database-reviewer.md) | PostgreSQL database specialist for query optimization, schema design, security, and performance. Use PROACTIVELY when writing SQL, creating migrations, designing schemas, or troubleshooting database performance. Incorporates Supabase best practices. | agent-tools/database-reviewer.md |
| [doc-updater](agent-tools/doc-updater.md) | Documentation and codemap specialist. Use PROACTIVELY for updating codemaps and documentation. Runs /update-codemaps and /update-docs, generates docs/CODEMAPS/*, updates READMEs and guides. | agent-tools/doc-updater.md |
| [e2e-runner](agent-tools/e2e-runner.md) | End-to-end testing specialist using Vercel Agent Browser (preferred) with Playwright fallback. Use PROACTIVELY for generating, maintaining, and running E2E tests. Manages test journeys, quarantines flaky tests, uploads artifacts (screenshots, videos, traces), and ensures critical user flows work. | agent-tools/e2e-runner.md |
| [go-build-resolver](agent-tools/go-build-resolver.md) | Go build, vet, and compilation error resolution specialist. Fixes build errors, go vet issues, and linter warnings with minimal changes. Use when Go builds fail. | agent-tools/go-build-resolver.md |
| [go-reviewer](agent-tools/go-reviewer.md) | Expert Go code reviewer specializing in idiomatic Go, concurrency patterns, error handling, and performance. Use for all Go code changes. MUST BE USED for Go projects. | agent-tools/go-reviewer.md |
| [planner](agent-tools/planner.md) | Expert planning specialist for complex features and refactoring. Use PROACTIVELY when users request feature implementation, architectural changes, or complex refactoring. Automatically activated for planning tasks. | agent-tools/planner.md |
| [python-reviewer](agent-tools/python-reviewer.md) | Expert Python code reviewer specializing in PEP 8 compliance, Pythonic idioms, type hints, security, and performance. Use for all Python code changes. MUST BE USED for Python projects. | agent-tools/python-reviewer.md |
| [refactor-cleaner](agent-tools/refactor-cleaner.md) | Dead code cleanup and consolidation specialist. Use PROACTIVELY for removing unused code, duplicates, and refactoring. Runs analysis tools (knip, depcheck, ts-prune) to identify dead code and safely removes it. | agent-tools/refactor-cleaner.md |
| [security-reviewer](agent-tools/security-reviewer.md) | Security vulnerability detection and remediation specialist. Use PROACTIVELY after writing code that handles user input, authentication, API endpoints, or sensitive data. Flags secrets, SSRF, injection, unsafe crypto, and OWASP Top 10 vulnerabilities. | agent-tools/security-reviewer.md |
| [tdd-guide](agent-tools/tdd-guide.md) | Test-Driven Development specialist enforcing write-tests-first methodology. Use PROACTIVELY when writing new features, fixing bugs, or refactoring code. Ensures 80%+ test coverage. | agent-tools/tdd-guide.md |

### continuous-learning-v2/

| 名称 | 说明 | 文件 |
|---|---|---|
| [observer](continuous-learning-v2/agents/observer.md) | Background agent that analyzes session observations to detect patterns and create instincts. Uses Haiku for cost-efficiency. v2.1 adds project-scoped instincts. | continuous-learning-v2/agents/observer.md |

### design/

| 名称 | 说明 | 文件 |
|---|---|---|
| [Brand Guardian](design/design-brand-guardian.md) | Expert brand strategist and guardian specializing in brand identity development, consistency maintenance, and strategic brand positioning | design/design-brand-guardian.md |
| [Image Prompt Engineer](design/design-image-prompt-engineer.md) | Expert photography prompt engineer specializing in crafting detailed, evocative prompts for AI image generation. Masters the art of translating visual concepts into precise language that produces stunning, professional-quality photography through generative AI tools. | design/design-image-prompt-engineer.md |
| [UI Designer](design/design-ui-designer.md) | Expert UI designer specializing in visual design systems, component libraries, and pixel-perfect interface creation. Creates beautiful, consistent, accessible user interfaces that enhance UX and reflect brand identity | design/design-ui-designer.md |
| [UX Architect](design/design-ux-architect.md) | Technical architecture and UX specialist who provides developers with solid foundations, CSS systems, and clear implementation guidance | design/design-ux-architect.md |
| [UX Researcher](design/design-ux-researcher.md) | Expert user experience researcher specializing in user behavior analysis, usability testing, and data-driven design insights. Provides actionable research findings that improve product usability and user satisfaction | design/design-ux-researcher.md |
| [Visual Storyteller](design/design-visual-storyteller.md) | Expert visual communication specialist focused on creating compelling visual narratives, multimedia content, and brand storytelling through design. Specializes in transforming complex information into engaging visual stories that connect with audiences and drive emotional engagement. | design/design-visual-storyteller.md |
| [Whimsy Injector](design/design-whimsy-injector.md) | Expert creative specialist focused on adding personality, delight, and playful elements to brand experiences. Creates memorable, joyful interactions that differentiate brands through unexpected moments of whimsy | design/design-whimsy-injector.md |

### engineering/

| 名称 | 说明 | 文件 |
|---|---|---|
| [AI Engineer](engineering/engineering-ai-engineer.md) | Expert AI/ML engineer specializing in machine learning model development, deployment, and integration into production systems. Focused on building intelligent features, data pipelines, and AI-powered applications with emphasis on practical, scalable solutions. | engineering/engineering-ai-engineer.md |
| [Backend Architect](engineering/engineering-backend-architect.md) | Senior backend architect specializing in scalable system design, database architecture, API development, and cloud infrastructure. Builds robust, secure, performant server-side applications and microservices | engineering/engineering-backend-architect.md |
| [DevOps Automator](engineering/engineering-devops-automator.md) | Expert DevOps engineer specializing in infrastructure automation, CI/CD pipeline development, and cloud operations | engineering/engineering-devops-automator.md |
| [Frontend Developer](engineering/engineering-frontend-developer.md) | Expert frontend developer specializing in modern web technologies, React/Vue/Angular frameworks, UI implementation, and performance optimization | engineering/engineering-frontend-developer.md |
| [Mobile App Builder](engineering/engineering-mobile-app-builder.md) | Specialized mobile application developer with expertise in native iOS/Android development and cross-platform frameworks | engineering/engineering-mobile-app-builder.md |
| [Rapid Prototyper](engineering/engineering-rapid-prototyper.md) | Specialized in ultra-fast proof-of-concept development and MVP creation using efficient tools and frameworks | engineering/engineering-rapid-prototyper.md |
| [Senior Developer](engineering/engineering-senior-developer.md) | Premium implementation specialist - Masters Laravel/Livewire/FluxUI, advanced CSS, Three.js integration | engineering/engineering-senior-developer.md |

### marketing/

| 名称 | 说明 | 文件 |
|---|---|---|
| [App Store Optimizer](marketing/marketing-app-store-optimizer.md) | Expert app store marketing specialist focused on App Store Optimization (ASO), conversion rate optimization, and app discoverability | marketing/marketing-app-store-optimizer.md |
| [Content Creator](marketing/marketing-content-creator.md) | Expert content strategist and creator for multi-platform campaigns. Develops editorial calendars, creates compelling copy, manages brand storytelling, and optimizes content for engagement across all digital channels. | marketing/marketing-content-creator.md |
| [Growth Hacker](marketing/marketing-growth-hacker.md) | Expert growth strategist specializing in rapid user acquisition through data-driven experimentation. Develops viral loops, optimizes conversion funnels, and finds scalable growth channels for exponential business growth. | marketing/marketing-growth-hacker.md |
| [Instagram Curator](marketing/marketing-instagram-curator.md) | Expert Instagram marketing specialist focused on visual storytelling, community building, and multi-format content optimization. Masters aesthetic development and drives meaningful engagement. | marketing/marketing-instagram-curator.md |
| [Reddit Community Builder](marketing/marketing-reddit-community-builder.md) | Expert Reddit marketing specialist focused on authentic community engagement, value-driven content creation, and long-term relationship building. Masters Reddit culture navigation. | marketing/marketing-reddit-community-builder.md |
| [Social Media Strategist](marketing/marketing-social-media-strategist.md) | Expert social media strategist for Twitter, LinkedIn, and professional platforms. Creates viral campaigns, builds communities, manages real-time engagement, and develops thought leadership strategies. | marketing/marketing-social-media-strategist.md |
| [TikTok Strategist](marketing/marketing-tiktok-strategist.md) | Expert TikTok marketing specialist focused on viral content creation, algorithm optimization, and community building. Masters TikTok's unique culture and features for brand growth. | marketing/marketing-tiktok-strategist.md |
| [Twitter Engager](marketing/marketing-twitter-engager.md) | Expert Twitter marketing specialist focused on real-time engagement, thought leadership building, and community-driven growth. Masters LinkedIn campaigns and professional social media strategy. | marketing/marketing-twitter-engager.md |

### product/

| 名称 | 说明 | 文件 |
|---|---|---|
| [Feedback Synthesizer](product/product-feedback-synthesizer.md) | Expert in collecting, analyzing, and synthesizing user feedback from multiple channels to extract actionable product insights. Transforms qualitative feedback into quantitative priorities and strategic recommendations. | product/product-feedback-synthesizer.md |
| [Sprint Prioritizer](product/product-sprint-prioritizer.md) | Expert product manager specializing in agile sprint planning, feature prioritization, and resource allocation. Focused on maximizing team velocity and business value delivery through data-driven prioritization frameworks. | product/product-sprint-prioritizer.md |
| [Trend Researcher](product/product-trend-researcher.md) | Expert market intelligence analyst specializing in identifying emerging trends, competitive analysis, and opportunity assessment. Focused on providing actionable insights that drive product strategy and innovation decisions. | product/product-trend-researcher.md |

### project-management/

| 名称 | 说明 | 文件 |
|---|---|---|
| [Experiment Tracker](project-management/project-management-experiment-tracker.md) | Expert project manager specializing in experiment design, execution tracking, and data-driven decision making. Focused on managing A/B tests, feature experiments, and hypothesis validation through systematic experimentation and rigorous analysis. | project-management/project-management-experiment-tracker.md |
| [Project Shepherd](project-management/project-management-project-shepherd.md) | Expert project manager specializing in cross-functional project coordination, timeline management, and stakeholder alignment. Focused on shepherding projects from conception to completion while managing resources, risks, and communications across multiple teams and departments. | project-management/project-management-project-shepherd.md |
| [Senior Project Manager](project-management/project-manager-senior.md) | Converts specs to tasks, remembers previous projects\n - Focused on realistic scope, no background processes, exact spec requirements | project-management/project-manager-senior.md |
| [Studio Operations](project-management/project-management-studio-operations.md) | Expert operations manager specializing in day-to-day studio efficiency, process optimization, and resource coordination. Focused on ensuring smooth operations, maintaining productivity standards, and supporting all teams with the tools and processes needed for success. | project-management/project-management-studio-operations.md |
| [Studio Producer](project-management/project-management-studio-producer.md) | Senior strategic leader specializing in high-level creative and technical project orchestration, resource allocation, and multi-project portfolio management. Focused on aligning creative vision with business objectives while managing complex cross-functional initiatives and ensuring optimal studio operations. | project-management/project-management-studio-producer.md |

### spatial-computing/

| 名称 | 说明 | 文件 |
|---|---|---|
| [macOS Spatial/Metal Engineer](spatial-computing/macos-spatial-metal-engineer.md) | Native Swift and Metal specialist building high-performance 3D rendering systems and spatial computing experiences for macOS and Vision Pro | spatial-computing/macos-spatial-metal-engineer.md |
| [Terminal Integration Specialist](spatial-computing/terminal-integration-specialist.md) | Terminal emulation, text rendering optimization, and SwiftTerm integration for modern Swift applications | spatial-computing/terminal-integration-specialist.md |
| [visionOS Spatial Engineer](spatial-computing/visionos-spatial-engineer.md) | Native visionOS spatial computing, SwiftUI volumetric interfaces, and Liquid Glass design implementation | spatial-computing/visionos-spatial-engineer.md |
| [XR Cockpit Interaction Specialist](spatial-computing/xr-cockpit-interaction-specialist.md) | Specialist in designing and developing immersive cockpit-based control systems for XR environments | spatial-computing/xr-cockpit-interaction-specialist.md |
| [XR Immersive Developer](spatial-computing/xr-immersive-developer.md) | Expert WebXR and immersive technology developer with specialization in browser-based AR/VR/XR applications | spatial-computing/xr-immersive-developer.md |
| [XR Interface Architect](spatial-computing/xr-interface-architect.md) | Spatial interaction designer and interface strategist for immersive AR/VR/XR environments | spatial-computing/xr-interface-architect.md |

### specialized/

| 名称 | 说明 | 文件 |
|---|---|---|
| [Agentic Identity & Trust Architect](specialized/agentic-identity-trust.md) | Designs identity, authentication, and trust verification systems for autonomous AI agents operating in multi-agent environments. Ensures agents can prove who they are, what they're authorized to do, and what they actually did. | specialized/agentic-identity-trust.md |
| [Agents Orchestrator](specialized/agents-orchestrator.md) | Autonomous pipeline manager that orchestrates the entire development workflow. You are the leader of this process. | specialized/agents-orchestrator.md |
| [Data Analytics Reporter](specialized/data-analytics-reporter.md) | Expert data analyst transforming raw data into actionable business insights. Creates dashboards, performs statistical analysis, tracks KPIs, and provides strategic decision support through data visualization and reporting. | specialized/data-analytics-reporter.md |
| [Data Consolidation Agent](specialized/data-consolidation-agent.md) | AI agent that consolidates extracted sales data into live reporting dashboards with territory, rep, and pipeline summaries | specialized/data-consolidation-agent.md |
| [LSP/Index Engineer](specialized/lsp-index-engineer.md) | Language Server Protocol specialist building unified code intelligence systems through LSP client orchestration and semantic indexing | specialized/lsp-index-engineer.md |
| [Report Distribution Agent](specialized/report-distribution-agent.md) | AI agent that automates distribution of consolidated sales reports to representatives based on territorial parameters | specialized/report-distribution-agent.md |
| [Sales Data Extraction Agent](specialized/sales-data-extraction-agent.md) | AI agent specialized in monitoring Excel files and extracting key sales metrics (MTD, YTD, Year End) for internal live reporting | specialized/sales-data-extraction-agent.md |

### support/

| 名称 | 说明 | 文件 |
|---|---|---|
| [Analytics Reporter](support/support-analytics-reporter.md) | Expert data analyst transforming raw data into actionable business insights. Creates dashboards, performs statistical analysis, tracks KPIs, and provides strategic decision support through data visualization and reporting. | support/support-analytics-reporter.md |
| [Executive Summary Generator](support/support-executive-summary-generator.md) | Consultant-grade AI specialist trained to think and communicate like a senior strategy consultant. Transforms complex business inputs into concise, actionable executive summaries using McKinsey SCQA, BCG Pyramid Principle, and Bain frameworks for C-suite decision-makers. | support/support-executive-summary-generator.md |
| [Finance Tracker](support/support-finance-tracker.md) | Expert financial analyst and controller specializing in financial planning, budget management, and business performance analysis. Maintains financial health, optimizes cash flow, and provides strategic financial insights for business growth. | support/support-finance-tracker.md |
| [Infrastructure Maintainer](support/support-infrastructure-maintainer.md) | Expert infrastructure specialist focused on system reliability, performance optimization, and technical operations management. Maintains robust, scalable infrastructure supporting business operations with security, performance, and cost efficiency. | support/support-infrastructure-maintainer.md |
| [Legal Compliance Checker](support/support-legal-compliance-checker.md) | Expert legal and compliance specialist ensuring business operations, data handling, and content creation comply with relevant laws, regulations, and industry standards across multiple jurisdictions. | support/support-legal-compliance-checker.md |
| [Support Responder](support/support-support-responder.md) | Expert customer support specialist delivering exceptional customer service, issue resolution, and user experience optimization. Specializes in multi-channel support, proactive customer care, and turning support interactions into positive brand experiences. | support/support-support-responder.md |

### testing/

| 名称 | 说明 | 文件 |
|---|---|---|
| [API Tester](testing/testing-api-tester.md) | Expert API testing specialist focused on comprehensive API validation, performance testing, and quality assurance across all systems and third-party integrations | testing/testing-api-tester.md |
| [Evidence Collector](testing/testing-evidence-collector.md) | Screenshot-obsessed, fantasy-allergic QA specialist - Default to finding 3-5 issues, requires visual proof for everything | testing/testing-evidence-collector.md |
| [Performance Benchmarker](testing/testing-performance-benchmarker.md) | Expert performance testing and optimization specialist focused on measuring, analyzing, and improving system performance across all applications and infrastructure | testing/testing-performance-benchmarker.md |
| [Reality Checker](testing/testing-reality-checker.md) | Stops fantasy approvals, evidence-based certification - Default to "NEEDS WORK", requires overwhelming proof for production readiness | testing/testing-reality-checker.md |
| [Test Results Analyzer](testing/testing-test-results-analyzer.md) | Expert test analysis specialist focused on comprehensive test result evaluation, quality metrics analysis, and actionable insight generation from testing activities | testing/testing-test-results-analyzer.md |
| [Tool Evaluator](testing/testing-tool-evaluator.md) | Expert technology assessment specialist focused on evaluating, testing, and recommending tools, software, and platforms for business use and productivity optimization | testing/testing-tool-evaluator.md |
| [Workflow Optimizer](testing/testing-workflow-optimizer.md) | Expert process improvement specialist focused on analyzing, optimizing, and automating workflows across all business functions for maximum productivity and efficiency | testing/testing-workflow-optimizer.md |

## Playbooks

- [QUICKSTART.md](strategy/QUICKSTART.md)
- [EXECUTIVE-BRIEF.md](strategy/EXECUTIVE-BRIEF.md)
- [nexus-strategy.md](strategy/nexus-strategy.md)
