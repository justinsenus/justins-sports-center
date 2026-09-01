
(async()=>{
  async function ungzip(parts){
    const texts=await Promise.all(parts.map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw new Error('Failed to load '+p);return r.text()}));
    const b64=texts.join('').replace(/\s+/g,'');
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  async function textFile(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error('Failed to load '+path);return r.text();}
  const [baseCss,baseJs,darkCss,m1,m2,mDark,enhancer]=await Promise.all([
    ungzip(['../assets/styles-1.txt','../assets/styles-2.txt','../assets/styles-3.txt']),
    ungzip(['../assets/app-1.txt','../assets/app-2.txt','../assets/app-3.txt']),
    textFile('../dark/dark.css'),
    textFile('../iphone/mobile-1.css'),
    textFile('../iphone/mobile-2.css'),
    textFile('dark-mobile.css'),
    textFile('../dark/enhance.js')
  ]);
  const style=document.createElement('style');
  style.textContent=baseCss+'\n'+darkCss+'\n'+m1+'\n'+m2+'\n'+mDark;
  document.head.appendChild(style);
  (0,eval)(baseJs);
  (0,eval)(enhancer);
})().catch(err=>{
  console.error(err);
  document.body.insertAdjacentHTML('beforeend','<div style="position:fixed;left:12px;right:12px;bottom:70px;padding:10px;background:#1d1114;color:#ff9aa4;border:1px solid #8d3842;border-radius:8px;font:12px Arial;z-index:99999">Dashboard failed to load. Refresh the page.</div>');
});
