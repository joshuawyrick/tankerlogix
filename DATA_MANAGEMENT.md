# Tanker Logix Data Management

## Important: Production vs Development Data Separation

This application now separates development and production data to prevent data loss during deployments.

### How It Works

- **Development Environment**: Data is stored in the `data/` directory
- **Production Environment**: Data is stored in the `production_data/` directory
- **Deployment Safety**: Production data persists across deployments and is never overwritten

### Directory Structure

```
tanker-logix/
├── data/                    # Development data (gitignored)
│   ├── locations.json
│   ├── customers.json
│   ├── contractedRoutes.json
│   └── ...
├── production_data/         # Production data (gitignored, persists)
│   ├── locations.json
│   ├── customers.json
│   ├── contractedRoutes.json
│   └── ...
```

### First-Time Production Setup

When deploying for the first time, you have two options:

1. **Start Fresh**: Production will automatically create empty data files
2. **Copy Current Data**: Run this command before deploying:
   ```bash
   tsx server/init-production-data.ts --from-dev
   ```

### Data Migration Commands

```bash
# Initialize production data (first time only)
tsx server/init-production-data.ts

# Initialize production with current dev data
tsx server/init-production-data.ts --from-dev

# Backup production data
tsx server/migrate-data.ts backup-prod

# Backup development data
tsx server/migrate-data.ts backup-dev

# Copy dev to prod (careful - overwrites production!)
tsx server/migrate-data.ts dev-to-prod --force

# Copy prod to dev (useful for testing with real data)
tsx server/migrate-data.ts prod-to-dev --force
```

### Important Notes

1. **Git Ignores Data**: Both `data/` and `production_data/` directories are gitignored to prevent accidental commits
2. **Automatic Detection**: The app automatically uses the correct directory based on NODE_ENV
3. **No Data Loss**: Production data is never touched during deployments
4. **Backups**: Always backup production data before major changes using the backup command

### Deployment Checklist

Before deploying updates:

1. ✅ Test all changes in development
2. ✅ Backup production data: `tsx server/migrate-data.ts backup-prod`
3. ✅ Deploy your code changes
4. ✅ Production data remains intact!

### Troubleshooting

**Issue**: "My production site has no data after deployment"
- **Solution**: Run `tsx server/init-production-data.ts --from-dev` if this is your first deployment

**Issue**: "I want to test with production data locally"
- **Solution**: Run `tsx server/migrate-data.ts prod-to-dev` to copy production data to development

**Issue**: "I accidentally deleted production data"
- **Solution**: Restore from backup if you have one, or re-import from your CSV exports

### Environment Variables

The application automatically detects the environment:
- `NODE_ENV=development` → Uses `data/` directory
- `NODE_ENV=production` → Uses `production_data/` directory

This is set automatically when running:
- `npm run dev` → Development mode
- `npm start` → Production mode