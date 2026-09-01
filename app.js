(async()=>{
  const files=['assets/app-part-01.txt','assets/app-part-02.txt','assets/app-part-03.txt','assets/app-part-04.txt','assets/app-part-05.txt'];
  const code=(await Promise.all(files.map(async f=>{const r=await fetch(f,{cache:'no-store'});if(!r.ok)throw new Error(`Failed to load ${f}`);return r.text();}))).join('');
  (0,eval)(code);
})().catch(err=>{console.error(err);document.body.insertAdjacentHTML('beforeend','<div style="position:fixed;left:12px;bottom:12px;padding:8px 10px;background:#fff3f3;color:#a00;border:1px solid #d88;font:12px Arial;z-index:99999">Dashboard failed to load. Refresh the page.</div>');});
