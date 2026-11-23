import fs from 'node:fs';
import path from 'node:path';

/** Reject externally selected daemons before invoking Docker at all. */
export function dockerEnvironment(input) {
  if (input.DOCKER_HOST || input.DOCKER_CONTEXT) throw new Error('DOCKER_OVERRIDE_REFUSED');
  const allowed = ['PATH', 'HOME', 'DOCKER_CONFIG', 'XDG_RUNTIME_DIR', 'LANG', 'LC_ALL', 'TMPDIR'];
  return Object.fromEntries(allowed.filter(k => input[k] !== undefined).map(k => [k, input[k]]));
}
export function validateDockerEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !/^unix:\/\/\/[a-zA-Z0-9_./-]+$/.test(endpoint) || endpoint.includes('/../')) {
    throw new Error('NONLOCAL_DOCKER_REFUSED');
  }
}
export function imageIdentity(image) {
  if (!image || !/^sha256:[a-f0-9]{64}$/.test(image.Id)) throw new Error('IMAGE_IDENTITY_UNAVAILABLE');
  return { id: image.Id, repoDigests: (image.RepoDigests || []).filter(v => typeof v === 'string' && /^[a-zA-Z0-9_./:-]+@sha256:[a-f0-9]{64}$/.test(v)) };
}
export function writeEvidence(base, report) {
  fs.writeFileSync(path.join(base, 'evidence.json'), JSON.stringify(report, null, 2)+'\n', { mode: 0o600 });
}
/** Only used on our mkdtemp directory with its matching marker. Never a global prune. */
export function finishFixture({base, project, success, stop, report}) {
  if (!/^sitepilot-fixture-[a-f0-9]{12}$/.test(project) || fs.readFileSync(path.join(base,'.fixture-owner'),'utf8') !== project) {
    throw new Error('FIXTURE_OWNERSHIP_MISMATCH');
  }
  let stopped = false;
  try { stop(); stopped = true; }
  catch { report.cleanup = {status:'FAIL', code:'SCOPED_DOCKER_CLEANUP_FAILED'}; }
  if (stopped) report.cleanup = {status:'PASS', project};
  // Preserve evidence always, and the independent vault on any failure.
  report.status = success && stopped ? 'PASS' : 'FAIL';
  report.privateArtifactsRetained = !success || !stopped;
  writeEvidence(base, report);
  if (success && stopped) {
    for (const name of ['site','vault','db-password','root-password','install.php','policy.json','runtime','private-diagnostics.log']) fs.rmSync(path.join(base,name),{recursive:true,force:true});
    for (const name of fs.readdirSync(base).filter(n=>n.endsWith('.receipt'))) fs.unlinkSync(path.join(base,name));
  }
  return {success:success && stopped, evidence:path.join(base,'evidence.json')};
}
