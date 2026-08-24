# Production Data Management Guide

## Important: Data Separation

Your Tanker Logix application now uses separate data directories to protect production data:

- **Development**: `data/` directory (used when running locally)
- **Production**: `production_data/` directory (used on the live site)

## How It Works

1. **Local Development**: When you work on the app locally, all changes are saved to `data/`
2. **Production Site**: When users use the live site, all changes are saved to `production_data/`
3. **Deployments**: When you deploy updates, only code changes are pushed - production data remains untouched

## Current Situation

Unfortunately, the recent deployment overwrote your production locations with development data. Here's how to fix it:

### Option 1: Manual Re-entry
If you remember your production locations, you can:
1. Go to https://cruderatepti.replit.app/locations
2. Re-enter your locations manually
3. They will now be saved in the protected `production_data/` directory

### Option 2: Restore from Backup
If you have a backup of your data:
1. Create a folder called `production_backup` in your project
2. Place your backup JSON files there
3. Run: `tsx server/restore-production-data.ts`
4. Deploy the changes

### Option 3: Use Spreadsheet Upload
If you have your locations in a spreadsheet:
1. Go to the Locations page
2. Click "Upload File"
3. Upload your CSV/XLSX file with all locations

## Preventing Future Data Loss

### Best Practices

1. **Never copy production data to development**
   - Keep production and development data separate
   
2. **Regular backups**
   - Periodically export your locations to CSV as a backup
   - Use the "Export to CSV" button on the Locations page

3. **Test in development first**
   - Make changes locally and test them
   - Only deploy when you're confident

### How Data Persists Now

- **Production data** (`production_data/`) is:
  - Never overwritten by deployments
  - Separate from your development data
  - Persistent across all updates

- **Development data** (`data/`) is:
  - Only used locally
  - Never pushed to production
  - Safe to modify for testing

## Technical Details

The `server/storage.ts` file now:
- Checks `NODE_ENV` environment variable
- Uses `production_data/` when `NODE_ENV=production`
- Uses `data/` when running locally
- Never copies between directories automatically

## Questions?

Your production data is now protected. Future deployments will only update code, not data.