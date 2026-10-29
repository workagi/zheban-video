/* Content-specific visual argument. Every motion is a pure function of p.t. */
(function(){
const C=window.CKV_CUSTOM=window.CKV_CUSTOM||{};
const clamp=x=>Math.max(0,Math.min(1,x));
const out=x=>1-Math.pow(1-clamp(x),3);
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const gate=(t,a,b,d=.35)=>smooth((t-a)/d)*smooth((b-t)/d);
let metalTex;
function rgb(h){return h.replace('#','').match(/../g).map(x=>parseInt(x,16))}
function mix(a,b,k){const A=rgb(a),B=rgb(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*k).toString(16).padStart(2,'0')).join('')}
function glow(c,x,y,rx,ry,col,a){c.save();c.translate(x,y);c.scale(1,ry/rx);const g=c.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');c.globalAlpha=a;c.fillStyle=g;c.fillRect(-rx,-rx,rx*2,rx*2);c.restore()}
function metal(c,x,y,w,h,S,bright=1){const g=c.createLinearGradient(x,y,x+w,y+h*.12);g.addColorStop(0,mix(S.c.accent,S.c.bg1,.3));g.addColorStop(.12,S.c.accent2);g.addColorStop(.25,S.c.accent);g.addColorStop(.51,mix(S.c.accent,S.c.bg1,.14));g.addColorStop(.76,mix(S.c.accent2,'#ffffff',.22));g.addColorStop(1,mix(S.c.accent,S.c.bg1,.45));return g}
function foilText(c,E,text,x,y,opts={}){return E.label(c,text,x,y,Object.assign({role:'title',size:72,align:'left',color:E.S.c.accent2,maxW:1500,anim:'settle'},opts))}
function badge(c,E,x,y,r,t,alpha=1){const S=E.S;c.save();c.globalAlpha=alpha;glow(c,x,y,r*2.4,r*2.4,S.c.accent,.28);c.save();c.translate(x,y);c.rotate(-.08+Math.sin(t*.55)*.025);for(let i=0;i<52;i++){const a=i*Math.PI*2/52+t*.012;c.save();c.rotate(a);const g=c.createLinearGradient(0,r*.7,0,r*3.2);g.addColorStop(0,E.hexA(S.c.accent2,.18));g.addColorStop(1,E.hexA(S.c.accent,0));c.fillStyle=g;c.beginPath();c.moveTo(-r*.025,r*.75);c.lineTo(r*.025,r*.75);c.lineTo(r*.14,r*3.2);c.lineTo(-r*.14,r*3.2);c.fill();c.restore()}c.restore();
 c.shadowColor=E.hexA(S.c.accent,.55);c.shadowBlur=35;c.fillStyle=mix(S.c.accent,S.c.bg1,.5);c.beginPath();c.ellipse(x+9,y+12,r,r*.94,0,0,Math.PI*2);c.fill();c.shadowBlur=0;const g=c.createRadialGradient(x-r*.35,y-r*.45,2,x,y,r);g.addColorStop(0,mix(S.c.accent2,'#ffffff',.6));g.addColorStop(.42,S.c.accent2);g.addColorStop(.78,S.c.accent);g.addColorStop(1,mix(S.c.accent,S.c.bg1,.35));c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
 for(const [rad,width,col] of [[.97,3,S.c.accent2],[.89,2,mix(S.c.accent,S.c.bg1,.5)],[.85,2,S.c.accent2]]){c.strokeStyle=col;c.lineWidth=width;c.beginPath();c.arc(x,y,r*rad,0,Math.PI*2);c.stroke()}
 c.save();c.beginPath();c.arc(x,y,r*.83,0,Math.PI*2);c.clip();c.globalAlpha=alpha*.2;c.fillStyle=c.createPattern(metalTex,'repeat');c.fillRect(x-r,y-r,r*2,r*2);const sweep=(t*.18%1)*r*4-r*2;const sg=c.createLinearGradient(x+sweep-r*.2,y,x+sweep+r*.2,y);sg.addColorStop(0,'rgba(255,255,255,0)');sg.addColorStop(.5,'rgba(255,255,255,.8)');sg.addColorStop(1,'rgba(255,255,255,0)');c.globalAlpha=alpha*.55;c.fillStyle=sg;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
 for(let i=0;i<28;i++){const a=i/28*Math.PI*2;c.strokeStyle=E.hexA(S.c.accent2,.7);c.lineWidth=2;c.beginPath();c.moveTo(x+Math.cos(a)*r*.91,y+Math.sin(a)*r*.91);c.lineTo(x+Math.cos(a)*r*.96,y+Math.sin(a)*r*.96);c.stroke()}c.restore();
 E.label(c,'冠',x,y,{role:'label',size:r*1.12,min:r*.7,maxW:r*1.5,valign:'middle',color:mix(S.c.accent,S.c.bg1,.75),alpha,anim:'settle',maxLines:1});
}
function token(c,E,x,y,kind,k=1,r=38){const S=E.S;c.save();c.globalAlpha=k;const bad=kind==='背';const col=bad?S.c.bad:S.c.accent;const g=c.createRadialGradient(x-r*.3,y-r*.4,0,x,y,r);g.addColorStop(0,bad?mix(col,S.c.accent2,.15):S.c.accent2);g.addColorStop(.7,col);g.addColorStop(1,mix(col,S.c.bg1,.58));c.shadowColor=E.hexA(col,.5);c.shadowBlur=14;c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.shadowBlur=0;c.strokeStyle=E.hexA(bad?S.c.bad:S.c.accent2,.9);c.lineWidth=2;c.stroke();c.restore();E.label(c,kind,x,y,{size:r,role:'label',maxW:r*1.6,valign:'middle',kin:1,alpha:k,color:bad?S.c.accent2:mix(S.c.accent,S.c.bg1,.72),anim:'settle',maxLines:1})}
function arrow(c,E,x1,y1,x2,y2,k,col){if(k<=0)return;const x=x1+(x2-x1)*k,y=y1+(y2-y1)*k;E.stroke(c,[[x1,y1],[x,y]],{width:.65,color:col,alpha:.7});if(k>.9){const a=Math.atan2(y2-y1,x2-x1);E.stroke(c,[[x2-12*Math.cos(a-.5),y2-12*Math.sin(a-.5)],[x2,y2],[x2-12*Math.cos(a+.5),y2-12*Math.sin(a+.5)]],{width:.7,color:col,alpha:.85})}E.glowDot(c,x,y,3,col,.8)}
window.CKV_CUSTOM_INIT=async E=>{
 metalTex=document.createElement('canvas');metalTex.width=512;metalTex.height=512;const g=metalTex.getContext('2d'),rng=E.rng('brushed-brass');for(let i=0;i<1800;i++){g.strokeStyle=i%3?'rgba(255,255,255,.08)':'rgba(0,0,0,.12)';g.lineWidth=.35+rng()*.45;const y=rng()*512;g.beginPath();g.moveTo(rng()*512,y);g.lineTo(512,y+(rng()-.5)*3);g.stroke()}
 E.BG.pilot=(c,sc,tl,cam)=>{const S=E.S,W=E.W,H=E.H;const g=c.createRadialGradient(W*.5,H*.45,10,W*.5,H*.45,W*.65);g.addColorStop(0,mix(S.c.bg0,S.c.accent,.12));g.addColorStop(.6,S.c.bg0);g.addColorStop(1,S.c.bg1);c.fillStyle=g;c.fillRect(0,0,W,H);glow(c,W*.73,H*.18,W*.5,H*.55,S.c.accent,.075);const rng=E.rng('paper-numbers');c.save();c.font='28px '+S.fonts.title;for(let i=0;i<65;i++){const x=rng()*W,y=rng()*H;c.globalAlpha=.025+rng()*.035;c.fillStyle=S.c.accent2;c.fillText(['504.5','0:0','3:3','200','C','D','500.4'][i%7],x+Math.sin(tl*.1+i)*7,y)}c.restore();
 c.save();c.globalAlpha=.025;c.strokeStyle=S.c.accent2;for(let i=-7;i<=7;i++){c.beginPath();c.moveTo(W*.5+i*30,H*.67);c.lineTo(W*.5+i*250,H);c.stroke()}for(let i=0;i<6;i++){const y=H*.72+i*i*7;c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}c.restore();};
};
C.pilot=(c,r,p,E)=>{
 const t=p.t,S=E.S,evt=id=>E.eventProgress(p.sc,id,t);
 const intro=gate(t,-.5,3.8,.45),demo=gate(t,3.35,7.35,.4),chart=out(evt('chart'));
 if(intro>0){c.save();c.globalAlpha=intro;
  foilText(c,E,'一局都没赢，',145,305,{size:80,role:'title',kin:1,alpha:intro});
  foilText(c,E,'凭什么拿冠军？',145,425,{size:92,role:'title',kin:1,alpha:intro});
  E.label(c,'单挑胜负  ≠  循环赛排名',150,600,{align:'left',maxW:1000,size:38,color:S.c.text,kin:out(evt('question')),alpha:intro});
  badge(c,E,1430,420,150,t,intro);
  c.restore();
 }
 if(demo>0){c.save();c.globalAlpha=demo;
  const x=140,y=233,w=400,h=530;const pg=c.createLinearGradient(x,y,x+w,y+h);pg.addColorStop(0,E.hexA(S.c.accent,.08));pg.addColorStop(1,E.hexA(S.c.bg1,.65));c.fillStyle=pg;c.fillRect(x,y,w,h);E.stroke(c,E.rectPts(x,y,w,h),{width:.6,alpha:demo*.7});
  E.label(c,'单挑胜场',x+w/2,y+35,{size:38,color:S.c.text,maxW:350,alpha:demo});
  foilText(c,E,'0',x+w/2,y+110,{role:'big',size:220,align:'center',maxW:350,alpha:demo});
  E.label(c,'从不先背叛',x+w/2,y+425,{size:38,maxW:350,alpha:demo,color:S.c.text});
  foilText(c,E,'晚一轮，复制对手',650,195,{role:'quote',size:66,maxW:1100,alpha:demo});
  const start=890,dx=175,top=395,bottom=650;const opp=['合','背','合','合','背'],own=['合','合','背','合','合'];
  E.label(c,'对手',660,top,{align:'left',valign:'middle',size:38,maxW:180,alpha:demo});
  E.label(c,'以牙还牙',660,bottom,{align:'left',valign:'middle',size:38,maxW:210,alpha:demo,color:S.c.accent2});
  for(let i=0;i<5;i++){const a=out((t-3.75-i*.36)/.38);token(c,E,start+i*dx,top,opp[i],demo*a);const b=out((t-3.9-i*.36)/.38);token(c,E,start+i*dx,bottom,own[i],demo*b);if(i<4)arrow(c,E,start+i*dx+10,top+50,start+(i+1)*dx-10,bottom-50,out((t-4.25-i*.36)/.35),opp[i]==='背'?S.c.bad:S.c.accent2);}
  E.label(c,'规则示意 · 每列是一轮，箭头指向下一轮',650,775,{align:'left',size:30,maxW:1100,color:S.c.dim,alpha:demo});
  c.restore();
 }
 if(chart>0){c.save();c.globalAlpha=chart;
  const rows=p.sc.visual.data,base=770,start=220,gap=103,bw=64,max=520;
  const transition=1-smooth((t-10.5)/.5);
  if(transition>0)foilText(c,E,'把每场得分加起来',145,190,{role:'quote',size:70,alpha:transition*chart,maxW:1550});
  E.label(c,'首届循环赛 · 平均每场得分（200回合）',145,305,{align:'left',size:32,maxW:1400,color:S.c.text,kin:out(evt('chart-heading'))});
  E.stroke(c,[[145,base],[1780,base]],{width:.5,alpha:.6,k:chart});
  for(let i=rows.length-1;i>=0;i--){const row=rows[i],x=start+i*gap;const k=out((t-7.9-i*.035-(i===0?.38:0))/2.3);const h=360*row.score/max*k;const dep=17,dy=-11;const winner=i===0,level=winner?1:.54;
   c.save();c.globalAlpha=chart*(winner?1:.76);c.fillStyle=mix(S.c.accent,S.c.bg1,winner?.18:.55);c.beginPath();c.moveTo(x+bw,base);c.lineTo(x+bw+dep,base+dy);c.lineTo(x+bw+dep,base-h+dy);c.lineTo(x+bw,base-h);c.closePath();c.fill();
   c.fillStyle=metal(c,x,base-h,bw,h,S);c.globalAlpha=chart*(winner?1:.58);c.fillRect(x,base-h,bw,h);c.fillStyle=winner?S.c.accent2:mix(S.c.accent2,S.c.bg1,.4);c.beginPath();c.moveTo(x,base-h);c.lineTo(x+dep,base-h+dy);c.lineTo(x+bw+dep,base-h+dy);c.lineTo(x+bw,base-h);c.closePath();c.fill();
   c.save();c.beginPath();c.rect(x,base-h,bw,h);c.clip();c.globalAlpha=chart*.22;c.fillStyle=c.createPattern(metalTex,'repeat');c.fillRect(x,base-h,bw,h);if(winner&&t>10.4){const sy=base-h+((t-10.4)*150%Math.max(h,1));const sg=c.createLinearGradient(x,sy-35,x,sy+35);sg.addColorStop(0,'rgba(255,255,255,0)');sg.addColorStop(.5,'rgba(255,255,255,.6)');sg.addColorStop(1,'rgba(255,255,255,0)');c.globalAlpha=chart*.65;c.fillStyle=sg;c.fillRect(x,base-h,bw,h)}c.restore();
   c.strokeStyle=E.hexA(S.c.accent2,winner?.7:.2);c.lineWidth=1;c.strokeRect(x+.5,base-h+.5,bw-1,h-1);c.restore();
   E.label(c,(row.score*k).toFixed(1),x+bw/2,base-h-61,{size:30,min:30,maxW:100,maxLines:1,color:winner?S.c.accent2:S.c.text,kin:out((t-8.3-i*.035)/.4),alpha:chart});
   E.label(c,row.abbr,x+bw/2,base+18,{size:30,min:30,maxW:100,maxLines:1,color:winner?S.c.accent2:S.c.dim,kin:chart});
  }
  const win=out(evt('winner'));if(win>0){glow(c,252,420,150,70,S.c.accent,.23*win);
   const x=1760,y=250;c.save();c.globalAlpha=win;c.strokeStyle=E.hexA(S.c.accent,.6);c.lineWidth=1.2;c.strokeRect(x-340,y-50,340,180);c.restore();foilText(c,E,'504.5',x-25,y-45,{role:'quote',size:82,min:70,align:'right',maxW:300,kin:win});E.label(c,'以牙还牙 · 首届第一',x-25,y+82,{align:'right',size:30,maxW:360,color:S.c.text,kin:win});
  }
  c.restore();
 }
};
})();
