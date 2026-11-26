/* Conquer: campo nocturno. Miles de espigas, cardos y pasto claros sobre un valle oscuro, con desenfoque de lente,
   que se encienden por donde pasa el cursor o el dedo. three.js r128, sin dependencias extra. */
(function(){
  var host=document.getElementById('jardin'); if(!host) return; if(!window.THREE){ host.classList.add('nogl'); return; }
  var canvas=host.querySelector('canvas'), stick=host.querySelector('.stick');
  var coarse=matchMedia('(pointer: coarse)').matches, lite=coarse||Math.min(innerWidth,innerHeight)<700;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var renderer;
  try{ renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:false,powerPreference:'high-performance'}); }
  catch(e){ host.classList.add('nogl'); return; }
  var hasDepth=renderer.capabilities.isWebGL2||!!renderer.extensions.get('WEBGL_depth_texture');
  if(!hasDepth){ host.classList.add('nogl'); return; }
  var DPR=Math.min(window.devicePixelRatio||1,lite?1.5:1.75);
  renderer.setPixelRatio(1); renderer.setClearColor(0x040405,1); renderer.autoClear=true;

  /* ---------- azar y ruido con semilla ---------- */
  var seed=20261124; function rnd(){ seed|=0; seed=seed+0x6D2B79F5|0; var t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }
  function hash(x,y){ var s=Math.sin(x*127.1+y*311.7)*43758.5453; return s-Math.floor(s); }
  function vnoise(x,y){ var xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi, u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
    var a=hash(xi,yi), b=hash(xi+1,yi), c=hash(xi,yi+1), d=hash(xi+1,yi+1); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
  function fbm(x,y){ return vnoise(x,y)*.55+vnoise(x*2.1+7.3,y*2.1+1.7)*.3+vnoise(x*4.3+3.1,y*4.3+9.2)*.15; }
  function sstep(a,b,x){ x=Math.max(0,Math.min(1,(x-a)/(b-a))); return x*x*(3-2*x); }
  /* el valle: un cauce oscuro que serpentea entre dos laderas */
  function cauce(z){ return -0.9*Math.sin(z*0.33)+0.35*Math.sin(z*0.71+1.3); }
  function alto(x,z){ var d=Math.abs(x-cauce(z)); return 1.25*Math.pow(sstep(0.35,4.6,d),1.25)*(0.8+0.5*fbm(x*.35+4,z*.35))+0.22*fbm(x*.9,z*.9)-0.1; }

  /* ---------- texturas dibujadas a mano en un lienzo ---------- */
  function lienzo(w,h){ var c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
  function petalo(g,len,wid,punta,c0,c1,c2){
    g.beginPath(); g.moveTo(0,0); g.bezierCurveTo(wid,-len*.28,wid*punta,-len*.92,0,-len); g.bezierCurveTo(-wid*punta,-len*.92,-wid,-len*.28,0,0); g.closePath();
    var gr=g.createLinearGradient(0,0,0,-len); gr.addColorStop(0,c0); gr.addColorStop(.45,c1); gr.addColorStop(1,c2); g.fillStyle=gr; g.fill();
    g.strokeStyle='rgba(40,34,24,.28)'; g.lineWidth=1.1; g.stroke();
    g.beginPath(); g.moveTo(0,-len*.12); g.lineTo(0,-len*.8); g.strokeStyle='rgba(60,50,36,.16)'; g.lineWidth=1; g.stroke();
  }
  function centro(g,r,puntos){
    var gr=g.createRadialGradient(-r*.25,-r*.25,r*.1,0,0,r); gr.addColorStop(0,'#f1cf7a'); gr.addColorStop(.6,'#c79a3e'); gr.addColorStop(1,'#7c5716');
    g.beginPath(); g.arc(0,0,r,0,7); g.fillStyle=gr; g.fill();
    for(var i=0;i<puntos;i++){ var a=rnd()*6.283, d=Math.sqrt(rnd())*r*.85; g.beginPath(); g.arc(Math.cos(a)*d,Math.sin(a)*d,r*.11,0,7); g.fillStyle=rnd()<.5?'#5f4210':'#f6dc95'; g.fill(); }
  }
  /* variantes del sembrado: f flores, a campo (cardos y espigas), b agaves, c luces */
  var VAR=(location.search.match(/[?&]v=([abcf])/)||[])[1]||'a';
  var s2=7919; function r2(){ s2=(s2*16807)%2147483647; return (s2-1)/2147483646; }
  function hoja(g,len,wid,c0,c1,c2,borde){
    g.beginPath(); g.moveTo(-wid,0); g.quadraticCurveTo(-wid*.72,-len*.55,0,-len); g.quadraticCurveTo(wid*.72,-len*.55,wid,0); g.closePath();
    var gr=g.createLinearGradient(0,0,0,-len); gr.addColorStop(0,c0); gr.addColorStop(.5,c1); gr.addColorStop(1,c2); g.fillStyle=gr; g.fill();
    if(borde){ g.strokeStyle=borde; g.lineWidth=1.2; g.stroke(); }
  }
  function disco(g,x,y,r,c0,c1){ var gr=g.createRadialGradient(x-r*.2,y-r*.2,r*.05,x,y,r); gr.addColorStop(0,c0); gr.addColorStop(1,c1); g.beginPath(); g.arc(x,y,r,0,7); g.fillStyle=gr; g.fill(); }
  function atlasCampo(){
    var S=128, c=lienzo(S*4,S), g=c.getContext('2d'), i, a, k;
    /* 0 cardo: bulbo de escamas y corona de púas */
    g.save(); g.translate(S*.5,S*.6);
    for(i=0;i<36;i++){ a=(i/35-.5)*2.5+(r2()-.5)*.07; g.save(); g.rotate(a); hoja(g,48+r2()*11,2.7,'#8f8a7c','#e9e4d6','#ffffff'); g.restore(); }
    g.fillStyle='#565d49'; g.fillRect(-3.5,26,7,22);
    g.save(); g.translate(0,13); g.scale(1,1.14); disco(g,0,0,19,'#8a917a','#3c4335'); g.restore();
    for(k=0;k<4;k++){ for(i=-3;i<=3;i++){ var sx=i*5.4+(k%2?2.7:0), sy=1+k*7; if(Math.abs(sx)>17-k*1.5) continue; g.beginPath(); g.moveTo(sx-3.4,sy); g.lineTo(sx,sy+5.5); g.lineTo(sx+3.4,sy); g.strokeStyle='rgba(214,218,196,.8)'; g.lineWidth=1.5; g.stroke(); } }
    g.restore();
    /* 1 espiga */
    g.save(); g.translate(S*1.5,S*.5);
    g.fillStyle='#7f7b68'; g.fillRect(-2.2,-26,4.4,86);
    for(i=0;i<7;i++){ for(k=-1;k<=1;k+=2){ g.save(); g.translate(k*2,40-i*10.5); g.rotate(k*.5);
      g.save(); g.translate(0,-13); g.rotate(-k*.3); hoja(g,27+r2()*8,1.9,'#a9a48f','#e4dfcc','#fdfbf2'); g.restore();
      hoja(g,18,6.6,'#8a8571','#d9d3bd','#fbf8ec','rgba(60,56,40,.35)'); g.restore(); } }
    g.save(); g.translate(0,-30); hoja(g,20,6.2,'#8a8571','#d9d3bd','#fbf8ec','rgba(60,56,40,.35)'); g.translate(0,-16); hoja(g,22,1.9,'#a9a48f','#e4dfcc','#fdfbf2'); g.restore();
    g.restore();
    /* 2 plumero de pasto */
    g.save(); g.translate(S*2.5,S*.5);
    g.beginPath(); g.moveTo(-2,60); g.quadraticCurveTo(-1,10,5,-44); g.strokeStyle='#7d7b6a'; g.lineWidth=4; g.stroke();
    for(i=0;i<22;i++){ var f=i/21, px=-1.4+6.4*f*f, py=38-84*f, la=18*(1-.55*Math.abs(f-.4)); k=i%2?1:-1; g.save(); g.translate(px,py); g.rotate(k*(.62-.25*f)+(r2()-.5)*.15); hoja(g,la+r2()*5,3.3,'#8b8c80','#d9d9cf','#fbfbf6'); g.restore(); }
    g.restore();
    /* 3 abrojo: bola de púas */
    g.save(); g.translate(S*3.5,S*.5);
    for(i=0;i<16;i++){ g.save(); g.rotate(i*6.283/16+(r2()-.5)*.1); g.translate(0,-7); hoja(g,i%2?34:50,4.1,'#8d8f8a','#dededa','#fbfbf7'); g.restore(); }
    disco(g,0,0,11,'#b9b39a','#4a4a3c'); g.restore();
    var t=new THREE.CanvasTexture(c); t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; t.anisotropy=4; return t;
  }
  function roseta(g,anillos){ anillos.forEach(function(A,q){ for(var i=0;i<A[0];i++){ g.save(); g.rotate(i*6.283/A[0]+q*.37+(r2()-.5)*.08); g.translate(0,-A[3]); hoja(g,A[1],A[2],'#4d5749','#8f9b89','#d3d9cb','rgba(232,232,216,.55)'); g.restore(); } }); }
  function atlasAgave(){
    var S=128, c=lienzo(S*4,S), g=c.getContext('2d'), i;
    g.save(); g.translate(S*.5,S*.5); roseta(g,[[9,58,11,2],[8,42,10,1],[5,25,8,0]]); g.restore();
    g.save(); g.translate(S*1.5,S*.5); for(i=0;i<24;i++){ g.save(); g.rotate(i*6.283/24+(r2()-.5)*.12); g.translate(0,-3); hoja(g,46+r2()*14,3.8,'#7f857c','#cfd3ca','#f8f9f3'); g.restore(); } disco(g,0,0,6,'#c9cbbd','#5a6054'); g.restore();
    g.save(); g.translate(S*2.5,S*.5); for(i=0;i<8;i++){ g.save(); g.rotate(i*6.283/8); g.translate(0,-3); hoja(g,i%2?30:56,i%2?8:6.5,'#5b6457','#a3ad9d','#e3e7dc','rgba(232,232,216,.5)'); g.restore(); } g.restore();
    g.save(); g.translate(S*3.5,S*.5); [[-26,16,.5],[24,22,.46],[2,-24,.56]].forEach(function(p){ g.save(); g.translate(p[0],p[1]); g.scale(p[2],p[2]); roseta(g,[[8,58,12,2],[6,36,10,0]]); g.restore(); }); g.restore();
    var t=new THREE.CanvasTexture(c); t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; t.anisotropy=4; return t;
  }
  function atlasLuces(){
    var S=128, c=lienzo(S*4,S), g=c.getContext('2d'), i;
    disco(g,S*.5,S*.5,30,'#ffffff','#cdbd92');
    disco(g,S*1.5,S*.5,23,'#ffffff','#d6c69c');
    disco(g,S*2.5,S*.5,17,'#ffffff','#d2c39a');
    [[-24,-14,10],[20,-22,8],[26,18,11],[-14,24,9],[2,-2,7]].forEach(function(p){ disco(g,S*3.5+p[0],S*.5+p[1],p[2],'#ffffff','#cfc097'); });
    var t=new THREE.CanvasTexture(c); t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; t.anisotropy=4; return t;
  }
  function atlasFlores(){
    if(VAR==='a') return atlasCampo(); if(VAR==='b') return atlasAgave(); if(VAR==='c') return atlasLuces();
    var S=128, c=lienzo(S*4,S), g=c.getContext('2d'), i, a;
    /* 0 margarita */
    g.save(); g.translate(S*.5,S*.5);
    for(i=0;i<14;i++){ g.save(); g.rotate(i*6.283/14+(rnd()-.5)*.12); g.translate(0,-9); petalo(g,46+rnd()*5,8.5,.95,'#b9b19f','#f0ebdf','#ffffff'); g.restore(); }
    centro(g,13,26); g.restore();
    /* 1 flor de cinco pétalos anchos */
    g.save(); g.translate(S*1.5,S*.5);
    for(i=0;i<5;i++){ g.save(); g.rotate(i*6.283/5+.2); g.translate(0,-4); petalo(g,50,27,.78,'#c9bfa8','#f4eee0','#fffdf6'); g.restore(); }
    for(i=0;i<10;i++){ a=i*.6283; g.beginPath(); g.moveTo(0,0); g.lineTo(Math.cos(a)*15,Math.sin(a)*15); g.strokeStyle='rgba(120,92,40,.7)'; g.lineWidth=1; g.stroke(); g.beginPath(); g.arc(Math.cos(a)*15,Math.sin(a)*15,2.3,0,7); g.fillStyle='#d5aa4c'; g.fill(); }
    centro(g,6,5); g.restore();
    /* 2 estrella de seis puntas */
    g.save(); g.translate(S*2.5,S*.5);
    for(i=0;i<6;i++){ g.save(); g.rotate(i*6.283/6); g.translate(0,-5); petalo(g,54,14,.42,'#a9aaa6','#e4e4df','#fbfbf8'); g.restore(); }
    centro(g,8,10); g.restore();
    /* 3 racimo de florecitas */
    g.save(); g.translate(S*3.5,S*.5);
    for(i=0;i<9;i++){ a=i*6.283/8; var d=i===8?0:33+rnd()*5; g.save(); g.translate(Math.cos(a)*d,Math.sin(a)*d);
      for(var k=0;k<5;k++){ g.save(); g.rotate(k*6.283/5+i); g.translate(0,-1.5); petalo(g,15,8.5,.8,'#c4bba6','#f3eee2','#ffffff'); g.restore(); }
      g.beginPath(); g.arc(0,0,3,0,7); g.fillStyle='#caa04a'; g.fill(); g.restore(); }
    g.restore();
    var t=new THREE.CanvasTexture(c); t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; t.anisotropy=4; return t;
  }
  /* el suelo del campo: matas de pasto y rosetas de hoja fina, en vez de hojas anchas que parecían flores */
  function atlasPasto(){
    var S=128, c=lienzo(S*2,S), g=c.getContext('2d'), i, f;
    g.save(); g.translate(S*.5,S*.94);
    for(i=0;i<15;i++){ f=i/14-.5; g.save(); g.rotate(f*1.7+(r2()-.5)*.16); hoja(g,(104-Math.abs(f)*74)*(.82+r2()*.3),4.4,'#3b4639','#6f7d69','#a3b09b'); g.restore(); }
    g.restore();
    g.save(); g.translate(S*1.5,S*.5);
    for(i=0;i<17;i++){ g.save(); g.rotate(i*6.283/17+(r2()-.5)*.25); g.translate(0,-3); hoja(g,36+r2()*22,4.8,'#3a4538','#6a7864','#99a691'); g.restore(); }
    g.restore();
    var t=new THREE.CanvasTexture(c); t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; return t;
  }
  function atlasHojas(){
    if(VAR==='a') return atlasPasto();
    var S=128, c=lienzo(S*2,S), g=c.getContext('2d'), i;
    g.save(); g.translate(S*.5,S*.5);
    for(i=0;i<9;i++){ g.save(); g.rotate(i*6.283/9+(rnd()-.5)*.4); petalo(g,50+rnd()*10,10+rnd()*3,.35,'#4e5a4c','#8c9a86','#b9c6b2'); g.restore(); }
    g.restore();
    g.save(); g.translate(S*1.5,S*.5);
    for(i=0;i<7;i++){ g.save(); g.rotate(i*6.283/7+(rnd()-.5)*.5); g.translate(0,-4); petalo(g,40+rnd()*12,19,.75,'#465245','#7f8d7a','#a9b7a2'); g.restore(); }
    g.restore();
    var t=new THREE.CanvasTexture(c); t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter; return t;
  }

  /* ---------- sembrar el valle ---------- */
  var X0=-8.5, X1=8.5, Z0=7, Z1=-30;
  function sembrar(n,acepta,haz){
    var P=new Float32Array(n*3), I=new Float32Array(n*4), T=new Float32Array(n*3), k=0, guard=0;
    while(k<n && guard++<n*60){ var x=X0+rnd()*(X1-X0), z=Z0+rnd()*(Z1-Z0); var o=acepta(x,z); if(!o) continue; haz(x,z,o,P,I,T,k); k++; }
    return {P:P,I:I,T:T,n:k};
  }
  var NF=lite?13000:27000, NH=lite?22000:46000;
  var flores=sembrar(NF,function(x,z){
    var d=Math.abs(x-cauce(z)), parche=fbm(x*.42+11,z*.42+5), orilla=sstep(.25,1.1,d)*(1-.55*sstep(4.5,7.5,d));
    var p=orilla*sstep(.30,.56,parche); return rnd()<p?{d:d,parche:parche}:null;
  },function(x,z,o,P,I,T,k){
    var zona=fbm(x*.16+31,z*.16+17), tipo, tinte, s;
    if(zona<.4){ tipo=rnd()<.82?0:3; tinte=[.66,.65,.61]; s=.075+rnd()*.06; }
    else if(zona<.5){ tipo=rnd()<.75?1:3; tinte=[.70,.67,.60]; s=.08+rnd()*.065; }
    else if(zona<.6){ tipo=rnd()<.7?2:0; tinte=[.54,.56,.60]; s=.07+rnd()*.055; }
    else { tipo=rnd()<.6?3:1; tinte=[.68,.62,.50]; s=.075+rnd()*.06; }
    var v=.82+rnd()*.3; P[k*3]=x; P[k*3+1]=alto(x,z)+.08+rnd()*.16; P[k*3+2]=z;
    I[k*4]=s; I[k*4+1]=rnd()*6.283; I[k*4+2]=tipo; I[k*4+3]=rnd();
    T[k*3]=tinte[0]*v; T[k*3+1]=tinte[1]*v; T[k*3+2]=tinte[2]*v;
  });
  var hojas=sembrar(NH,function(x,z){ var d=Math.abs(x-cauce(z)); return rnd()<(.16+.84*sstep(.1,.9,d))?{d:d}:null; },
  function(x,z,o,P,I,T,k){
    var e=.3, nx=alto(x-e,z)-alto(x+e,z), nz=alto(x,z-e)-alto(x,z+e), luz=.55+.9*Math.max(0,(nx*.7+nz*.45)/Math.sqrt(nx*nx+nz*nz+e*e*4)+.35);
    var v=(.55+rnd()*.6)*luz*(.5+.5*sstep(.1,1.4,o.d)), gris=rnd();
    P[k*3]=x; P[k*3+1]=alto(x,z)+.02+rnd()*.1; P[k*3+2]=z;
    I[k*4]=.22+rnd()*.24; I[k*4+1]=rnd()*6.283; I[k*4+2]=rnd()<.6?0:1; I[k*4+3]=rnd();
    T[k*3]=(.21+.10*gris)*v; T[k*3+1]=(.30+.07*gris)*v; T[k*3+2]=(.22+.09*gris)*v;
  });

  (function(){ var k, n=flores.n, I=flores.I, P=flores.P, T=flores.T;
    if(VAR==='a'){ for(k=0;k<n;k++){ I[k*4+1]=(I[k*4+1]/6.283-.5)*.7; I[k*4]*=1.55; P[k*3+1]+=I[k*4]*.34; }
      for(k=0;k<hojas.n;k++){ if(hojas.I[k*4+2]===0){ hojas.I[k*4+1]=(hojas.I[k*4+1]/6.283-.5)*.6; hojas.I[k*4]*=1.3; hojas.P[k*3+1]+=hojas.I[k*4]*.3; } } }
    if(VAR==='b'){ for(k=0;k<n;k++){ I[k*4]*=1.15; } }
    if(VAR==='c'){ for(k=0;k<n;k++){ I[k*4]*=.42+.3*I[k*4+3]; T[k*3]*=.62; T[k*3+1]*=.56; T[k*3+2]*=.44; } }
  })();
  /* ---------- materiales ---------- */
  var HIT=[]; for(var h=0;h<5;h++) HIT.push(new THREE.Vector4(0,0,0,1.6));
  var U={uTime:{value:0},uHit:{value:HIT},uFogA:{value:8},uFogB:{value:19},uMap:{value:null},uCells:{value:4},uAlza:{value:1},uCalor:{value:1},uEsc:{value:1},uOla:{value:new THREE.Vector4(0,0,0,0)}};
  var VERT=[
   'attribute vec3 aPos;attribute vec4 aInfo;attribute vec3 aTint;',
   'uniform float uTime;uniform vec4 uHit[5];uniform vec4 uOla;uniform float uFogA;uniform float uFogB;uniform float uAlza;uniform float uEsc;',
   'varying vec2 vUv;varying vec3 vTint;varying float vGlow;varying float vFog;varying float vCell;',
   'void main(){',
   ' vec3 p=aPos;float g=0.;',
   ' for(int i=0;i<5;i++){float d=distance(p.xz,uHit[i].xy);float k=smoothstep(uHit[i].w,0.,d);g=max(g,uHit[i].z*k*k);}',
   ' g=max(g,uOla.w*(1.-smoothstep(uOla.z-3.,uOla.z,distance(p.xz,uOla.xy)))*(.7+.3*sin(uTime*2.1+aInfo.w*40.)));',
   ' p.x+=sin(uTime*1.25+aInfo.w*6.283)*.014*uAlza;p.y+=g*.05*uAlza;',
   ' vec4 mv=modelViewMatrix*vec4(p,1.);',
   ' float s=aInfo.x*uEsc*(1.+g*.75*uAlza);float a=aInfo.y+sin(uTime*.7+aInfo.w*9.)*.12;float c=cos(a),sn=sin(a);',
   ' vec2 q=mat2(c,-sn,sn,c)*position.xy*s;q.y*=.86;mv.xy+=q;',
   ' gl_Position=projectionMatrix*mv;',
   ' vUv=uv;vCell=aInfo.z;vTint=aTint;vGlow=g;vFog=smoothstep(uFogA,uFogB,-mv.z);',
   '}'].join('\n');
  var FRAG=[
   'precision mediump float;uniform sampler2D uMap;uniform float uCells;uniform float uCalor;',
   'varying vec2 vUv;varying vec3 vTint;varying float vGlow;varying float vFog;varying float vCell;',
   'void main(){',
   ' vec4 t=texture2D(uMap,vec2((vUv.x+vCell)/uCells,vUv.y));if(t.a<.42)discard;',
   ' vec3 col=t.rgb*vTint;',
   ' vec3 calido=vec3(1.,.94,.82);',
   ' col=mix(col,t.rgb*calido*1.18,vGlow*uCalor)+calido*vGlow*vGlow*.22*uCalor;',
   ' col*=1.-vFog;',
   ' gl_FragColor=vec4(col,1.);',
   '}'].join('\n');
  function nube(d,tex,cells,alza,calor){
    var g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0]),3));
    g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array([0,0,1,0,1,1,0,1]),2)); g.setIndex([0,1,2,0,2,3]);
    g.setAttribute('aPos',new THREE.InstancedBufferAttribute(d.P.subarray(0,d.n*3),3));
    g.setAttribute('aInfo',new THREE.InstancedBufferAttribute(d.I.subarray(0,d.n*4),4));
    g.setAttribute('aTint',new THREE.InstancedBufferAttribute(d.T.subarray(0,d.n*3),3));
    g.instanceCount=d.n;
    var u={}; for(var k in U) u[k]=U[k]; u.uMap={value:tex}; u.uCells={value:cells}; u.uAlza={value:alza}; u.uCalor={value:calor}; u.uEsc={value:1};
    var m=new THREE.ShaderMaterial({uniforms:u,vertexShader:VERT,fragmentShader:FRAG});
    var mesh=new THREE.Mesh(g,m); mesh.frustumCulled=false; return mesh;
  }
  var scene=new THREE.Scene();
  scene.add(nube(hojas,atlasHojas(),2,.35,.3));
  scene.add(nube(flores,atlasFlores(),4,1,1));
  /* suelo negro bajo las hojas, para que el fondo del valle no quede hueco */
  var suelo=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshBasicMaterial({color:0x040504})); suelo.rotation.x=-Math.PI/2; suelo.position.set(0,-.35,-10); scene.add(suelo);

  /* luciérnagas: unas pocas luces sueltas que suben despacio */
  var NL=lite?140:260, lp=new Float32Array(NL*3), lr=new Float32Array(NL);
  for(var i=0;i<NL;i++){ lp[i*3]=X0+rnd()*(X1-X0); lp[i*3+1]=.3+rnd()*2.2; lp[i*3+2]=Z0+rnd()*(Z1-Z0); lr[i]=rnd(); }
  var lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.BufferAttribute(lp,3)); lg.setAttribute('aR',new THREE.BufferAttribute(lr,1));
  var UL={uTime:U.uTime,uPx:{value:1},uFogA:U.uFogA,uFogB:U.uFogB};
  var luces=new THREE.Points(lg,new THREE.ShaderMaterial({uniforms:UL,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'attribute float aR;uniform float uTime;uniform float uPx;uniform float uFogA;uniform float uFogB;varying float vA;void main(){vec3 p=position;p.y+=mod(uTime*.05*(.5+aR)+aR*3.,2.4)-.2;p.x+=sin(uTime*.4+aR*20.)*.25;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(2.+3.*aR)*uPx*(6./max(-mv.z,.5));vA=(.35+.65*sin(uTime*1.3+aR*40.)*.5+.3)*(1.-smoothstep(uFogA,uFogB,-mv.z));}',
    fragmentShader:'precision mediump float;varying float vA;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float a=exp(-r*r*3.)*vA;gl_FragColor=vec4(vec3(1.,.86,.6)*a,a);}'}));
  luces.frustumCulled=false; scene.add(luces);

  /* ---------- las ramas del menú: una por parada, alternando derecha e izquierda ---------- */
  var botones=[].slice.call(host.querySelectorAll('.rama')), atajos=[].slice.call(host.querySelectorAll('.atajos button')), ramas=[], atlasF=atlasFlores();
  var NR=botones.length, U0=.75, PASO=1, HOLD=.5, UMAX=U0+(NR-1)*PASO+HOLD, FIN=1.25, UTOT=UMAX+FIN, ola=0, rayo=0, olaOn=false, eco=-1, T0=3.4, DT=4.5, DRIFT=.3;   /* U en alturas de pantalla, T en metros de valle */
  function suave(x){ x=Math.max(0,Math.min(1,x)); return .2*x+.8*x*x*(3-2*x); }
  function viajeDe(u){
    if(u<=0) return 0; if(u<U0) return T0*suave(u/U0);
    var k=Math.min(NR-1,Math.floor((u-U0)/PASO)), f=(u-U0)-k*PASO, base=T0+k*DT;
    if(k===NR-1||f<HOLD) return base+DRIFT*Math.min(1,f/HOLD);
    return base+DRIFT+(DT-DRIFT)*suave((f-HOLD)/(PASO-HOLD));
  }
  function densidad(x,z){ var s=0; for(var a=0;a<6;a++){ var px=x+Math.cos(a*1.047)*.7, pz=z+Math.sin(a*1.047)*.7, d=Math.abs(px-cauce(pz)); s+=sstep(.25,1.1,d)*(1-.55*sstep(4.5,7.5,d))*sstep(.30,.56,fbm(px*.42+11,pz*.42+5)); } return s; }
  function pose(viaje,C,L){ var cz=5.2-viaje, cx=cauce(cz)*.55; C.set(cx,alto(cx,cz)+1.55,cz); var lz=cz-6.5; L.set(cauce(lz)*.8,.35,lz); }
  var MTALLO={vertexShader:'uniform float uFogA;uniform float uFogB;varying vec2 vUv;varying float vFog;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vFog=smoothstep(uFogA,uFogB,-mv.z);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'precision mediump float;uniform float uGrow;varying vec2 vUv;varying float vFog;void main(){if(vUv.x>uGrow)discard;gl_FragColor=vec4(vec3(.62,.6,.54)*(1.-vFog),1.);}'};
  var camT=new THREE.PerspectiveCamera(40,1,.2,60), Ct=new THREE.Vector3(), Lt=new THREE.Vector3(), dir=new THREE.Vector3();
  function armarRamas(aspect){
    ramas.forEach(function(r){ scene.remove(r.tallo); scene.remove(r.flor); r.tallo.geometry.dispose(); r.flor.geometry.dispose(); }); ramas=[];
    var vert=aspect<.85, dist=vert?3.4:4.2, Wc=stick.clientWidth||innerWidth, bmax=260; botones.forEach(function(b){ bmax=Math.max(bmax,b.offsetWidth); });
    /* en pantallas angostas la flor se acerca al centro lo justo para que el texto quepa a su lado sin pisarla */
    var nx=vert?.36:Math.max(.05,Math.min(.3,1-2*(bmax+112)/Wc)), ny=vert?.03:-.02;
    camT.fov=vert?58:40; camT.aspect=aspect; camT.updateProjectionMatrix();
    botones.forEach(function(b,i){
      var lado=i%2?-1:1; b.setAttribute('data-lado',lado>0?'d':'i');
      /* la flor se planta donde, parada la cámara en su tramo, cae justo en ese punto de la pantalla */
      pose(T0+i*DT+DRIFT*.5,Ct,Lt); camT.position.copy(Ct); camT.lookAt(Lt); camT.updateMatrixWorld();
      dir.set(lado*nx,ny,.5).unproject(camT).sub(Ct).normalize();
      var t=dist/Math.sqrt(dir.x*dir.x+dir.z*dir.z), tip=new THREE.Vector3(Ct.x+dir.x*t,Ct.y+dir.y*t,Ct.z+dir.z*t);
      var lean=lado*.12, x=tip.x-lean, z=tip.z, y0=alto(x,z)+.02; if(tip.y<y0+.55) tip.y=y0+.55; var hh=tip.y-y0;
      var curva=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y0,z),new THREE.Vector3(x-lean*.6,y0+hh*.35,z),new THREE.Vector3(x+lean*.2,y0+hh*.7,z),tip]);
      var ut={uGrow:{value:0},uFogA:U.uFogA,uFogB:U.uFogB};
      var tallo=new THREE.Mesh(new THREE.TubeGeometry(curva,28,.013,5,false),new THREE.ShaderMaterial({uniforms:ut,vertexShader:MTALLO.vertexShader,fragmentShader:MTALLO.fragmentShader}));
      tallo.frustumCulled=false; scene.add(tallo);
      var flor=nube({P:new Float32Array([tip.x,tip.y,tip.z]),I:new Float32Array([VAR==='c'?.26:.34,VAR==='a'?0:i*1.3,VAR==='c'?(i%2):VAR==='a'?[0,1,3,0][i%4]:i%4,i*.23]),T:new Float32Array([1,.98,.92]),n:1},atlasF,4,.6,1);
      flor.material.uniforms.uEsc.value=0; scene.add(flor);
      /* la luz cae del lado contrario al texto, para que la letra quede sobre lo oscuro */
      var lx=x, lz=z, mejor=-1; [vert?.5:1.2,vert?.8:1.7,vert?1.1:2.3].forEach(function(dx){ [-.3,-1.1,-1.9].forEach(function(dz){ var qx=x-lado*dx, qz=z+dz, de=densidad(qx,qz); if(de>mejor){ mejor=de; lx=qx; lz=qz; } }); });
      ramas.push({b:b,a:atajos[i],tip:tip,base:new THREE.Vector3(x,y0,z),luz:new THREE.Vector3(lx,alto(lx,lz),lz),tallo:tallo,flor:flor,ut:ut,grow:0,vis:0,lado:lado,t:T0+i*DT});
    });
  }
  var sobre=-1, finS='';
  botones.forEach(function(b,i){
    b.addEventListener('pointerenter',function(){ sobre=i; }); b.addEventListener('pointerleave',function(){ if(sobre===i) sobre=-1; });
    b.addEventListener('focus',function(){ sobre=i; }); b.addEventListener('blur',function(){ if(sobre===i) sobre=-1; });
  });
  var pausa=false; document.addEventListener('jardin:pausa',function(e){ pausa=!!e.detail; });

  var cam=new THREE.PerspectiveCamera(40,1,.2,60);

  /* ---------- posproceso: desenfoque de lente por profundidad y resplandor ---------- */
  var rt=null, W=1, H=1, modoR='';
  var PU={tColor:{value:null},tDepth:{value:null},uPx:{value:new THREE.Vector2(1,1)},uNear:{value:.2},uFar:{value:60},uFocus:{value:6},uRange:{value:4},uMaxR:{value:10},uBloomR:{value:16},uTime:U.uTime,uAspect:{value:1},uRayo:{value:0}};
  var post=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:PU,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:[
     'precision highp float;uniform sampler2D tColor;uniform sampler2D tDepth;uniform vec2 uPx;uniform float uNear;uniform float uFar;uniform float uFocus;uniform float uRange;uniform float uMaxR;uniform float uBloomR;uniform float uTime;uniform float uAspect;uniform float uRayo;varying vec2 vUv;',
     'float vz(vec2 uv){float d=texture2D(tDepth,uv).x;float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}',
     'void main(){',
     ' float z=vz(vUv);float coc=clamp(abs(z-uFocus)/uRange-.1,0.,1.);coc=coc*coc*(3.-2.*coc);float r=coc*uMaxR;',
     ' vec3 acc=texture2D(tColor,vUv).rgb;vec3 bl=max(acc-vec3(.64),0.);',
     ' for(int i=1;i<=24;i++){float fi=float(i);float a=fi*2.39996;float rr=sqrt(fi/24.);vec2 o=vec2(cos(a),sin(a))*rr;',
     '  acc+=texture2D(tColor,vUv+o*r*uPx).rgb;',
     '  bl+=max(texture2D(tColor,vUv+o*uBloomR*uPx).rgb-vec3(.64),0.);}',
     ' vec3 col=acc/25.+bl/25.*2.1*vec3(1.,.93,.8);',
     ' vec2 q=vUv-.5;q.x*=min(uAspect,1.6)/1.6;col*=1.-dot(q,q)*1.25;',
     ' float n=fract(sin(dot(vUv*vec2(1921.,1087.)+uTime,vec2(12.9898,78.233)))*43758.5453);col+=(n-.5)*.018;',
     ' col+=uRayo*vec3(1.,.95,.84)*.42;',
     ' gl_FragColor=vec4(col,1.);',
     '}'].join('\n')}));
  var pscene=new THREE.Scene(); pscene.add(post); var pcam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);

  function resize(){
    var r=stick.getBoundingClientRect(); var w=Math.max(2,Math.round(r.width*DPR)), hh=Math.max(2,Math.round(r.height*DPR));
    if(w===W&&hh===H&&rt) return; W=w; H=hh;
    renderer.setSize(W,H,false);
    if(rt){ rt.depthTexture.dispose(); rt.dispose(); }
    rt=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false});
    rt.depthTexture=new THREE.DepthTexture(W,H); rt.depthTexture.type=renderer.capabilities.isWebGL2?THREE.UnsignedIntType:THREE.UnsignedShortType;
    PU.tColor.value=rt.texture; PU.tDepth.value=rt.depthTexture; PU.uPx.value.set(1/W,1/H); PU.uAspect.value=W/H;
    var k=H/900; PU.uMaxR.value=11*k; PU.uBloomR.value=17*k; UL.uPx.value=k;
    cam.aspect=W/H; cam.fov=W/H<.85?58:40; cam.updateProjectionMatrix();
    modoR=W/H<.85?'v':'h'; armarRamas(W/H);
  }
  resize(); addEventListener('resize',resize);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){ armarRamas(W/H); });
  document.addEventListener('click',function(e){ if(e.target.closest&&e.target.closest('[data-lang]')) setTimeout(function(){ armarRamas(W/H); },60); });

  /* ---------- cursor / dedo ---------- */
  var ptr={x:.15,y:-.1,last:-1e9,on:false};
  function mover(cx,cy){ var r=stick.getBoundingClientRect(); if(cy<r.top||cy>r.bottom) return; ptr.x=(cx-r.left)/r.width*2-1; ptr.y=-((cy-r.top)/r.height*2-1); ptr.last=performance.now(); ptr.on=true; }
  addEventListener('pointermove',function(e){ mover(e.clientX,e.clientY); },{passive:true});
  addEventListener('touchmove',function(e){ var t=e.touches[0]; if(t) mover(t.clientX,t.clientY); },{passive:true});
  addEventListener('touchstart',function(e){ var t=e.touches[0]; if(t) mover(t.clientX,t.clientY); },{passive:true});
  var ray=new THREE.Vector3(), o3=new THREE.Vector3(), hit=new THREE.Vector3(0,0,0), tgt=new THREE.Vector3(0,0,0);
  function toca(nx,ny,out){
    ray.set(nx,ny,.5).unproject(cam).sub(cam.position).normalize(); o3.copy(cam.position);
    if(ray.y>-.02){ out.set(o3.x+ray.x*14,0,o3.z+ray.z*14); return; }
    var t=0; for(var i=0;i<48;i++){ t+=.4; var x=o3.x+ray.x*t, y=o3.y+ray.y*t, z=o3.z+ray.z*t; if(y<alto(x,z)+.12){ out.set(x,y,z); return; } }
    out.set(o3.x+ray.x*t,0,o3.z+ray.z*t);
  }
  var estela=[], tEstela=0;

  /* ---------- recorrido ---------- */
  var visible=true, prog=0, progS=0;
  if('IntersectionObserver' in window){ new IntersectionObserver(function(es){ visible=es[0].isIntersecting; },{rootMargin:'120px'}).observe(host); }
  function leerScroll(){ var r=host.getBoundingClientRect(), total=r.height-innerHeight; prog=total>0?Math.max(0,Math.min(1,-r.top/total)):0; host.style.setProperty('--p',Math.min(1,prog*UTOT).toFixed(3)); }
  var pv=new THREE.Vector3();
  addEventListener('scroll',leerScroll,{passive:true}); leerScroll();

  var la=new THREE.Vector3(), t0=performance.now(), tPrev=t0;
  function frame(now){
    requestAnimationFrame(frame);
    if(!visible||pausa) return;
    resize();
    var time=(now-t0)/1000; U.uTime.value=time;
    var dt=Math.min(.25,Math.max(.001,(now-tPrev)/1000)); tPrev=now;
    progS+=(prog-progS)*(1-Math.exp(-dt*4.2));
    var uu=progS*UTOT, v0=viajeDe(Math.min(uu,UMAX)), fin=Math.max(0,Math.min(1,(uu-UMAX)/FIN)), fe=fin*fin*(3-2*fin), viaje=v0+1.5*fe+(reduce?0:Math.sin(time*.08)*.35*Math.max(0,1-uu));
    var cz=5.2-viaje, cx=cauce(cz)*.55+(reduce?0:Math.sin(time*.11)*.25)+ptr.x*.3;
    cam.position.set(cx,alto(cx,cz)+1.55+.95*fe+ptr.y*.08,cz);
    var lz=cz-6.5; la.set(cauce(lz)*.8+ptr.x*.5,.35+1.05*fe,lz); cam.lookAt(la);
    /* final: cae un rayo y la luz corre por todo el valle */
    var quiere=fin>.3; if(quiere&&!olaOn){ rayo=1; eco=now+140; } olaOn=quiere;
    if(eco>0&&now>eco){ rayo=Math.max(rayo,.7); eco=-1; }
    rayo*=Math.exp(-dt*5.5); PU.uRayo.value=reduce?0:rayo;
    ola+=((quiere?1:0)-ola)*(1-Math.exp(-dt*(quiere?1.5:3.2)));
    U.uOla.value.set(cx,cz-2.,1.+19.*(1.-(1.-ola)*(1.-ola)),.82*Math.min(1,ola*3.));
    var fs=fin.toFixed(3); if(fs!==finS){ finS=fs; host.style.setProperty('--f',fs); host.classList.toggle('fin',fin>.62); }
    cam.updateMatrixWorld();
    /* dónde cae la luz */
    var idle=now-ptr.last>2600;
    var act=-1, actV=0; for(var q=0;q<ramas.length;q++){ if(ramas[q].vis>actV){ actV=ramas[q].vis; act=q; } }
    if(sobre>=0&&ramas[sobre]&&ramas[sobre].vis>.5){ tgt.copy(ramas[sobre].luz); }
    else if(!idle&&ptr.on){ toca(ptr.x,ptr.y,tgt); }
    else if(act>=0&&actV>.2){ var A=ramas[act]; tgt.set(A.luz.x+.35*Math.sin(time*.5),A.luz.y,A.luz.z+.3*Math.sin(time*.37+1.)); }
    else toca(.34*Math.sin(time*.42)+.08,-.22+.2*Math.sin(time*.31+1.2),tgt);
    hit.lerp(tgt,1-Math.exp(-dt*9));
    if(now-tEstela>110){ tEstela=now; estela.push({x:hit.x,z:hit.z,t:now}); if(estela.length>4) estela.shift(); }
    HIT[0].set(hit.x,hit.z,1,2.5);
    for(var i=0;i<4;i++){ var e=estela[estela.length-1-i]; if(e){ var age=(now-e.t)/1700; HIT[i+1].set(e.x,e.z,Math.max(0,1-age)*.8,2.1); } else HIT[i+1].z=0; }
    /* foco: un poco delante de la cámara, donde está la luz */
    var df=cam.position.distanceTo(hit); if(act>=0){ df+=(cam.position.distanceTo(ramas[act].tip)-df)*actV; } PU.uFocus.value+=(Math.max(3.2,Math.min(9,df))-PU.uFocus.value)*(1-Math.exp(-dt*3)); PU.uRange.value=PU.uFocus.value*.62;
    /* cada rama crece al llegar a su parada y se despide al seguir; el texto va pegado a su flor */
    var r0=stick.getBoundingClientRect(), vert=modoR==='v', Wp=r0.width;
    for(var k=0;k<ramas.length;k++){ var R=ramas[k], d=R.t-v0, g=sstep(3.2,.7,d)*(1-sstep(.6,1.8,-d)); R.grow=g; R.ut.uGrow.value=g; R.flor.material.uniforms.uEsc.value=sstep(.82,1,g);
      var vis=sstep(1.,.2,d)*(1-sstep(.5,1.4,-d))*(1-sstep(.04,.3,fin)); R.vis=vis;
      pv.copy(R.tip).project(cam); var tx=(pv.x*.5+.5)*Wp, ty=(-pv.y*.5+.5)*r0.height, bw=R.b.offsetWidth, x, tr;
      if(vert){ if(R.lado>0){ x=Math.min(Wp-8,Math.max(bw+8,tx+64)); tr='translate(-100%,-100%)'; } else { x=Math.max(8,Math.min(Wp-bw-8,tx-64)); tr='translate(0,-100%)'; } ty-=44; }
      else if(R.lado>0){ x=Math.min(Wp-bw-12,tx+78); tr='translate(0,-50%)'; } else { x=Math.max(bw+12,tx-78); tr='translate(-100%,-50%)'; }
      R.b.style.transform='translate('+x.toFixed(1)+'px,'+(ty+(1-vis)*14).toFixed(1)+'px) '+tr;
      R.b.style.opacity=vis.toFixed(3); var on=vis>.6; R.b.style.pointerEvents=on?'auto':'none'; R.b.tabIndex=on?0:-1;
      if(R.a&&R.on!==on){ R.on=on; R.a.classList.toggle('on',on); } }
    renderer.setRenderTarget(rt); renderer.render(scene,cam);
    renderer.setRenderTarget(null); renderer.render(pscene,pcam);
  }
  requestAnimationFrame(frame);
})();
