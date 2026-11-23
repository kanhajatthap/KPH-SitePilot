// Host-only byte acceptance. Does not boot PHP, WordPress or an HTTP service.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';import {preflight,prepare,restore} from '../../tools/recovery/recovery.mjs';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'sitepilot-byte-evidence-'));
const root=path.join(base,'site'),vault=path.join(base,'vault'),policy=path.join(base,'policy.json');
const sha=s=>createHash('sha256').update(s).digest('hex');
const cases={'style.css':['body{color:black}','body{color:blue}'],'script.js':['window.fixture="original";','window.fixture="changed";'],'functions.php':['<?php echo "original";','<?php throw new RuntimeException("fixture");']};
const report={schemaVersion:1,status:'NOT TESTED',scope:'host-bytes-only',httpHealth:'NOT TESTED',phpRuntime:'NOT TESTED',cases:[]};let success=false;
try{
 fs.mkdirSync(path.join(root,'wp-content/themes/fixture'),{recursive:true,mode:0o700});fs.mkdirSync(vault,{mode:0o700});fs.writeFileSync(path.join(vault,'key'),randomBytes(32),{mode:0o600});
 const relative=n=>'wp-content/themes/fixture/'+n;
 fs.writeFileSync(policy,JSON.stringify({version:1,enabled:true,environment:'staging',root,vault,publicRoots:[root],allowedFiles:Object.keys(cases).map(relative)}),{mode:0o600});
 for(const [name,[before,after]] of Object.entries(cases)){
  const file=path.join(root,relative(name));fs.writeFileSync(file,before,{mode:0o600});const initial=preflight(policy,relative(name));assert.equal(initial.sha256,sha(before));
  const backup=prepare(policy,relative(name),sha(after));fs.writeFileSync(file,after);const changedHash=sha(fs.readFileSync(file));assert.equal(changedHash,sha(after));
  const dry=restore(policy,backup.id,backup.id);assert.equal(dry.dryRun,true);assert.equal(sha(fs.readFileSync(file)),changedHash);
  const restored=restore(policy,backup.id,backup.id,true);const restoredHash=sha(fs.readFileSync(file));assert.equal(restored.verified,true);assert.equal(restoredHash,initial.sha256);
  report.cases.push({file:name,status:'PASS',originalHash:initial.sha256,changedHash,restoredHash,dryRunPreservedBytes:true});
 }
 report.status='PASS';success=true;
}finally{
 if(success)fs.rmSync(base,{recursive:true,force:true});
 else{report.status='FAIL';report.privateFixtureRetained=base;}
 console.log(JSON.stringify(report,null,2));
}
