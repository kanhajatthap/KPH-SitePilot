# @wp-agent/dashboard — KPH SitePilot Web Workspace

The official web dashboard for **KPH SitePilot**, inspired by the interaction pattern of modern AI website builders:
- **Left Panel**: Conversational AI Copilot, tool activity inspector, error diagnostics, and quick suggestion pills.
- **Right Panel**: Interactive preview canvas, local WordPress site selector, responsive viewport simulator (Desktop, Tablet, Mobile), and verified read-only content renderer.

## Architecture & Security Boundaries

1. **Server-Side API Proxying**:
   - The dashboard runs on Next.js 15 (App Router).
   - Server-side route handlers (`/api/agent`, `/api/chat`, `/api/health`) validate requests and forward them to the backend API (`http://127.0.0.1:3001`).
   - The browser never communicates with external providers or touches API keys.

2. **Strict Target Validation**:
   - Only explicitly whitelisted LocalWP development sites (`*.local`, `localhost`, `127.0.0.1`) are permitted.
   - External URLs, production domains, and cloud metadata IPs (`169.254.169.254`) are blocked before forwarding.

3. **Zero Secrets in Bundles**:
   - No credentials, tokens, or database passwords enter the client bundle.
   - Chat history and tool outputs are in-memory only (no localStorage or browser database persistence).

4. **Honest Preview Distinction**:
   - Verified live WordPress data extracted by `site.inspect` and `page.read` is clearly distinguished with a green security verification badge.
   - Empty/welcome states provide safe walkthroughs without misrepresenting mock content as live WordPress pages.

## Running Locally

```powershell
# Development server (port 3002)
pnpm dev:dashboard

# Production build and run
pnpm build
pnpm start:dashboard
```
Open [http://localhost:3002](http://localhost:3002) in your browser.
