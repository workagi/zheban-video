/* Shared noir lighting/compositing, adapted from the user-supplied reference anim.js.
   Background -> subject -> near particles / light leaks / vignette -> UI -> grain -> fade.
   No topic data or narrative text lives in this module. */
(function(){
 const E=window.CKV,C=E.CINEMATIC={},TAU=Math.PI*2,mod=(a,n)=>((a%n)+n)%n;
 let dot,bokeh,glow,dust,near,far,grain,vig;
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 function sprite(size,stops){const c=canvas(size,size),g=c.getContext('2d',{willReadFrequently:true}),r=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);for(const [p,col]of stops)r.addColorStop(p,col);g.fillStyle=r;g.fillRect(0,0,size,size);return c;}
 C.init=()=>{
  const S=E.S,W=E.W,H=E.H,col=(a)=>E.hexA(S.c.accent2,a),r=E.rng('cinematic-depth-v1');
  dot=sprite(64,[[0,col(1)],[.18,col(.7)],[.5,col(.12)],[1,col(0)]]);
  bokeh=sprite(256,[[0,col(.55)],[.6,col(.3)],[.86,col(.18)],[.94,col(.05)],[1,col(0)]]);
  glow=sprite(512,[[0,col(1)],[.25,col(.45)],[.6,col(.12)],[1,col(0)]]);
  dust=Array.from({length:150},()=>({x:r()*W,y:r()*H,z:r(),ph:r()*TAU,f:.15+r()*.5,ax:10+r()*50,vy:5+r()*20,vx:(r()-.5)*10,tw:.6+r()*2.6}));
  near=Array.from({length:9},()=>({x:r()*W,y:r()*H,s:40+r()*90,vx:(r()-.5)*30,vy:-(4+r()*10),ph:r()*TAU,a:.05+r()*.08}));
  far=Array.from({length:22},()=>({x:r()*W,y:r()*H,r:60+r()*220,a:.03+r()*.06,vx:(r()-.5)*14,vy:-(2+r()*7),ph:r()*TAU}));
  grain=Array.from({length:6},(_,k)=>{const c=canvas(256,256),g=c.getContext('2d',{willReadFrequently:true}),im=g.createImageData(256,256),rng=E.rng(900+k);for(let i=0;i<im.data.length;i+=4){const v=rng()*255|0;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}g.putImageData(im,0,0);return c;});
  vig=canvas(W,H);const g=vig.getContext('2d',{willReadFrequently:true});g.translate(W/2,H/2);g.scale(1,.72);const v=g.createRadialGradient(0,0,250,0,0,1180);[[0,0],[.5,.12],[.8,.55],[1,.92]].forEach(([p,a])=>v.addColorStop(p,'rgba(0,0,0,'+a+')'));g.fillStyle=v;g.fillRect(-W,-H*1.5,W*2,H*3);
 };
 C.background=(c,t,sc)=>{
  const W=E.W,H=E.H,S=E.S,p=sc._staging;c.save();c.globalAlpha=1;c.globalCompositeOperation='source-over';c.fillStyle=S.c.bg1;c.fillRect(0,0,W,H);
  const x=W*.5+240*Math.sin(t*.13),y=H*.46+90*Math.cos(t*.17),g=c.createRadialGradient(x,y,0,x,y,1100);
  g.addColorStop(0,E.hexA(S.c.accent,.15+p.key*.1));g.addColorStop(.45,E.hexA(S.c.accent,.035));g.addColorStop(1,E.hexA(S.c.accent,0));c.fillStyle=g;c.fillRect(0,0,W,H);
  c.globalCompositeOperation='lighter';for(const b of far){const x=mod(b.x+b.vx*t,W+500)-250,y=mod(b.y+b.vy*t,H+500)-250;c.globalAlpha=b.a*p.bokeh*(.7+.3*Math.sin(t*.5+b.ph));c.drawImage(bokeh,x-b.r,y-b.r,b.r*2,b.r*2);}c.restore();
 };
 C.floor=(c,t,alpha=.12)=>{
  const hy=600,H=E.H,W=E.W;c.save();c.lineWidth=1;const g=c.createLinearGradient(0,hy,0,H+60);g.addColorStop(0,E.hexA(E.S.c.accent,0));g.addColorStop(.35,E.hexA(E.S.c.accent,alpha*.5));g.addColorStop(1,E.hexA(E.S.c.accent,alpha*.9));c.strokeStyle=g;
  for(let i=-16;i<=16;i++){c.beginPath();c.moveTo(W/2+i*10,hy);c.lineTo(W/2+i*190,H+60);c.stroke();}
  for(let k=0;k<16;k++){const z=(k+mod(t*.8,1))/16,y=hy+(H+60-hy)*Math.pow(z,2.3);c.strokeStyle=E.hexA(E.S.c.accent,alpha*z*z);c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}c.restore();
 };
 C.finish=(c,t,sc)=>{
  const W=E.W,H=E.H,p=sc._staging;c.save();c.globalCompositeOperation='lighter';
  for(const d of dust){const s=.7+d.z*d.z*4.2,y=mod(d.y-d.vy*t*(.5+d.z),H+40)-20,x=mod(d.x+d.vx*t+Math.sin(t*d.f+d.ph)*d.ax,W+40)-20;c.globalAlpha=p.dust*(.22+.7*d.z)*(.5+.5*Math.sin(t*d.tw+d.ph));c.drawImage(dot,x-s*3,y-s*3,s*6,s*6);}
  for(const d of near){const x=mod(d.x+d.vx*t,W+300)-150,y=mod(d.y+d.vy*t,H+300)-150;c.globalAlpha=p.dust*d.a*(.6+.4*Math.sin(t*.7+d.ph));c.drawImage(bokeh,x-d.s,y-d.s,d.s*2,d.s*2);}
  c.globalCompositeOperation='screen';c.globalAlpha=.10+.05*Math.sin(t*.4);c.drawImage(glow,-420+60*Math.sin(t*.21),-380,1100,900);c.globalAlpha=.07+.05*Math.sin(t*.33+2);c.drawImage(glow,W-650+80*Math.sin(t*.18),H-520,1100,900);
  const since=t-sc.t0-sc.visual.computed.complete;
  if(p.flash&&since>=0&&since<1.2){c.globalCompositeOperation='lighter';c.globalAlpha=p.flash*Math.exp(-since*5.5);c.drawImage(glow,W/2-1100,500-900,2200,1800);}
  c.globalAlpha=1;c.globalCompositeOperation='source-over';c.drawImage(vig,0,0);c.restore();
 };
 C.grain=(c,t)=>{const fi=Math.round(t*(E.state().SB.fps||30)),pat=c.createPattern(grain[fi%6],'repeat');pat.setTransform(new DOMMatrix().translate(fi*73%256,fi*151%256));c.save();c.globalCompositeOperation='overlay';c.globalAlpha=.10;c.fillStyle=pat;c.fillRect(0,0,E.W,E.H);c.restore();};
})();
