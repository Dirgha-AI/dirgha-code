---
name: dirgha
version: 0.1.0
description: "Dirgha Code — AI coding agent by dirgha.ai"
commands:
  - name: login
    description: "Authenticate with your Dirgha account"
    flags:
      - name: token
        type: string
        description: "Directly set auth token (headless / server use)"
      - name: email
        type: string
        description: "Email to store with token (used with --token)"
      - name: user-id
        type: string
        description: "User ID to store with token (used with --token)"
  - name: logout
    description: "Clear saved credentials"
  - name: setup
    description: "Interactive setup wizard for account, preferences, and platforms"
  - name: init
    description: "Initialise project context in the current directory"
    flags:
      - name: force
        type: boolean
        description: "Re-initialise even if already set up"
      - name: verbose
        type: boolean
        description: "Show key files after scan"
  - name: status
    description: "Show account, quota, sessions, and project status"
  - name: auth
    description: "Configure auth (legacy BYOK — use \"dirgha login\" for v2)"
  - name: keys
    description: "Manage saved API keys (~/.dirgha/keys.json)"
    args:
      - name: action
        type: string
      - name: key
        type: string
      - name: value
        type: string
  - name: chat
    description: "Plain chat (no tools)"
    flags:
      - name: model
        short: m
        type: string
        description: "Override model"
  - name: models
    description: "Manage AI models and providers"
    subcommands:
      - name: list
        description: "List all available models"
        flags:
          - name: provider
            short: p
            type: string
            description: "Filter by provider"
          - name: tag
            short: t
            type: string
            description: "Filter by tag (e.g., free, fast, vision)"
      - name: info
        description: "Show detailed model information"
        args:
          - name: model
            type: string
            required: true
      - name: switch
        description: "Set default model for CLI sessions"
        args:
          - name: model
            type: string
            required: true
      - name: recommend
        description: "Get model recommendation for a task"
        args:
          - name: task
            type: string
      - name: health
        description: "Check LiteLLM proxy health and available models"
      - name: pool
        description: "Manage credential pools"
        subcommands:
          - name: add
            description: "Add credential pool for a provider"
            args:
              - name: provider
                type: string
                required: true
              - name: keys
                type: string
                required: true
            flags:
              - name: strategy
                short: s
                type: string
                description: "Rotation strategy: least_used, round_robin, failover"
          - name: status
            description: "Check credential pool status"
            args:
              - name: provider
                type: string
  - name: curate
    description: "Curate knowledge to the knowledge graph"
    args:
      - name: content
        type: string
        required: true
    flags:
      - name: files
        short: f
        type: string
        description: "Files to attach"
      - name: tags
        short: t
        type: string
        description: "Tags for categorization"
      - name: no-embed
        type: boolean
        description: "Skip generating embedding"
      - name: project
        short: p
        type: boolean
        description: "Associate with current project"
      - name: provider
        type: string
        description: "Embedding provider: ollama|gateway|hash"
  - name: query
    description: "Query the knowledge graph"
    args:
      - name: query
        type: string
        required: true
    flags:
      - name: limit
        short: l
        type: string
        description: "Maximum results"
      - name: tags
        short: t
        type: string
        description: "Filter by tags"
      - name: keyword
        type: boolean
        description: "Use keyword search instead of semantic"
      - name: project
        short: p
        type: boolean
        description: "Search only current project"
  - name: sync
    description: "Sync knowledge graph with cloud"
    subcommands:
      - name: wiki
        description: "Commit wiki changes to local git repo and optionally push"
        flags:
          - name: remote
            short: r
            type: string
            description: "Git remote to push to (e.g. origin)"
      - name: push
        description: "Push local knowledge to cloud"
        flags:
          - name: project
            short: p
            type: boolean
            description: "Sync only current project"
      - name: pull
        description: "Pull knowledge from cloud to local"
        flags:
          - name: project
            short: p
            type: boolean
            description: "Sync only current project"
      - name: status
        description: "Show sync status"
        flags:
          - name: project
            short: p
            type: boolean
            description: "Show only current project status"
  - name: project
    description: "Project identity and management"
    subcommands:
      - name: init
        description: "Initialize new project in current directory"
        args:
          - name: name
            type: string
      - name: certify
        description: "Anchor project identity to Bitcoin via Taproot Assets"
      - name: list
        description: "List all projects"
      - name: switch
        description: "Switch to project"
        args:
          - name: id
            type: string
            required: true
      - name: detect
        description: "Detect project from current directory"
  - name: session
    description: "Session management"
    subcommands:
      - name: create
        description: "Create new session"
        args:
          - name: name
            type: string
            required: true
        flags:
          - name: project
            short: p
            type: string
            description: "Project ID"
      - name: fork
        description: "Fork existing session"
        args:
          - name: from
            type: string
            required: true
          - name: new-name
            type: string
            required: true
        flags:
          - name: project
            short: p
            type: string
            description: "Project ID"
      - name: list
        description: "List sessions in current project"
  - name: context
    description: "Context management"
    subcommands:
      - name: switch
        description: "Switch context"
        args:
          - name: project
            type: string
            required: true
          - name: session
            type: string
      - name: stash
        description: "Stash current context"
        args:
          - name: name
            type: string
      - name: pop
        description: "Restore stashed context"
        args:
          - name: id
            type: string
            required: true
      - name: link
        description: "Link another project for cross-project access"
        args:
          - name: project
            type: string
            required: true
        flags:
          - name: as
            short: a
            type: string
            description: "Alias for linked project"
      - name: status
        description: "Show current context"
  - name: remember
    description: "Save a memory (replaces curate)"
    args:
      - name: content
        type: string
        required: true
    flags:
      - name: type
        short: t
        type: string
        description: "Type: fact|rule|lesson"
      - name: layer
        short: l
        type: string
        description: "Layer: session|project|workspace|global"
      - name: tags
        type: string
        description: "Comma-separated tags"
      - name: topic
        type: string
        description: "Topic for lessons"
      - name: confidence
        type: string
        description: "Confidence 0-1"
      - name: condition
        type: string
        description: "Condition: always|never|when"
      - name: action
        type: string
        description: "Action for rules"
  - name: recall
    description: "Search memories (replaces query)"
    args:
      - name: query
        type: string
    flags:
      - name: type
        short: t
        type: string
        description: "Filter by type"
      - name: layer
        short: l
        type: string
        description: "Filter by layer"
      - name: tags
        type: string
        description: "Comma-separated tags"
      - name: topic
        type: string
        description: "Filter by topic"
      - name: min-truth
        type: string
        description: "Minimum truth score"
      - name: limit
        short: n
        type: string
        description: "Max results"
      - name: hot-only
        type: boolean
        description: "Only hot-tier memories"
  - name: session-start
    description: "Start isolated working session (fresh context)"
    args:
      - name: project-id
        type: string
    flags:
      - name: description
        short: d
        type: string
        description: "Session description"
  - name: session-end
    description: "End session (archive to project)"
  - name: session-status
    description: "Show current session info"
  - name: memory-stats
    description: "Show unified memory statistics"
  - name: ctx
    description: "Show context window (top memories for LLM)"
    args:
      - name: query
        type: string
    flags:
      - name: limit
        short: n
        type: string
        description: "Number of memories"
      - name: min-truth
        type: string
        description: "Minimum truth score"
  - name: swarm
    description: "Multi-agent swarm management"
    subcommands:
      - name: init
        description: "Initialize a new agent colony"
        args:
          - name: name
            type: string
            required: true
        flags:
          - name: domains
            short: d
            type: string
            description: "Domains to include"
          - name: budget
            short: b
            type: string
            description: "Total budget in USD"
          - name: agents
            short: a
            type: string
            description: "Max agents"
      - name: status
        description: "Show colony status"
      - name: task
        description: "Add a task to the colony"
        args:
          - name: title
            type: string
            required: true
        flags:
          - name: domain
            short: d
            type: string
            description: "Domain"
          - name: complexity
            short: c
            type: string
            description: "Complexity"
          - name: critical
            type: boolean
            description: "Mark as critical"
          - name: security
            type: boolean
            description: "Security-critical"
      - name: run
        description: "Process task queue"
      - name: critical-path
        description: "Show critical path tasks"
      - name: salesforce-plan
        description: "Show Salesforce clone project plan"
      - name: optimize
        description: "Run cost optimization on queue"
  - name: voice
    description: "Start voice recording mode"
    flags:
      - name: plex
        short: p
        type: boolean
        description: "Enable Personal Plex (continuous conversation)"
      - name: model
        short: m
        type: string
        description: "STT model: tiny/base/small/large"
  - name: voice-config
    description: "Configure voice settings"
    flags:
      - name: stt
        type: string
        description: "Speech-to-text model"
      - name: llm
        type: string
        description: "LLM model for Plex"
      - name: tts
        type: string
        description: "TTS voice (amy/southern_english_female/none)"
  - name: checkpoint
    description: "Manage checkpoints (shadow-git snapshots and durable workflows)"
    subcommands:
      - name: workflow
        description: "Inspect durable workflow checkpoints for a task"
        args:
          - name: taskId
            type: string
            required: true
      - name: save
        description: "Create a checkpoint"
        args:
          - name: name
            type: string
            required: true
      - name: list
        description: "List checkpoints"
      - name: restore
        description: "Restore a checkpoint"
        args:
          - name: id
            type: string
            required: true
  - name: rollback
    description: "Quick rollback to checkpoint (alias for checkpoint restore)"
    args:
      - name: name
        type: string
        required: true
  - name: sprint
    description: "Manage autonomous sprints — structured task execution with verification"
    subcommands:
      - name: start
        description: "Start a new sprint from a YAML manifest"
        args:
          - name: manifestPath
            type: string
            required: true
        flags:
          - name: yes
            short: y
            type: boolean
            description: "Skip confirmation prompt"
      - name: status
        description: "Show sprint progress or list all sprints"
        args:
          - name: id
            type: string
      - name: pause
        description: "Pause a running sprint after current task completes"
        args:
          - name: id
            type: string
            required: true
      - name: resume
        description: "Resume a paused sprint"
        args:
          - name: id
            type: string
            required: true
        flags:
          - name: manifest
            short: m
            type: string
            description: "Path to manifest YAML file"
      - name: skip
        description: "Skip a task (unblocks dependents)"
        args:
          - name: taskId
            type: string
            required: true
        flags:
          - name: sprint
            short: s
            type: string
            description: "Sprint ID"
      - name: log
        description: "Show sprint event log"
        args:
          - name: id
            type: string
            required: true
        flags:
          - name: limit
            short: n
            type: string
            description: "Number of events to show"
      - name: list
        description: "List all sprints"
      - name: abort
        description: "Abort sprint immediately, preserve state"
        args:
          - name: id
            type: string
            required: true
      - name: inspect
        description: "Full details for a task: prompt, output, verify log, errors"
        args:
          - name: taskId
            type: string
            required: true
        flags:
          - name: sprint
            short: s
            type: string
            description: "Sprint ID"
      - name: _daemon
        description: "Internal: PM2 daemon entry point"
        args:
          - name: id
            type: string
            required: true
          - name: manifestPath
            type: string
            required: true
  - name: run
    description: "Read a markdown plan, generate sprint YAML, and start executing"
    args:
      - name: planFile
        type: string
        required: true
  - name: connect
    description: "Connect to a Dirgha sandbox and open an interactive REPL"
    args:
      - name: sandbox
        type: string
        required: true
      - name: urlOrId
        type: string
        required: true
  - name: dao
    description: "DAO management — create, vote, and manage decentralized organizations"
    subcommands:
      - name: create
        description: "Create a new DAO with Taproot Assets"
        args:
          - name: name
            type: string
            required: true
        flags:
          - name: type
            short: t
            type: string
            description: "Voting type (quadratic|weighted|reputation)"
          - name: chain
            short: c
            type: string
            description: "Blockchain (base|bitcoin)"
          - name: members
            short: m
            type: string
            description: "Initial members (comma-separated pubkeys)"
          - name: quorum
            type: string
            description: "Quorum percentage"
          - name: threshold
            type: string
            description: "Pass threshold percentage"
      - name: list
        description: "List your DAOs"
      - name: show
        description: "Show DAO details and treasury"
        args:
          - name: name
            type: string
            required: true
      - name: deposit
        description: "Deposit sats to DAO treasury"
        args:
          - name: name
            type: string
            required: true
          - name: amount
            type: string
            required: true
      - name: propose
        description: "Create a treasury spend proposal"
        args:
          - name: dao
            type: string
            required: true
          - name: title
            type: string
            required: true
        flags:
          - name: amount
            short: a
            type: string
            description: "Amount in sats"
          - name: to
            short: t
            type: string
            description: "Recipient address"
          - name: description
            short: d
            type: string
            description: "Proposal description"
          - name: deadline
            type: string
            description: "Voting deadline in hours"
      - name: vote
        description: "Vote on a proposal"
        args:
          - name: dao
            type: string
            required: true
          - name: proposalId
            type: string
            required: true
        flags:
          - name: support
            short: s
            type: boolean
            description: "Vote yes"
          - name: reject
            short: r
            type: boolean
            description: "Vote no"
      - name: distribute
        description: "Distribute payments to agents based on work"
        args:
          - name: dao
            type: string
            required: true
        flags:
          - name: dry-run
            type: boolean
            description: "Show distribution without executing"
  - name: make
    description: "Manufacturing and supply chain management"
    subcommands:
      - name: po
        description: "Create a manufacturing Purchase Order with USDC escrow on Polygon"
        args:
          - name: factoryId
            type: string
            required: true
          - name: amount
            type: string
            required: true
        flags:
          - name: batch
            type: string
            description: "Batch size (number of units)"
      - name: certify
        description: "Certify a manufacturing batch and mint Product Passports on Base L2"
        args:
          - name: poId
            type: string
            required: true
        flags:
          - name: hash
            type: string
            description: "BOM/CAD content hash"
  - name: browser
    description: "Browser automation"
    subcommands:
      - name: launch
        description: "Launch Dirgha Browser"
        flags:
          - name: headless
            type: boolean
            description: "Run headless"
          - name: dev
            type: boolean
            description: "Development mode"
      - name: navigate
        description: "Navigate to URL"
        args:
          - name: url
            type: string
            required: true
      - name: clip
        description: "Clip current page"
      - name: chat
        description: "Chat about current page"
        args:
          - name: message
            type: string
      - name: url
        description: "Get current URL"
      - name: title
        description: "Get page title"
      - name: kill
        description: "Stop browser"
      - name: status
        description: "Check browser status"
      - name: goto
        description: "Navigate to URL and capture page data"
        args:
          - name: url
            type: string
            required: true
        flags:
          - name: screenshot
            short: s
            type: boolean
            description: "Take screenshot"
          - name: full
            short: f
            type: boolean
            description: "Full page screenshot"
      - name: extract
        description: "Extract text content from URL"
        args:
          - name: url
            type: string
            required: true
        flags:
          - name: css
            short: c
            type: string
            description: "CSS selector to extract"
      - name: pdf
        description: "Save page as PDF"
        args:
          - name: url
            type: string
            required: true
        flags:
          - name: output
            short: o
            type: string
            description: "Output path"
  - name: projects
    description: "Show recent projects"
  - name: scan
    description: "Security scan for skills, code, and dependencies"
    args:
      - name: path
        type: string
    flags:
      - name: recursive
        short: r
        type: boolean
        description: "Scan directories recursively"
      - name: deps
        type: boolean
        description: "Scan package-lock.json/yarn.lock/pnpm-lock.yaml for CVEs via OSV"
      - name: supply-chain
        type: boolean
        description: "Check node_modules for suspicious install scripts"
      - name: dir
        type: string
        description: "Directory to scan"
      - name: no-prompt-injection
        type: boolean
        description: "Disable prompt injection checks"
      - name: no-data-exfiltration
        type: boolean
        description: "Disable data exfiltration checks"
      - name: no-command-injection
        type: boolean
        description: "Disable command injection checks"
      - name: no-malicious-code
        type: boolean
        description: "Disable malicious code checks"
      - name: no-supply-chain-code
        type: boolean
        description: "Disable supply chain code checks"
      - name: no-secrets
        type: boolean
        description: "Disable secrets detection"
      - name: fail-on-severity
        type: string
        description: "Fail on severity"
      - name: use-llm
        type: boolean
        description: "Enable LLM semantic analysis"
      - name: format
        type: string
        description: "Output format (table|json|markdown|sarif)"
      - name: output
        short: o
        type: string
        description: "Output file"
  - name: mcp
    description: "Model Context Protocol server management"
    flags:
      - name: port
        short: p
        type: string
        description: "Server port"
    subcommands:
      - name: start
        description: "Start HTTP MCP server"
        flags:
          - name: port
            short: p
            type: string
            description: "Server port"
      - name: serve
        description: "Start MCP stdio transport (for Claude Desktop)"
      - name: install
        description: "Install Dirgha as an MCP server in Claude Desktop"
      - name: status
        description: "Show MCP server status"
      - name: stop
        description: "Stop running MCP server"
  - name: research
    description: "Perform deep agentic research on a topic"
    args:
      - name: topic
        type: string
        required: true
    flags:
      - name: depth
        short: d
        type: string
        description: "Research depth (1-3)"
  - name: audit
    description: "Reproduce and verify technical claims from an ArXiv paper"
    args:
      - name: arxiv-id
        type: string
        required: true
  - name: bucky
    description: "Dirgha Abundance — agentic labor marketplace"
    subcommands:
      - name: status
        description: "Marketplace overview: your jobs, DIRGHA balance, agent status"
      - name: jobs
        description: "Job marketplace commands"
        subcommands:
          - name: list
            description: "List available jobs"
            flags:
              - name: status
                type: string
                description: "Filter by status (posted, bidding, in_progress)"
              - name: limit
                type: string
                description: "Max results"
          - name: post
            description: "Post a new job to the marketplace"
            flags:
              - name: title
                type: string
                description: "Job title"
              - name: desc
                type: string
                description: "Job description"
              - name: budget
                type: string
                description: "Budget amount"
              - name: currency
                type: string
                description: "Currency (INR/USDT/SATS)"
              - name: skills
                type: string
                description: "Required skills (comma-separated)"
      - name: guild
        description: "Guild management"
        subcommands:
          - name: list
            description: "List active guilds"
            flags:
              - name: limit
                type: string
                description: "Max results"
          - name: create
            description: "Create a new guild"
            flags:
              - name: name
                type: string
                description: "Guild name"
              - name: specialties
                type: string
                description: "Specialties (comma-separated)"
              - name: governance
                type: string
                description: "Governance rules (lead%,workers%,reserve%)"
          - name: join
            description: "Join a guild by ID"
            args:
              - name: guildId
                type: string
                required: true
          - name: treasury
            description: "View guild treasury balance"
            args:
              - name: guildId
                type: string
                required: true
      - name: agent
        description: "IntakeAgent management"
        subcommands:
          - name: start
            description: "Start IntakeAgent for a guild (auto-bids on matching jobs)"
            args:
              - name: guildId
                type: string
                required: true
            flags:
              - name: threshold
                type: string
                description: "Minimum fit score to auto-bid (0-1)"
          - name: stop
            description: "Stop IntakeAgent for a guild"
            args:
              - name: guildId
                type: string
                required: true
          - name: sessions
            description: "List active agent sessions"
      - name: dirgha
        description: "DIRGHA token balance and stats"
      - name: profile
        description: "Your reputation, attestations, and developer profile"
  - name: join-mesh
    description: "Join Bucky compute mesh as a worker node"
    flags:
      - name: port
        short: p
        type: string
        description: "Listen port"
      - name: node-id
        short: n
        type: string
        description: "Node ID (auto-generated if not set)"
  - name: compact
    description: "Compact context to free tokens"
    flags:
      - name: aggressive
        type: boolean
        description: "More aggressive compaction"
      - name: model
        short: m
        type: string
        description: "Model for summarization"
  - name: mesh
    description: "Local mesh CPU LLM - Team distributed compute"
    subcommands:
      - name: join
        description: "Join team mesh network"
        flags:
          - name: team
            short: t
            type: string
            description: "Team ID"
          - name: workspace
            short: w
            type: string
            description: "Workspace ID"
          - name: cpu
            short: c
            type: string
            description: "Max CPU to share"
          - name: memory
            short: m
            type: string
            description: "Max RAM to share"
          - name: port
            short: p
            type: string
            description: "P2P listen port"
      - name: leave
        description: "Gracefully leave mesh network"
      - name: status
        description: "Show mesh pool status and resources"
      - name: quota
        description: "Show your quota usage and remaining"
        flags:
          - name: member
            short: m
            type: string
            description: "Check quota for member (admin only)"
      - name: add-member
        description: "Add team member (admin only)"
        flags:
          - name: id
            short: i
            type: string
            description: "Member ID"
          - name: name
            short: n
            type: string
            description: "Member name"
          - name: email
            short: e
            type: string
            description: "Email"
          - name: role
            short: r
            type: string
            description: "Role (admin/senior/developer/intern)"
          - name: quota
            type: string
            description: "Daily token quota"
      - name: ask
        description: "Ask LLM via mesh pool"
        args:
          - name: prompt
            type: string
            required: true
        flags:
          - name: model
            short: m
            type: string
            description: "Model to use"
          - name: max-tokens
            type: string
            description: "Max tokens"
          - name: temperature
            short: t
            type: string
            description: "Temperature"
          - name: priority
            short: p
            type: string
            description: "Priority (low/normal/high)"
      - name: consensus
        description: "Show consensus engine stats"
      - name: billing
        description: "Show team billing summary"
  - name: insights
    description: "Show usage insights"
  - name: exec
    description: "Execute command with timeout, auto-retry, and recovery"
    args:
      - name: command
        type: string
        required: true
    flags:
      - name: timeout
        short: t
        type: string
        description: "Timeout in milliseconds"
      - name: retries
        short: r
        type: string
        description: "Number of retry attempts"
      - name: fallback
        short: f
        type: string
        description: "Fallback commands to try on failure"
      - name: chunked
        short: c
        type: boolean
        description: "Use chunked execution for large inputs"
      - name: no-progress
        type: boolean
        description: "Disable progress output"
      - name: max-output
        type: string
        description: "Maximum output bytes"
  - name: paste
    description: "Paste content with line count, byte tracking, and preview"
    flags:
      - name: max-lines
        short: l
        type: string
        description: "Maximum lines to accept"
      - name: max-chars
        short: c
        type: string
        description: "Maximum characters"
      - name: no-preview
        type: boolean
        description: "Disable preview display"
      - name: save
        type: string
        description: "Save to file instead of stdout"
      - name: clipboard
        type: boolean
        description: "Try to paste from system clipboard first"
  - name: monitor
    description: "Execute with real-time health monitoring and stuck detection"
    args:
      - name: command
        type: string
        required: true
    flags:
      - name: timeout
        short: t
        type: string
        description: "Stuck detection threshold"
      - name: memory-warning
        type: string
        description: "Memory warning threshold"
      - name: memory-critical
        type: string
        description: "Memory critical threshold"
  - name: ask
    description: "Run agent headlessly — streams output, exits when done"
    args:
      - name: prompt
        type: string
    flags:
      - name: model
        short: m
        type: string
        description: "Model to use"
      - name: max-turns
        short: n
        type: string
        description: "Max agent iterations"
      - name: resume
        type: string
        description: "Resume from a saved checkpoint"
      - name: session
        type: string
        description: "Set a specific session ID"
      - name: no-tools
        type: boolean
        description: "Disable all tools (pure chat mode)"
      - name: quiet
        type: boolean
        description: "Suppress tool call output, print only final answer"
  - name: hub
    description: "CLI-Hub plugin manager (install/list/search/remove)"
    subcommands:
      - name: search
        description: "Search the plugin registry"
        args:
          - name: query
            type: string
            required: true
        flags:
          - name: category
            short: c
            type: string
            description: "Filter by category"
      - name: install
        description: "Install a plugin from the registry"
        args:
          - name: name
            type: string
            required: true
        flags:
          - name: version
            type: string
            description: "Install a specific version"
          - name: force
            short: f
            type: boolean
            description: "Reinstall if already installed"
      - name: list
        description: "List plugins (default: top 20 from registry)"
        flags:
          - name: installed
            short: i
            type: boolean
            description: "Show only installed plugins"
      - name: remove
        description: "Uninstall a plugin"
        args:
          - name: name
            type: string
            required: true
      - name: info
        description: "Show plugin metadata"
        args:
          - name: name
            type: string
            required: true
      - name: categories
        description: "List plugin categories"
  - name: fleet
    description: "Parallel multi-agent work in isolated git worktrees"
    subcommands:
      - name: launch
        description: "Decompose a goal into parallel subtasks, spawn agents in worktrees"
        args:
          - name: goal
            type: string
            required: true
        flags:
          - name: concurrency
            short: c
            type: string
            description: "Max concurrent agents"
          - name: max-turns
            short: n
            type: string
            description: "Max turns per agent"
          - name: model
            short: m
            type: string
            description: "Model for decomposition + agents"
          - name: verbose
            short: v
            type: boolean
            description: "Stream per-agent output to stderr"
          - name: plan-only
            type: boolean
            description: "Decompose but do not spawn agents (dry run)"
      - name: list
        description: "List all fleet worktrees attached to this repo"
      - name: merge
        description: "Apply an agent's diff back to main (3-way, unstaged)"
        args:
          - name: agentId
            type: string
            required: true
        flags:
          - name: message
            type: string
            description: "Transient commit message"
      - name: triple
        description: "TripleShot: 3 parallel variants (conservative/balanced/bold) + judge picks winner"
        args:
          - name: goal
            type: string
            required: true
        flags:
          - name: model
            short: m
            type: string
            description: "Model for agents + judge"
          - name: max-turns
            short: n
            type: string
            description: "Max turns per agent"
          - name: auto-merge
            type: boolean
            description: "Auto-apply the winner to main as unstaged"
      - name: cleanup
        description: "Remove all fleet worktrees and their branches"
        flags:
          - name: force
            short: f
            type: boolean
            description: "Force removal even with uncommitted changes"
  - name: eval
    description: "Run the built-in eval suite against the active provider"
    flags:
      - name: model
        short: m
        type: string
        description: "Override model for evals"
      - name: ids
        type: string
        description: "Comma-separated task IDs to run (default: all 20)"
      - name: json
        type: boolean
        description: "Output results as JSON"
  - name: stats
    description: "Show usage statistics (sessions, tokens, cost, tools)"
  - name: capture
    description: "Screenshot a web URL to PNG using headless Chromium"
    args:
      - name: url
        type: string
        required: true
      - name: output
        type: string
    flags:
      - name: width
        type: string
        description: "Viewport width"
      - name: height
        type: string
        description: "Viewport height"
      - name: full
        type: boolean
        description: "Full-page screenshot (scroll height)"
  - name: export
    description: "Export last session as md|html|json"
    args:
      - name: format
        type: string
      - name: output
        type: string
  - name: doctor
    description: "Run system health checks (API key, DB, gateway, tools)"
  - name: update
    description: "Check for updates and install the latest @dirgha-ai/cli"
    flags:
      - name: check
        type: boolean
        description: "Only check for updates, do not install"
  - name: support
    description: "Fund the Dirgha Protocol"
  - name: recipe
    description: "Run a recipe file"
    flags:
      - name: recipe
        type: string
        description: "Path to a .yaml or .recipe.yaml recipe file"
      - name: param
        type: string
        description: "Pass a parameter as key=value (repeatable)"
