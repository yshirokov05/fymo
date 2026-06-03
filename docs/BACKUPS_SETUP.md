# Firestore Backups — Setup Runbook

The `scheduled_firestore_backup` Cloud Function (in `main.py`) runs daily at 09:00 UTC and exports the entire Firestore database to a GCS bucket. It **no-ops until `BACKUP_BUCKET` is set**, so it deploys cleanly before the bucket exists. These are managed exports, restorable with `gcloud firestore import`.

## One-time setup (~10 min)

Run from a machine with `gcloud` authenticated to the project (or Cloud Shell).

```bash
PROJECT=personal-finance-app-18cbc
BUCKET=gs://${PROJECT}-firestore-backups
SA=499817200624-compute@developer.gserviceaccount.com   # the Functions runtime service account

# 1. Create a regional bucket (match your Firestore region; us-west2 here)
gcloud storage buckets create $BUCKET --project=$PROJECT --location=us-west2

# 2. Let the Functions service account run Firestore exports
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${SA}" \
  --role="roles/datastore.importExportAdmin"

# 3. Let it write to the bucket
gcloud storage buckets add-iam-policy-binding $BUCKET \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.objectAdmin"

# 4. Auto-expire backups after 30 days (cost control)
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > /tmp/lifecycle.json
gcloud storage buckets update $BUCKET --lifecycle-file=/tmp/lifecycle.json

# 5. Point the function at the bucket (name only, no gs://)
firebase functions:secrets:set BACKUP_BUCKET
# → paste:  personal-finance-app-18cbc-firestore-backups
```

**6. Add `"BACKUP_BUCKET"` back into the `_SECRETS` list in `backend/main.py`.**
It was removed so the deploy wouldn't fail on an uncreated secret; now that the
secret exists, declaring it lets the function read it. (Declaring a secret that
does NOT exist breaks the whole functions deploy — that's why this is a separate,
after-creation step.)

Then redeploy (push any commit, or `firebase deploy --only functions:scheduled_firestore_backup`).

## Verify it works

Trigger it once manually instead of waiting for 09:00 UTC:

```bash
gcloud scheduler jobs run firebase-schedule-scheduled_firestore_backup-us-west2 --location=us-west2
# then check the bucket
gcloud storage ls gs://${PROJECT}-firestore-backups/firestore-backups/
```

You should see a dated folder (e.g. `2026-05-15/`) containing export metadata.

## Restore (disaster recovery)

```bash
# List available backups
gcloud storage ls gs://${PROJECT}-firestore-backups/firestore-backups/

# Import a specific day's export (OVERWRITES current data for the exported collections — be sure)
gcloud firestore import gs://${PROJECT}-firestore-backups/firestore-backups/2026-05-15 --project=$PROJECT
```

⚠️ Import is destructive for the collections it covers. Practice once on a throwaway project if you've never done it, so you're not learning during a real incident.

## Cost

A full export of a small user base is cents per run. The 30-day lifecycle rule keeps storage bounded. Cloud Scheduler: first 3 jobs free.

## Status

- [ ] Bucket created
- [ ] IAM bindings granted (datastore.importExportAdmin + storage.objectAdmin)
- [ ] Lifecycle rule set (30-day expiry)
- [ ] `BACKUP_BUCKET` secret set + redeployed
- [ ] Verified a manual run produced a dated export
