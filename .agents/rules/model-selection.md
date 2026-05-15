---
description: Tiered Model Usage and Guardrails
alwaysApply: true
alwaysOn: true
---

# Tiered Model Usage

## 1. Routine Tasks (Low-Tier)
Use **claude-haiku-4-5** for:
- Context gathering, file reading, summaries
- Simple bug fixes in a single file
- Documentation updates
- Routine administrative work

## 2. Complex Engineering (High-Tier)
Use **claude-sonnet-4-6** for:
- Multi-file feature implementation
- Deep bug diagnosis
- Architectural reasoning
- Security review and remediation

## 3. The "5-File" Guardrail
If a task requires reading or modifying more than 5 files, pause and confirm the scope with the user before proceeding with a high-tier model.

## 4. AI Features in the App
The application itself uses **Anthropic Claude Sonnet 4.6** (constant `_CLAUDE_MODEL` in `advisor_service.py`) for every AI feature:
- Financial advisor chat — streaming + agentic tool-use loop (`advisor_service.get_financial_advice_stream`)
- Morning + health briefs (`advisor_service.generate_overview` / `generate_health_brief`)
- Goal AI guidance (`api.py` → `/api/goals/ai_guidance`)
- Credit card No-BS summary (`api.py` → `/api/debts/card_summary`)
- Document extraction — paystubs, insurance, bank statements (`statement_processor.py` via Claude vision + document blocks)
- Statement OCR (`api.py` → `/api/upload_statement`)

The Anthropic SDK is the only LLM client in the codebase. Do not reintroduce Google Generative AI, OpenAI, or any other provider without explicit user approval — the AI stack is intentionally single-provider for cost + auditability.

When bumping the Claude model, update only the `_CLAUDE_MODEL` constant in `advisor_service.py` and verify all five call sites still work.