---

# dirgha

Dirgha Code — AI coding agent by dirgha.ai

## Commands

- `dirgha login` — Authenticate with your Dirgha account
- `dirgha logout` — Clear saved credentials
- `dirgha setup` — Interactive setup wizard for account, preferences, and platforms
- `dirgha init` — Initialise project context in the current directory
- `dirgha status` — Show account, quota, sessions, and project status
- `dirgha auth` — Configure auth (legacy BYOK — use "dirgha login" for v2)
- `dirgha keys` — Manage saved API keys (~/.dirgha/keys.json)
- `dirgha chat` — Plain chat (no tools)
- `dirgha models` — Manage AI models and providers
- `dirgha curate` — Curate knowledge to the knowledge graph
- `dirgha query` — Query the knowledge graph
- `dirgha sync` — Sync knowledge graph with cloud
- `dirgha project` — Project identity and management
- `dirgha session` — Session management
- `dirgha context` — Context management
- `dirgha remember` — Save a memory (replaces curate)
- `dirgha recall` — Search memories (replaces query)
- `dirgha session-start` — Start isolated working session (fresh context)
- `dirgha session-end` — End session (archive to project)
- `dirgha session-status` — Show current session info
- `dirgha memory-stats` — Show unified memory statistics
- `dirgha ctx` — Show context window (top memories for LLM)
- `dirgha swarm` — Multi-agent swarm management
- `dirgha voice` — Start voice recording mode
- `dirgha voice-config` — Configure voice settings
- `dirgha checkpoint` — Manage checkpoints (shadow-git snapshots and durable workflows)
- `dirgha rollback` — Quick rollback to checkpoint (alias for checkpoint restore)
- `dirgha sprint` — Manage autonomous sprints — structured task execution with verification
- `dirgha run` — Read a markdown plan, generate sprint YAML, and start executing
- `dirgha connect` — Connect to a Dirgha sandbox and open an interactive REPL
- `dirgha dao` — DAO management — create, vote, and manage decentralized organizations
- `dirgha make` — Manufacturing and supply chain management
- `dirgha browser` — Browser automation
- `dirgha projects` — Show recent projects
- `dirgha scan` — Security scan for skills, code, and dependencies
- `dirgha mcp` — Model Context Protocol server management
- `dirgha research` — Perform deep agentic research on a topic
- `dirgha audit` — Reproduce and verify technical claims from an ArXiv paper
- `dirgha bucky` — Dirgha Abundance — agentic labor marketplace
- `dirgha join-mesh` — Join Bucky compute mesh as a worker node
- `dirgha compact` — Compact context to free tokens
- `dirgha mesh` — Local mesh CPU LLM - Team distributed compute
- `dirgha insights` — Show usage insights
- `dirgha exec` — Execute command with timeout, auto-retry, and recovery
- `dirgha paste` — Paste content with line count, byte tracking, and preview
- `dirgha monitor` — Execute with real-time health monitoring and stuck detection
- `dirgha ask` — Run agent headlessly — streams output, exits when done
- `dirgha hub` — CLI-Hub plugin manager (install/list/search/remove)
- `dirgha fleet` — Parallel multi-agent work in isolated git worktrees
- `dirgha eval` — Run the built-in eval suite against the active provider
- `dirgha stats` — Show usage statistics (sessions, tokens, cost, tools)
- `dirgha capture` — Screenshot a web URL to PNG using headless Chromium
- `dirgha export` — Export last session as md|html|json
- `dirgha doctor` — Run system health checks (API key, DB, gateway, tools)
- `dirgha update` — Check for updates and install the latest @dirgha-ai/cli
- `dirgha support` — Fund the Dirgha Protocol
- `dirgha recipe` — Run a recipe file
