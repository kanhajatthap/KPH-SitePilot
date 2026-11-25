// Retry only transport/transient gateway readiness, never an acceptance assertion.
export async function waitForFpm(request,{attempts=30,pause=()=>new Promise(r=>setTimeout(r,200))}={}){
 let lastStatus;
 for(let i=0;i<attempts;i++){
  let response;
  try{response=await request();}catch{if(i+1<attempts)await pause();continue;}
  lastStatus=response.status;
  if([502,503,504].includes(lastStatus)){if(i+1<attempts)await pause();continue;}
  const fail=()=>{const e=new Error('FPM_PROBE_INVALID');e.code='FPM_PROBE_INVALID';e.observedStatus=lastStatus;throw e;};
  if(lastStatus!==200)fail();
  let runtime;try{runtime=JSON.parse(response.text);}catch{fail();}
  if(!runtime||typeof runtime!=='object'||runtime.sapi!=='fpm-fcgi'||runtime.opcache!==true||runtime.validateTimestamps!=='0')fail();
  return runtime;
 }
 const e=new Error('FPM_PROBE_TIMEOUT');e.code='FPM_PROBE_TIMEOUT';e.observedStatus=lastStatus;throw e;
}
