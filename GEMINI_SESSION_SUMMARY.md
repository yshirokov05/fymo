# Project Structure Summary

The project has been reorganized to consolidate source code and remove redundant metadata files.

## New Directory Structure

- `/src`: Contains core Python, JavaScript, and R source files.
- `/frontend`: React-based frontend application.
- `/backend`: Flask-based backend application.
- `/.firebase`: Firebase configuration and cache.
- `/.vscode`: VS Code workspace settings.

## Key Files (Root)

- `firebase.json`: Firebase hosting and functions configuration.
- `firestore.rules`: Security rules for Firestore.
- `package.json`: Project-wide dependencies.
- `README.md`: Project overview.
- `.env.example`: Template for environment variables.

## Recent Debt Naming Refinements

- **Enhanced Plaid Debt Naming**: Updated `backend/plaid_service.py` to prioritize brand and product names (e.g., "Chase Sapphire Reserve") by combining display/official names and handling product keywords more intelligently.
- **Manual Override Preservation**: Modified `backend/api.py` to preserve user-provided manual debt names during Plaid syncs, while still allowing generic or generated names (like "Rewards Credit Card") to be updated by the new cleaning logic.
- **Clean Naming Logic**: Improved removal of rewards-related keywords and account masks in `backend/plaid_service.py` to ensure a premium, clean UI display.
26: 
27: ## Recent Sync & UI Improvements
28: 
29: - **Resolved NameError**: Fixed `TaxTreatment` `NameError` in `backend/plaid_service.py` by consolidating imports and removing redundant localized imports.
30: - **Improved Deduplication**: Updated `backend/api.py` to prevent duplicate assets when Plaid reports accounts as both debts and holdings (common for rewards cards).
31: - **Plaid Configuration**: Expanded `create_link_token` to include `auth` and `identity` as optional products, improving connectivity for banks like Synchrony.
32: - **Frontend Fixes**:
33:     - Added **"Debit Card"** as a default transaction category in `frontend/src/components/Budgeting.js`.
34:     - Fixed category switching UI by correcting a CSS typo and adding interactive borders/hover states.
35:     - Resolved production build failures by adding missing state (`isSyncing`) to `App.js` and missing imports to `Layout.js`.
36: - **Verified Deployment**: Full application built and redeployed successfully to Firebase hosting and functions.
