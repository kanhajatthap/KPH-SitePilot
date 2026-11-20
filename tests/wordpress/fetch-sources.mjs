// Downloads only pinned open-source test dependencies, never a user site.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const sources = JSON.parse(fs.readFileSync(new URL('./sources.json',import.meta.url),'utf8'));
const base = fs.mkdtempSync(path.join(os.tmpdir(),'sitepilot-wp-sources-'));
try {
  const tar = path.join(base,'wordpress.tgz');
  execFileSync('curl',['--fail','--silent','--show-error','--location','--proto','=https','--tlsv1.2',sources.wordpress.url,'--output',tar],{stdio:'pipe'});
  const bytes = fs.readFileSync(tar);
  if (createHash('sha256').update(bytes).digest('hex') !== sources.wordpress.sha256) throw new Error('WORDPRESS_INTEGRITY_FAILED');
  fs.writeFileSync(tar,bytes);
  execFileSync('tar',['-xzf',tar,'-C',base]);
  const sqlite = path.join(base,'sqlite');
  execFileSync('git',['init','-q',sqlite]);
  execFileSync('git',['-C',sqlite,'fetch','--quiet','--depth','1',sources.sqlite.repo,sources.sqlite.commit],{stdio:'pipe'});
  execFileSync('git',['-C',sqlite,'checkout','--quiet','--detach','FETCH_HEAD'],{stdio:'pipe'});
  const sha=execFileSync('git',['-C',sqlite,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(sha!==sources.sqlite.commit) throw new Error('SQLITE_REVISION_MISMATCH');
  console.log(JSON.stringify({ wordpress:path.join(base,`WordPress-${sources.wordpress.commit}`),sqlite,temporaryRoot:base }));
} catch(error) { fs.rmSync(base,{recursive:true,force:true}); throw error; }
