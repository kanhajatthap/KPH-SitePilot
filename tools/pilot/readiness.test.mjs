import {test} from 'node:test';import assert from 'node:assert/strict';import {REQUIRED,evaluateReadiness} from './readiness.mjs';
const now=Date.now();const commit='a'.repeat(40);
const manifest=()=>({schemaVersion:1,environment:'disposable-staging',commit,gates:Object.fromEntries(REQUIRED.map(g=>[g,{status:'passed',commit,verifiedAt:new Date(now).toISOString(),artifact:'test-result.json'}]))});
test('missing evidence is NO-GO',()=>{assert.equal(evaluateReadiness({},now).status,'NO-GO');});
test('complete claims never authorize activation',()=>{const r=evaluateReadiness(manifest(),now);assert.equal(r.status,'EVIDENCE-COMPLETE');assert.equal(r.activationAllowed,false);});
for(const status of ['blocked','not-run','failed','skipped'])test(`${status} mandatory gate prevents readiness`,()=>{const m=manifest();m.gates.mysqlFpmHttp.status=status;assert.equal(evaluateReadiness(m,now).status,'NO-GO');});
test('wrong commit, stale/future evidence and missing artifact fail closed',()=>{for(const patch of [{commit:'b'.repeat(40)},{verifiedAt:new Date(now-86400001).toISOString()},{verifiedAt:new Date(now+1).toISOString()},{artifact:''}]){const m=manifest();Object.assign(m.gates.realAuthBrowser,patch);assert.equal(evaluateReadiness(m,now).status,'NO-GO');}});
test('production manifest rejected',()=>{const m=manifest();m.environment='production';assert.equal(evaluateReadiness(m,now).status,'NO-GO');});
