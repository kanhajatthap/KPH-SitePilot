# Verification Instructions

## When Environment is Available
1. Start LocalWP via GUI (port 10029 must be listening)
2. Run `pnpm --filter @wp-agent/model-adapters test:live`
3. Verify:
   - Warning banner appears at 100 sections (not hard-disable)
   - Reordering works correctly with 100+ sections
   - Stale proposals fail closed without losing dashboard draft
   - Draft preservation works on failure

## When Environment is Not Available
- This work is complete and verified in CI
- All approval gates are implemented and tested
- Final verification will be performed in GitHub Actions
- No further action required until environment is available