// ============================================================================
// TEXTURES — procedural canvas textures
// ============================================================================
// ============================================================================
// PROCEDURAL TEXTURES
// ============================================================================
function mkCanvas(w=256,h=256){ const c=document.createElement('canvas'); c.width=w; c.height=h; return {c,ctx:c.getContext('2d')}; }

function wallTex(base='#4a4032'){
  const {c,ctx}=mkCanvas(256); ctx.fillStyle=base; ctx.fillRect(0,0,256,256);
  const img=ctx.getImageData(0,0,256,256); for(let i=0;i<img.data.length;i+=4){const n=(Math.random()-.5)*28; img.data[i]+=n;img.data[i+1]+=n;img.data[i+2]+=n;} ctx.putImageData(img,0,0);
  ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.lineWidth=2;
  for(let y=0;y<=256;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
  for(let r=0;r<4;r++){const ys=r*64,off=r%2?64:0;for(let x=off;x<=256;x+=128){ctx.beginPath();ctx.moveTo(x,ys);ctx.lineTo(x,ys+64);ctx.stroke();}}
  for(let i=0;i<6;i++){const x=Math.random()*256,y=Math.random()*256,r=10+Math.random()*30;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(20,15,10,.25)');g.addColorStop(1,'rgba(20,15,10,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();}
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,1); return t;
}
function floorTex(base='#3a3328'){
  const {c,ctx}=mkCanvas(256); ctx.fillStyle=base; ctx.fillRect(0,0,256,256);
  const img=ctx.getImageData(0,0,256,256); for(let i=0;i<img.data.length;i+=4){const n=(Math.random()-.5)*22;img.data[i]+=n;img.data[i+1]+=n;img.data[i+2]+=n;} ctx.putImageData(img,0,0);
  ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.lineWidth=2;
  for(let i=0;i<=256;i+=64){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.stroke();}
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(12,12); return t;
}
function ceilTex(base='#2a2418'){
  const {c,ctx}=mkCanvas(256); ctx.fillStyle=base; ctx.fillRect(0,0,256,256);
  const img=ctx.getImageData(0,0,256,256); for(let i=0;i<img.data.length;i+=4){const n=(Math.random()-.5)*16;img.data[i]+=n;img.data[i+1]+=n;img.data[i+2]+=n;} ctx.putImageData(img,0,0);
  ctx.strokeStyle='rgba(0,0,0,.5)'; ctx.lineWidth=3; ctx.strokeRect(2,2,252,252);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(10,10); return t;
}
function doorTex(base='#6a4a28'){
  const {c,ctx}=mkCanvas(128,256); ctx.fillStyle=base; ctx.fillRect(0,0,128,256);
  const img=ctx.getImageData(0,0,128,256); for(let i=0;i<img.data.length;i+=4){const n=(Math.random()-.5)*18;img.data[i]+=n;img.data[i+1]+=n;img.data[i+2]+=n;} ctx.putImageData(img,0,0);
  ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=3; ctx.strokeRect(16,20,96,90); ctx.strokeRect(16,140,96,90);
  const t=new THREE.CanvasTexture(c); return t;
}
function barrelTex(){
  const {c,ctx}=mkCanvas(128,128); ctx.fillStyle='#7a2a1a'; ctx.fillRect(0,0,128,128);
  for(let x=0;x<128;x+=4){ctx.fillStyle=`rgba(${100+Math.random()*40},${30+Math.random()*20},${20+Math.random()*15},.3)`;ctx.fillRect(x,0,3,128);}
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(0,16,128,4); ctx.fillRect(0,108,128,4);
  ctx.fillStyle='#ddaa22'; ctx.fillRect(0,56,128,16);
  ctx.fillStyle='rgba(0,0,0,.8)'; for(let x=0;x<128;x+=16){ctx.beginPath();ctx.moveTo(x,56);ctx.lineTo(x+8,72);ctx.lineTo(x+16,72);ctx.lineTo(x+8,56);ctx.fill();}
  return new THREE.CanvasTexture(c);
}
function crateTex(){
  const {c,ctx}=mkCanvas(128,128); ctx.fillStyle='#8a6a3a'; ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='rgba(50,30,10,.5)'; ctx.lineWidth=2;
  for(let y=0;y<=128;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();}
  for(let i=0;i<40;i++){ctx.strokeStyle=`rgba(${60+Math.random()*40},${40+Math.random()*20},${20+Math.random()*15},${.15+Math.random()*.2})`;ctx.lineWidth=1;const y=Math.random()*128;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(32,y+(Math.random()-.5)*6,96,y+(Math.random()-.5)*6,128,y);ctx.stroke();}
  ctx.strokeStyle='rgba(40,25,10,.7)'; ctx.lineWidth=4; ctx.strokeRect(2,2,124,124);
  ctx.fillStyle='#3a2a18'; for(const[x,y]of[[12,12],[116,12],[12,116],[116,116]]){ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.fill();}
  return new THREE.CanvasTexture(c);
}
function muzzleTex(){
  const {c,ctx}=mkCanvas(64); const g=ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,200,1)'); g.addColorStop(.3,'rgba(255,180,60,.8)'); g.addColorStop(.7,'rgba(255,80,20,.3)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,64,64); return new THREE.CanvasTexture(c);
}
