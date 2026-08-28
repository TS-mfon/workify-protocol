"use client";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect } from "react";

export function HeroMotion() {
  const x = useMotionValue(-100); const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 180, damping: 24 }); const sy = useSpring(y, { stiffness: 180, damping: 24 });
  useEffect(() => { const move=(event:MouseEvent)=>{x.set(event.clientX-12);y.set(event.clientY-12)}; window.addEventListener("mousemove",move); return()=>window.removeEventListener("mousemove",move)},[x,y]);
  return <motion.div aria-hidden style={{ x:sx,y:sy,position:"fixed",top:0,left:0,width:24,height:24,border:"1px solid rgba(103,232,249,.55)",borderRadius:"50%",pointerEvents:"none",zIndex:100,boxShadow:"0 0 30px rgba(34,211,238,.3)" }}/>;
}
