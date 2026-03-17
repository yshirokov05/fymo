---
description: High-Complexity Model Selection
alwaysApply: true
alwaysOn: true
---

# High-Complexity Model Selection

## 1. Complex Task Evaluation
- For any task involving deep architectural changes, complex multi-file debugging, large-scale refactoring, or subtle logic errors (e.g., Plaid sync failures, tax treatment edge cases), the agent MUST prioritize using the most advanced models available (Gemini 3.1 Pro or Claude 4.6).

## 2. Model Escalation
- If current model performance is insufficient for a task (e.g., repeating errors, failing to understand cross-file dependencies), the agent should explicitly request or switch to a higher-tier model if permitted by the environment.
- Complex tasks are defined as those that require a high degree of reasoning, broad context window, or sophisticated code generation beyond routine boilerplate.
