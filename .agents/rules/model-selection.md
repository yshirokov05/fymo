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
The application itself uses **Google Gemini 1.5 Flash** (`gemini-1.5-flash`) for:
- Financial advisor chat (`advisor_service.py`)
- Document extraction (`advisor_service.py` → `extract_document_data()`)
- Statement OCR (`api.py` → `/api/upload_statement`)

Do not change the Gemini model without testing — fallback logic in `_get_model()` in `advisor_service.py` tries multiple model names and the order matters.
