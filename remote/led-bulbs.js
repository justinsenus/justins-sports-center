/* A GPU diode surface for ordinary televisions. The score/data canvas stays native. */
(() => {
  'use strict';
  window.createLEDBulbRenderer = surface => {
    if(!surface)return null;
    const gl=surface.getContext('webgl',{alpha:false,antialias:false,depth:false,preserveDrawingBuffer:true});
    if(!gl)return null;
    const shader=(type,source)=>{
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,`
        attribute vec2 position; varying vec2 uv;
        void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}
      `));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
        precision mediump float;
        varying vec2 uv; uniform sampler2D source; uniform vec2 grid;
        vec3 lightAt(vec2 cell){
          vec3 c=texture2D(source,(clamp(cell,vec2(0.0),grid-1.0)+0.5)/grid).rgb;
          return max(c-vec3(0.055),0.0)*1.06;
        }
        void main(){
          vec2 p=vec2(uv.x,1.0-uv.y)*grid;
          vec2 cell=floor(p),q=fract(p)-0.5;
          float d=length(q);
          float lens=1.0-smoothstep(0.31,0.39,d);
          vec3 light=lightAt(cell);
          float power=max(light.r,max(light.g,light.b));
          // Unlit lenses remain visible against the dark circuit board.
          float glint=exp(-46.0*dot(q-vec2(-0.10,-0.12),q-vec2(-0.10,-0.12)));
          vec3 base=vec3(0.009,0.014,0.024)+lens*(vec3(0.035,0.043,0.059)+glint*0.027);
          vec3 emission=light*lens*(0.92+0.22*exp(-12.0*d*d));
          emission+=light*exp(-7.0*d*d)*0.20;
          // Small neighbor halos soften the bulbs without filling their dark gaps.
          for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
            vec2 off=vec2(float(x),float(y));
            if(x!=0||y!=0)emission+=lightAt(cell+off)*exp(-3.8*dot(q-off,q-off))*0.14;
          }
          emission+=vec3(power*0.10)*lens*exp(-28.0*dot(q,q));
          gl_FragColor=vec4(base+emission,1.0);
        }
      `));
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program,'source'),0);
      const grid=gl.getUniformLocation(program,'grid');
      surface.addEventListener('webglcontextlost',()=>document.body.classList.remove('led-bulbs-ready'));
      surface.addEventListener('webglcontextrestored',()=>location.reload());
      return {render(source){
        if(gl.isContextLost())return;
        // Four samples across every bulb keep circular edges on 1080p and 4K TVs.
        const w=source.width*4,h=source.height*4;
        if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;gl.viewport(0,0,w,h);}
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        gl.uniform2f(grid,source.width,source.height);
        gl.drawArrays(gl.TRIANGLES,0,6);
        document.body.classList.add('led-bulbs-ready');
      }};
    } catch(error){
      console.warn('LED bulb rendering unavailable; retaining readable scoreboard.',error);
      return null;
    }
  };
})();
