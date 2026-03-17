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
