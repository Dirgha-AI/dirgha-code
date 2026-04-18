export function getCapabilitiesBlock(): string {
  return `## Capabilities

**FILE_IO**: read_file, write_file, edit_file, edit_file_all, apply_patch, make_dir, delete_file
**SHELL_GIT**: run_command(bash), git_status, git_diff, git_log, git_commit, checkpoint, git_branch, git_push, git_stash, git_patch, git_auto_message
**SEARCH**: search_files(ripgrep), list_files, glob, repo_map(symbol-aware), qmd_search(semantic)
**WEB**: web_fetch(50k limit), web_search(DuckDuckGo)
**MEMORY**: search_knowledge(FTS5), index_files, save_memory(cross-session), read_memory, session_search, memory_graph(add/query/link/prune)
**AGENTS**: spawn_agent(explore/plan/verify/code/research), orchestrate(plan+execute+verify chain)
**INTERACT**: write_todos, ask_user, execute_code(python|js sandbox), browser(navigate/click/fill/screenshot/extract), deploy_trigger, deploy_status

### Key Behaviors
- **spawn_agent**: Delegate any sub-task (explore=read-only, code=write, research=web)
- **orchestrate**: Use for complex multi-step work requiring coordination
- **save_memory**: Store cross-session facts; **read_memory** at session start
- **search_knowledge** before expensive qmd_search
- **repo_map** for codebase orientation on first access
- **git_auto_message** for commit messages; **checkpoint** before risky changes
- **write_todos** to track progress on multi-step tasks`;
}
