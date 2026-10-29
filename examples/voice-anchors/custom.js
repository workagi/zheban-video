(function () {
  const C = window.CKV_CUSTOM = window.CKV_CUSTOM || {};
  const label = (c,E,text,x,y,w=300) => E.label(c,text,x,y,{maxW:w,valign:'middle',kin:1,anim:'settle',color:E.S.c.text});
  C.science = (c,r,p,E) => {
    const cx=r.x+r.w*.5, cy=r.y+r.h*.67, len=r.w*.34;
    const q=E.ease.out(E.eventProgress(p.sc,'change',p.t));
    E.panel(c,r.x+20,r.y+50,r.w-40,r.h-95,{alpha:.92});
    E.stroke(c,[[r.x+70,cy],[r.x+r.w-70,cy]],{width:2.2,color:E.S.c.text});
    c.save();c.setLineDash([8,12]);E.stroke(c,[[cx,cy],[cx,r.y+95]],{width:.7,color:E.S.c.dim});c.restore();
    // Equal ray vectors on opposite sides of the normal, both above the mirror.
    E.stroke(c,[[cx-len,cy-len],[cx,cy]],{width:2.5,color:E.S.c.accent,k:1});
    if(q>0) E.stroke(c,[[cx,cy],[cx+len,cy-len]],{width:2.5,color:E.S.c.accent2,k:q});
    const arrow=(x,y,a,col)=>{c.save();c.translate(x,y);c.rotate(a);c.fillStyle=col;c.beginPath();c.moveTo(0,0);c.lineTo(-18,-8);c.lineTo(-18,8);c.closePath();c.fill();c.restore();};
    arrow(cx-len*.42,cy-len*.42,Math.PI/4,E.S.c.accent);
    if(q>.1) arrow(cx+len*q*.7,cy-len*q*.7,-Math.PI/4,E.S.c.accent2);
    c.save();c.strokeStyle=E.S.c.accent;c.lineWidth=3;c.beginPath();c.arc(cx,cy,90,-3*Math.PI/4,-Math.PI/2);c.stroke();
    if(q>0){c.globalAlpha=q;c.beginPath();c.arc(cx,cy,90,-Math.PI/2,-Math.PI/4);c.stroke();}c.restore();
    label(c,E,'入射',cx-len*.78-30,cy-len*.8-28,170);
    if(q>.9) label(c,E,'反射',cx+len*.8+28,cy-len*.8-28,170);
    label(c,E,'法线',cx,r.y+83,160);label(c,E,'镜面',cx,cy+62,160);
    if(q>.95) label(c,E,'角度从法线量起',cx,r.y+r.h-105,400);
    E.info('explain','mechanism',r);
  };
})();
