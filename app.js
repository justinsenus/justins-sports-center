(async()=>{
  async function loadGzipBase64(paths){
    const parts=await Promise.all(paths.map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw new Error('Failed to load '+p);return r.text();}));
    const b64=parts.join('').replace(/\s+/g,'');
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  const [css,js]=await Promise.all([
    loadGzipBase64(['assets/styles-1.txt','assets/styles-2.txt','assets/styles-3.txt']),
    loadGzipBase64(['assets/app-1.txt','assets/app-2.txt','assets/app-3.txt'])
  ]);
  const style=document.createElement('style');
  style.textContent=css+'\n.header-center-logo{filter:brightness(0) saturate(100%)!important}';
  document.head.appendChild(style);
  (0,eval)(js);
})().catch(err=>{
  console.error(err);
  document.body.insertAdjacentHTML('beforeend','<div style="position:fixed;left:12px;bottom:12px;padding:8px 10px;background:#fff3f3;color:#a00;border:1px solid #d88;font:12px Arial;z-index:99999">Dashboard failed to load. Refresh the page.</div>');
});
