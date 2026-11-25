// Accessible through GitHub Checks API even when artifact/log storage is unreachable.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {publicEvidence} from './export-evidence.mjs';
export function annotations(input){
 const r=publicEvidence(input);const level=r.status==='PASS'?'notice':'error';
 const lines=[`::${level} title=Recovery acceptance::status=${r.status}; stage=${r.stage||'unknown'}; phase=${r.activePhase||'unknown'}; code=${r.installCode||r.phaseFailure?.code||r.failure?.code||'none'}; http=${r.phaseFailure?.observedStatus||'unknown'}`];
 if(r.commit)lines.push(`::notice title=Tested commit::${r.commit}`);
 for(const p of r.phases){lines.push(`::notice title=Recovery phase::${p.phase}: ${p.status}; checks=${p.checks.length}`);for(const c of p.checks)if(c.beforeHash&&c.restoredHash)lines.push(`::notice title=Restore hashes::${p.phase}: before=${c.beforeHash}; restored=${c.restoredHash}`);}
 for(const i of r.images)lines.push(`::notice title=Runtime image::${i.id}`);
 return lines;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{for(const line of annotations(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))))console.log(line);}
 catch{console.log('::error title=Recovery evidence::EVIDENCE_UNAVAILABLE');process.exitCode=1;}
}
