/* Round LED dots rendered at the display resolution to avoid resampling bands. */
(() => {
  'use strict';
  window.createLEDBulbRenderer = surface => {
    if(!surface)return null;
    const out=surface.getContext('2d',{alpha:false});if(!out)return null;
    const layer=document.createElement('canvas'),paint=layer.getContext('2d');
    const mask=document.createElement('canvas'),dots=mask.getContext('2d');
    if(!paint||!dots)return null;
    let lastFrame=0,columns=0,rows=0;
    function prepare(source,w,h){
      surface.width=layer.width=mask.width=w;
      surface.height=layer.height=mask.height=h;
      columns=source.width;rows=source.height;
      const sx=w/columns,sy=h/rows,radius=Math.min(sx,sy)*.43;
      dots.fillStyle='#fff';
      // Cache the mask at the final backing resolution. Scaling a separate
      // three-pixel tile caused alternating bright/dark rows on television.
      for(let y=0;y<rows;y++){
        const cy=(y+.5)*sy;dots.beginPath();
        for(let x=0;x<columns;x++){
          const cx=(x+.5)*sx;dots.moveTo(cx+radius,cy);
          dots.arc(cx,cy,radius,0,Math.PI*2);
        }
        dots.fill();
      }
    }
    return {render(source){
      const time=Date.now(),ratio=Math.max(1,Math.min(2,window.devicePixelRatio||1));
      const cssWidth=Number.parseFloat(surface.style.width)||source.width*2;
      const cssHeight=Number.parseFloat(surface.style.height)||cssWidth*source.height/source.width;
      const scale=Math.min(1,3840/(cssWidth*ratio),2160/(cssHeight*ratio));
      const w=Math.max(1,Math.round(cssWidth*ratio*scale)),h=Math.max(1,Math.round(cssHeight*ratio*scale));
      const resize=surface.width!==w||surface.height!==h||columns!==source.width||rows!==source.height;
      if(!resize&&time-lastFrame<90)return;
      if(resize)prepare(source,w,h);
      paint.globalCompositeOperation='copy';paint.imageSmoothingEnabled=false;
      paint.drawImage(source,0,0,w,h);
      paint.globalCompositeOperation='destination-in';paint.drawImage(mask,0,0);
      // Keep the space between LEDs dark; a second repeating unlit grid
      // introduced visible crosshatching behind text and across empty panels.
      out.globalAlpha=1;out.globalCompositeOperation='source-over';
      out.fillStyle='#010308';out.fillRect(0,0,w,h);
      out.globalCompositeOperation='lighter';out.drawImage(layer,0,0);
      out.globalCompositeOperation='source-over';lastFrame=time;
      document.body.classList.add('led-bulbs-ready');
    }};
  };
})();
