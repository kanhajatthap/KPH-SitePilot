---
name: token-efficiency
description: Guidelines for context conservation, targeted search patterns, progressive disclosure, and minimal file diffs.
trigger: always_on
---

# Token Efficiency Rules

## 1. Context Conservation & Targeted Reads
- Never read whole directories, large bundles, or massive log files into the conversation context.
- Use line-range viewing (`StartLine`, `EndLine`) when inspecting large files (>100 lines).
- Use specific file search and grep patterns (`Select-String`, ripgrep, or targeted file checks) instead of dumping complete file listings.

## 2. Progressive Disclosure
- Always-on rules must remain concise, bulleted, and actionable.
- Detailed step-by-step procedures, schemas, and extensive manuals belong inside specific `.agents/skills/<skill-name>/SKILL.md` or their `references/` subdirectories.
- Activate skills only when relevant to the user request. Do not inject inactive domain knowledge into general prompts.

## 3. Minimal Diffs & Focused Edits
- Edit only the exact lines necessary to accomplish the task.
- Avoid formatting or refactoring unrelated lines in files touched.
- Do not repeat lengthy code explanations or re-explain the entire repository architecture in chat responses; refer concisely to project documents.

## 4. Execution Evidence Over Narrative
- Summarize task results with high signal-to-noise ratio:
  - Exact command executed
  - Files modified or created
  - Test / verification outcome (pass/fail count, exit code)
  - Remaining blockers or next actions
