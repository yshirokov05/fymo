---
description: Development and Efficiency Standards
alwaysApply: true
alwaysOn: true
---

# Development Standards

## 1. Shadow Data Verification
- Any time a backend model (in `models.py` or `firestore_db.py`) is modified, the agent MUST immediately check the frontend `handleSave` and `fetchData` functions in `App.js` to ensure the mapping hasn't broken.

## 2. Context-Aware CSS
- Prioritize using established CSS variables from `index.css` (like `--primary-blue` or `--card-shadow`) over ad-hoc Tailwind classes or inline styles.
- If a new component requires a 'wow' factor, use CSS animations over heavy JS-based libraries.

## 3. Evaluation-First Policy
- All new feature implementations must consider the 'Fresh User' (empty) state. 
- If a feature requires data to work, it must provide a clear 'See how it works' button or CTA using sample data if the user's profile is empty.
