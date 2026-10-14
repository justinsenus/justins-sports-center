/* Television diode surface. Keep startup light and avoid a full-screen GPU shader. */
(() => {
  'use strict';
  window.createLEDBulbRenderer = surface => {
    if(!surface)return null;
    const out=surface.getContext('2d',{alpha:false});if(!out)return null;
    const layer=document.createElement('canvas'),paint=layer.getContext('2d');
    if(!paint)return null;
    let mask=null,grid=null,pitch=0,lastFrame=0;
    function prepare(step){
      pitch=step;
      const tile=document.createElement('canvas');tile.width=tile.height=step;
      const t=tile.getContext('2d');
      t.fillStyle='#fff';t.beginPath();t.arc(step/2,step/2,step*.39,0,Math.PI*2);t.fill();
      mask=paint.createPattern(tile,'repeat');
      const unlit=document.createElement('canvas');unlit.width=unlit.height=step;
      const u=unlit.getContext('2d');u.fillStyle='#010205';u.fillRect(0,0,step,step);
      u.fillStyle='#0b0d11';u.beginPath();u.arc(step/2,step/2,step*.38,0,Math.PI*2);u.fill();
      grid=out.createPattern(unlit,'repeat');
    }
    return {render(source){
      const time=Date.now();
      const cssWidth=Number.parseFloat(surface.style.width)||source.width*2;
      // Limit the intermediate image to three samples per bulb. The previous
      // 4x image and per-frame blur could stall embedded television browsers.
      const step=3;
      const w=source.width*step,h=source.height*step;
      const resize=surface.width!==w||surface.height!==h;
      if(!resize&&time-lastFrame<90)return;
      if(step!==pitch)prepare(step);
      if(resize){surface.width=layer.width=w;surface.height=layer.height=h;}
      paint.globalCompositeOperation='source-over';paint.imageSmoothingEnabled=false;
      paint.drawImage(source,0,0,w,h);
      paint.globalCompositeOperation='destination-in';paint.fillStyle=mask;paint.fillRect(0,0,w,h);
      out.globalAlpha=1;out.globalCompositeOperation='source-over';out.fillStyle=grid;out.fillRect(0,0,w,h);
      // The crisp bulb layer supplies the light; CSS adds a subtle local bloom.
      out.globalCompositeOperation='lighter';out.drawImage(layer,0,0);out.globalCompositeOperation='source-over';
      lastFrame=time;
      document.body.classList.add('led-bulbs-ready');
    }};
  };
})();
