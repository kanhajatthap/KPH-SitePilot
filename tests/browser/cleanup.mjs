/** Best-effort cleanup of explicitly supplied generated resources; never leaks raw errors. */
export async function cleanupResources(tasks) {
  const results=[];
  for(const {label,run} of tasks){
    if(!/^[a-z0-9-]+$/.test(label)) throw new Error('INVALID_CLEANUP_LABEL');
    try{await run();results.push({label,status:'PASS'});}
    catch{results.push({label,status:'FAIL'});}
  }
  return results;
}
