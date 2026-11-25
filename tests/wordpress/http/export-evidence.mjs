// Publish only an allowlisted projection. Never copy a fixture directory or raw logs.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {imageIdentity} from './safety.mjs';
const phases=new Set(['baseline','changed','restored','fatal','final']);
const status=value=>['PASS','FAIL','BLOCKED','NOT TESTED'].includes(value)?value:'NOT TESTED';
export function publicEvidence(report){
 const result={schemaVersion:1,status:status(report.status),images:[],phases:[]};
 if(/^[a-f0-9]{40}$/.test(report.commit||''))result.commit=report.commit;
 if(['startup','install','phase','inventory'].includes(report.stage))result.stage=report.stage;
 if(phases.has(report.activePhase))result.activePhase=report.activePhase;
 if(['WORDPRESS_DB_UNAVAILABLE','WORDPRESS_INSTALL_MARKER_MISSING'].includes(report.installCode))result.installCode=report.installCode;
 if(report.failure){result.failure={code:['ACCEPTANCE_ASSERTION_FAILED','FIXTURE_EXECUTION_FAILED'].includes(report.failure.code)?report.failure.code:'UNKNOWN_FAILURE'};if(Number.isInteger(report.failure.exitStatus))result.failure.exitStatus=report.failure.exitStatus;}
 if(report.phaseFailure){const f=report.phaseFailure;result.phaseFailure={code:['FPM_PROBE_INVALID','FPM_PROBE_TIMEOUT','PHASE_ASSERTION_FAILED'].includes(f.code)?f.code:'UNKNOWN_FAILURE'};if(Number.isInteger(f.observedStatus)&&f.observedStatus>=100&&f.observedStatus<=599)result.phaseFailure.observedStatus=f.observedStatus;}

 for(const image of report.images||[])result.images.push(imageIdentity({Id:image.id,RepoDigests:image.repoDigests}));
 for(const p of report.phases||[]){
  if(!phases.has(p.phase))throw new Error('INVALID_PHASE');
  result.phases.push({phase:p.phase,status:status(p.status),checks:(p.checks||[]).map(c=>{
   const clean={status:status(c.status)};
   for(const key of ['beforeHash','restoredHash','responseHash'])if(/^[a-f0-9]{64}$/.test(c[key]||''))clean[key]=c[key];
   if(Number.isInteger(c.httpStatus)&&c.httpStatus>=100&&c.httpStatus<=599)clean.httpStatus=c.httpStatus;
   if(c.fatalMarker===true)clean.fatalMarker=true;
   return clean;
  })});
 }
 if(report.cleanup)result.cleanup={status:status(report.cleanup.status)};
 return result;
}
export function collectEvidence(summaryPath,outputPath){
 const summary=JSON.parse(fs.readFileSync(summaryPath,'utf8'));
 const file=summary.evidence,base=typeof file==='string'?path.dirname(file):'';
 if(!/^sitepilot-http-[a-zA-Z0-9]+$/.test(path.basename(base))||path.dirname(base)!==fs.realpathSync(os.tmpdir())||path.basename(file)!=='evidence.json'||fs.realpathSync(file)!==file)throw new Error('UNSAFE_EVIDENCE_PATH');
 if(fs.statSync(file).size>1024*1024)throw new Error('EVIDENCE_TOO_LARGE');
 const result=publicEvidence(JSON.parse(fs.readFileSync(file,'utf8')));
 fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n',{mode:0o600});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{collectEvidence(process.argv[2],process.argv[3]);}
 catch{console.error('EVIDENCE_EXPORT_UNAVAILABLE');process.exitCode=1;}
}
