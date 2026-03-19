---
description: Tiered Model Usage and Guardrails
alwaysApply: true
alwaysOn: true
---

# Tiered Model Usage

## 1. Context and Research (Low-Tier)
- **Always use Gemini 3 Flash** for low-level tasks such as context gathering, reading files, generating summaries, and routine administrative work.

## 2. Complex Engineering (High-Tier)
- Only upgrade to **Gemini 3.1 Pro** or **Claude 4.6** when explicitly asked for complex code generation, deep bug fixing, or high-level architectural reasoning.

## 3. The "5-File" Guardrail
- If a task involves analyzing or modifying **more than 5 files** at once, the agent **MUST** pause and ask for explicit permission before proceeding with a high-tier model.
