// Real Chromium + real compiled page, FIXTURE API responses (not hosted auth E2E).
// node tests/browser/restricted-review.mjs /external/node_modules http://127.0.0.1:3002
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const modules = path.resolve(process.argv[2]);
const { chromium } = await import(pathToFileURL(path.join(modules, 'playwright-core/index.mjs')));
const { default: binary, inflate } = await import(pathToFileURL(path.join(modules, '@sparticuz/chromium/build/index.js')));
const origin = new URL(process.argv[3] || 'http://127.0.0.1:3002').origin;
if (!['127.0.0.1','localhost'].includes(new URL(origin).hostname)) throw new Error('Fixture tests must target a local server');
await inflate(path.join(modules, '@sparticuz/chromium/bin/al2023.tar.br'));
const browser = await chromium.launch({ env: { ...process.env, LD_LIBRARY_PATH: `${path.join(os.tmpdir(), 'al2023/lib')}:${process.env.LD_LIBRARY_PATH || ''}` }, executablePath: await binary.executablePath(), args: binary.args.filter(arg => !['--single-process', '--disable-web-security', '--allow-running-insecure-content', '--disable-site-isolation-trials'].includes(arg)), headless: true });
const id = 'a'.repeat(32); const siteId = '11111111-1111-4111-8111-111111111111'; let passed = 0;
async function scenario(name, options, check) {
  const context = await browser.newContext(); const page = await context.newPage(); const posts = [];
  const data = { siteId, proposalId:id, path:'themes/test/style.css', before:'<script>window.sourceExecuted=true</script>',after:'<img src=x onerror="window.sourceExecuted=true">', beforeHash:'b'.repeat(64),afterHash:'c'.repeat(64),validUntil:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),...options.data };
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) return route.abort();
    if (u.pathname.endsWith('/restricted-files/proposal')) return route.fulfill({ status:options.readStatus || 200, json:options.readStatus ? {error:'REFUSED'} : data });
    if (u.pathname.endsWith('/restricted-files/review')) { posts.push(route.request().postDataJSON()); return route.fulfill({status: options.writeStatus || 200,json: options.writeStatus ? {error:'REFUSED'} : { status:'review_recorded',executionAllowed:false }}); }
    return route.continue();
  });
  try { await page.goto(`${origin}/restricted-review?siteId=${siteId}&proposalId=${id}`); await check(page,posts); passed++; console.log(`PASS ${name}`); }
  finally { await context.close(); }
}
try {
  await scenario('typed confirmation, safe source display and single-use UI',{},async(page,posts)=>{
    const input=page.locator('#proposal-confirmation'); await input.waitFor();
    assert.equal(await page.locator('main script, main img').count(),0); assert.equal(await page.evaluate(()=>window.sourceExecuted),undefined);
    const button=page.getByRole('button',{name:'Record review — no execution'}); assert.equal(await button.isDisabled(),true);
    await input.fill('CONFIRM'); assert.equal(await button.isDisabled(),true);
    await input.fill(id); await button.click(); await page.getByText('Review recorded. No file was changed. Execution remains disabled.').waitFor();
    assert.equal(posts.length,1); assert.deepEqual(Object.keys(posts[0]).sort(),['afterHash','beforeHash','confirmation','proposalId','siteId']);
    assert.equal(await page.getByRole('button',{name:'Review recorded',exact:true}).isDisabled(),true);
  });
  for (const [status,name] of [[401,'signed-out response'],[404,'cross-owner response']]) {
    await scenario(name,{readStatus:status},async(page,posts)=>{await page.getByText('Review unavailable. Sign in as the site owner and request a fresh connector proposal.').waitFor();assert.equal(await page.locator('#proposal-confirmation').count(),0);assert.equal(posts.length,0);});
  }
  for (const [validUntil,name] of [[new Date(0).toISOString(),'expired evidence'],['invalid','malformed expiry']]) {
    await scenario(name,{data:{validUntil}},async(page,posts)=>{await page.getByText('Evidence expired. Request a fresh proposal from the connector.').waitFor();assert.equal(await page.locator('#proposal-confirmation').isDisabled(),true);assert.equal(posts.length,0);});
  }
  await scenario('replayed or changed approval refusal',{writeStatus:409},async(page,posts)=>{const input=page.locator('#proposal-confirmation');await input.fill(id);await page.getByRole('button',{name:'Record review — no execution'}).click();await page.getByText(/Review not confirmed/).waitFor();assert.equal(posts.length,1);assert.equal(await page.getByRole('button',{name:'Review recorded',exact:true}).count(),0);});
  await scenario('expiry timer disables an open review',{data:{validUntil:new Date(Date.now()+3000).toISOString()}},async(page)=>{await page.locator('#proposal-confirmation').waitFor();await page.waitForFunction(()=>document.querySelector('#proposal-confirmation')?.disabled);});
  console.log(`${passed} browser fixture scenarios passed. Hosted sign-in and live ownership E2E remain unverified.`);
} finally { await browser.close(); }
