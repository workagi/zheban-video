/* Verified shot implementations. Model output is data; it never supplies these drawing functions.
   Metal, badge, tokens and arrows adapted from the user's accepted 60-second project. */
(function () {
  const E = window.CKV, SH = E.SHOTS = {};
  const clamp = x => Math.max(0, Math.min(1, x));
  const out = x => 1 - Math.pow(1 - clamp(x), 3);
  let metalTex;
  const mix = (a,b,k) => {
    const rgb=h=>h.replace('#','').match(/../g).map(x=>parseInt(x,16));
    const A=rgb(a),B=rgb(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*k).toString(16).padStart(2,'0')).join('');
  };
  function glow(c,x,y,rx,ry,col,a) { c.save();c.translate(x,y);c.scale(1,ry/rx);const g=c.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');c.globalAlpha=a;c.fillStyle=g;c.fillRect(-rx,-rx,rx*2,rx*2);c.restore(); }
  function text(c,s,x,y,o={}) { return E.label(c,s,x,y,Object.assign({kin:1,anim:'settle',color:E.S.c.text,maxW:1500},o)); }
  function title(c,s,x=960,y=180,o={}) { return text(c,s,x,y,Object.assign({role:'title',size:72,align:'center',color:E.S.c.accent2,maxW:1700},o)); }
  function backdrop(c,p) {
    if(E.state().SB.productionMode==='stable'){
      E.CINEMATIC.background(c,p.t+p.sc.t0,p.sc);
      if(p.v.name==='lag-copy'||p.v.name==='ranking')E.CINEMATIC.floor(c,p.t,.1);
    }else{c.fillStyle=E.S.c.bg1;c.fillRect(0,0,E.W,E.H);glow(c,960,480,1100,700,E.S.c.accent,.12);}
  }
  function metal(c,x,y,w,h) {
    const S=E.S,g=c.createLinearGradient(x,y,x+w,y+h*.12);
    [[0,mix(S.c.accent,S.c.bg1,.3)],[.12,S.c.accent2],[.25,S.c.accent],[.51,mix(S.c.accent,S.c.bg1,.14)],[.76,mix(S.c.accent2,'#ffffff',.22)],[1,mix(S.c.accent,S.c.bg1,.45)]].forEach(([p,col])=>g.addColorStop(p,col));return g;
  }
  // Adapted from the supplied reference anim.js medal(): projected face, layered edge,
  // engraved lettering and clipped moving reflection. Content remains parameter data.
  function badge(c,x,y,r,t,alpha,emblem) {
    if(alpha<=.004)return;
    const S=E.S,angle=Math.sin(t*.9+.25)*.85,cos=Math.cos(angle),sin=Math.sin(angle),rx=Math.max(3,r*Math.abs(cos));
    c.save();c.globalAlpha=alpha;
    glow(c,x,y,r*2.8,r*2.8,S.c.accent,.3*alpha);
    c.save();c.globalCompositeOperation='lighter';const rays=c.createRadialGradient(x,y,0,x,y,r*3.5);
    rays.addColorStop(0,E.hexA(S.c.accent2,.38));rays.addColorStop(.4,E.hexA(S.c.accent,.13));rays.addColorStop(1,E.hexA(S.c.accent,0));c.fillStyle=rays;c.globalAlpha=alpha*.8;c.beginPath();
    for(let i=0;i<44;i++){const a=i*Math.PI*2/44+t*.06,w=.035*(.6+.4*Math.sin(i*2.3));c.moveTo(x,y);c.lineTo(x+Math.cos(a-w)*r*3.5,y+Math.sin(a-w)*r*3.5);c.lineTo(x+Math.cos(a+w)*r*3.5,y+Math.sin(a+w)*r*3.5);c.closePath();}c.fill();c.restore();
    for(let i=14;i>=1;i--){c.beginPath();c.ellipse(x-sin*i*1.7,y,rx,r,0,0,Math.PI*2);c.fillStyle=mix(S.c.accent,S.c.bg1,i>12?.72:.62-i*.022);c.fill();}
    const face=c.createRadialGradient(x-r*.35*cos,y-r*.4,r*.08,x,y,r*1.15);
    [[0,mix(S.c.accent2,'#ffffff',.4)],[.35,S.c.accent2],[.7,S.c.accent],[1,mix(S.c.accent,S.c.bg1,.55)]].forEach(([p,col])=>face.addColorStop(p,col));
    c.beginPath();c.ellipse(x,y,rx,r,0,0,Math.PI*2);c.fillStyle=face;c.fill();
    for(const [q,width,col] of [[.84,5,mix(S.c.accent,S.c.bg1,.65)],[.88,2,E.hexA(S.c.accent2,.75)]]){c.strokeStyle=col;c.lineWidth=width;c.beginPath();c.ellipse(x-1,y-2,rx*q,r*q,0,0,Math.PI*2);c.stroke();}
    c.save();c.translate(x,y+4);c.scale(Math.abs(cos),1);
    text(c,emblem,-2,-3,{size:r*1.05,weight:900,maxW:r*1.5,maxLines:1,valign:'middle',alpha:alpha*.65,color:S.c.accent2,log:false});
    text(c,emblem,0,0,{size:r*1.05,weight:900,maxW:r*1.5,maxLines:1,valign:'middle',alpha,color:mix(S.c.accent,S.c.bg1,.74)});c.restore();
    c.save();c.beginPath();c.ellipse(x,y,rx,r,0,0,Math.PI*2);c.clip();c.globalCompositeOperation='lighter';c.globalAlpha=alpha;
    const sx=x+Math.sin(t*1.1)*r*1.4,shine=c.createLinearGradient(sx-90,y-r,sx+90,y+r);
    shine.addColorStop(0,E.hexA(S.c.accent2,0));shine.addColorStop(.5,E.hexA(S.c.accent2,.38));shine.addColorStop(1,E.hexA(S.c.accent2,0));c.fillStyle=shine;c.fillRect(x-r*2,y-r,r*4,r*2);c.restore();c.restore();
  }
  function token(c,x,y,state,k,r=42) {
    if(k<=0)return;const S=E.S,bad=state==='D',col=bad?S.c.bad:S.c.accent;
    c.save();c.globalAlpha=k;const g=c.createRadialGradient(x-r*.3,y-r*.4,0,x,y,r);g.addColorStop(0,bad?mix(col,S.c.accent2,.15):S.c.accent2);g.addColorStop(.7,col);g.addColorStop(1,mix(col,S.c.bg1,.58));c.shadowColor=E.hexA(col,.5);c.shadowBlur=14;c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.shadowBlur=0;c.strokeStyle=E.hexA(bad?S.c.bad:S.c.accent2,.9);c.lineWidth=2;c.stroke();c.restore();
    text(c,bad?'背':'合',x,y,{size:r,maxW:r*1.6,maxLines:1,valign:'middle',alpha:k,color:bad?S.c.accent2:mix(S.c.accent,S.c.bg1,.72)});
  }
  function arrow(c,x1,y1,x2,y2,k,col) {
    if(k<=0)return;const x=x1+(x2-x1)*k,y=y1+(y2-y1)*k;E.stroke(c,[[x1,y1],[x,y]],{width:.65,color:col,alpha:.7});
    if(k>.9){const a=Math.atan2(y2-y1,x2-x1);E.stroke(c,[[x2-12*Math.cos(a-.5),y2-12*Math.sin(a-.5)],[x2,y2],[x2-12*Math.cos(a+.5),y2-12*Math.sin(a+.5)]],{width:.7,color:col,alpha:.85});}E.glowDot(c,x,y,3,col,.8);
  }
  E.initShots = () => {
    metalTex=document.createElement('canvas');metalTex.width=512;metalTex.height=512;const c=metalTex.getContext('2d',{willReadFrequently:true}),rng=E.rng('brushed-brass');
    for(let i=0;i<1800;i++){c.strokeStyle=i%3?'rgba(255,255,255,.08)':'rgba(0,0,0,.12)';c.lineWidth=.35+rng()*.45;const y=rng()*512;c.beginPath();c.moveTo(rng()*512,y);c.lineTo(512,y+(rng()-.5)*3);c.stroke();}
  };
  function info(sc,kind) { for(const plan of sc.explanations || [])if(!plan.exemptReason)E.info(plan.id,kind,{x:150,y:220,w:1620,h:610}); }
  SH['medal-reveal']=(c,r,p)=>{
    const v=p.v.params,t=p.t,d=p.v.computed,k=d.at===0?1:out((t-d.at)/.7);
    backdrop(c,p);
    if(v.variant==='split'){
      v.headline.forEach((s,i)=>title(c,s,145,305+i*120,{align:'left',maxW:1040,size:i?92:80}));
      if(v.subline)text(c,v.subline,150,620,{align:'left',maxW:1000,size:38});badge(c,1430,445,158,t,k,v.emblem);
    }else{
      badge(c,960,375,120,t,k,v.emblem);v.headline.forEach((s,i)=>title(c,s,960,575+i*105,{maxW:1650,size:86}));
      if(v.subline)text(c,v.subline,960,800,{maxW:1500,size:36});
    }
    if(k>.1)info(p.sc,'reveal');E._shotLog.push({scene:p.sc.id,shot:'medal-reveal',variant:v.variant,emblemVisible:k>.1});
  };
  SH['lag-copy']=(c,r,p)=>{
    const v=p.v.params,d=p.v.computed,t=p.t,S=E.S,n=v.opponent.length,start=v.variant==='wide'?520:620,last=v.variant==='wide'?1730:1660,dx=(last-start)/(n-1),top=390,bottom=650;
    backdrop(c,p);title(c,v.headline,960,175,{size:72});
    text(c,v.opponentLabel,155,top,{align:'left',valign:'middle',size:42,maxW:300});text(c,v.ownLabel,155,bottom,{align:'left',valign:'middle',size:42,maxW:300,color:S.c.accent2});
    let visible=0;
    for(let i=0;i<n;i++){
      const at=d.at+i*v.stepSeconds,ak=out((t-at)/.4),bk=out((t-at-.25)/.4);
      token(c,start+i*dx,top,v.opponent[i],ak);token(c,start+i*dx,bottom,d.own[i],bk);if(bk>.9)visible++;
      if(i<n-1)arrow(c,start+i*dx+8,top+54,start+(i+1)*dx-8,bottom-54,out((t-at-.35)/.4),v.opponent[i]==='D'?S.c.bad:S.c.accent2);
    }
    text(c,'合：合作     背：背叛     箭头：晚一轮',960,800,{size:30,maxW:1600,color:S.c.dim});
    if(visible)info(p.sc,'flow');E._shotLog.push({scene:p.sc.id,shot:'lag-copy',opponent:v.opponent,own:d.own,links:d.links,visibleOwn:visible});
  };
  SH.ranking=(c,r,p)=>{
    const v=p.v.params,d=p.v.computed,S=E.S,t=p.t,k=out((t-d.at)/1.6),rows=d.items;
    backdrop(c,p);title(c,v.headline,960,175,{size:72});text(c,'同一尺度 · '+v.unit,145,300,{align:'left',size:32,maxW:1200});
    const winnerText=d.winners.length===1?'最高：'+rows[0].label:'并列最高：'+d.winners.length+'项';
    text(c,winnerText,1770,300,{align:'right',size:34,maxW:600,color:S.c.accent2,alpha:out((t-d.complete)/.3)});
    if(v.variant==='columns'){
      const base=750,left=205,gap=1520/rows.length,bw=Math.min(120,gap*.62);
      E.stroke(c,[[145,base],[1780,base]],{width:.5,alpha:.6});
      rows.forEach((row,i)=>{
        const x=left+i*gap,h=330*row.value/d.maximum*k,winner=d.winners.includes(row.id),dep=17,dy=-11;
        c.save();c.globalAlpha=winner?1:.7;c.fillStyle=mix(S.c.accent,S.c.bg1,winner?.18:.55);c.beginPath();c.moveTo(x+bw,base);c.lineTo(x+bw+dep,base+dy);c.lineTo(x+bw+dep,base-h+dy);c.lineTo(x+bw,base-h);c.closePath();c.fill();
        c.fillStyle=metal(c,x,base-h,bw,h);c.fillRect(x,base-h,bw,h);c.fillStyle=winner?S.c.accent2:mix(S.c.accent2,S.c.bg1,.4);c.beginPath();c.moveTo(x,base-h);c.lineTo(x+dep,base-h+dy);c.lineTo(x+bw+dep,base-h+dy);c.lineTo(x+bw,base-h);c.closePath();c.fill();
        if(h>1){c.save();c.beginPath();c.rect(x,base-h,bw,h);c.clip();c.globalAlpha=.22;c.fillStyle=c.createPattern(metalTex,'repeat');c.fillRect(x,base-h,bw,h);c.restore();}c.restore();
        if(k>.05)text(c,Number((row.value*k).toFixed(1)).toString(),x+bw/2,base-h-55,{size:rows.length>8?30:38,maxW:gap-10,maxLines:1,alpha:k,color:winner?S.c.accent2:S.c.text});
        text(c,row.label,x+bw/2,base+18,{size:rows.length>8?30:36,maxW:gap-10,maxLines:1,color:winner?S.c.accent2:S.c.text});
      });
    }else{
      const step=Math.min(90,420/rows.length);
      rows.forEach((row,i)=>{const y=390+i*step,w=1000*row.value/d.maximum*k;
        text(c,row.label,155,y+24,{align:'left',valign:'middle',size:38,maxW:280});c.save();c.fillStyle=metal(c,480,y,w,48);c.fillRect(480,y,w,48);c.restore();
        text(c,Number((row.value*k).toFixed(1)).toString(),1740,y+24,{align:'right',valign:'middle',size:42,maxW:200,alpha:k});
      });
    }
    if(v.note)text(c,v.note,960,835,{size:30,maxW:1600,color:S.c.dim});
    if(k>.05)info(p.sc,'chart');E._shotLog.push({scene:p.sc.id,shot:'ranking',order:rows.map(x=>x.id),values:rows.map(x=>x.value),winners:d.winners,baseline:0,progress:k});
  };
  window.CKV_COMPONENTS.shot=(c,r,p)=>{
    const draw=SH[p.v.name];if(!draw)throw new Error('Registered shot implementation missing: '+p.v.name);
    if(!p.v.computed || p.v.computed.registryVersion!==1)throw new Error('Shot data must be resolved by project.py');
    draw(c,r,p);
  };
})();
