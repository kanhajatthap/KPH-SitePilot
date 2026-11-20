// Offline evidence completeness gate, never activates/deploys/migrates anything.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const REQUIRED = Object.freeze([
 'authenticationOwnership','signedSingleUse','freshnessIntegrity','replayConcurrency',
 'independentRestore','mysqlFpmHttp','opcacheWorkers','realAuthBrowser','fileAllowlist',
 'operatorOptIn','auditTrail','disableSwitch','failureStopConditions',
]);
export function evaluateReadiness(input, now=Date.now()) {
 const blockers=[];
 if(!input || input.schemaVersion!==1 || input.environment!=='disposable-staging' || !/^[a-f0-9]{40}$/.test(input.commit || '')) blockers.push('INVALID_EVIDENCE_MANIFEST');
 for(const gate of REQUIRED){
  const e=input?.gates?.[gate]; const time=Date.parse(e?.verifiedAt);
  if(!e || e.status!=='passed' || e.commit!==input?.commit || !Number.isFinite(time) || time>now || now-time>86400000 || typeof e.artifact!=='string' || !e.artifact.trim() || e.artifact.length>500) blockers.push(gate);
 }
 return {status:blockers.length?'NO-GO':'EVIDENCE-COMPLETE',blockers,activationAllowed:false,
  note:'Evidence claims require independent review. This tool never grants activation or verifies artifact authenticity.'};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=evaluateReadiness(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(result,null,2));process.exitCode=result.blockers.length?1:0;}
 catch{console.error(JSON.stringify({status:'NO-GO',activationAllowed:false,error:'INVALID_MANIFEST'}));process.exitCode=1;}
}
