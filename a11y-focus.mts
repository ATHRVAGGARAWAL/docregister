/* THROWAWAY focus-indicator + focus-order measurement. Deleted before this task finishes. */
import { chromium } from "playwright";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { mintDoctorSession } = await import("./tests/e2e/fixtures/supabase-session.ts");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const THEME = process.env.THEME === "dark" ? "dark" : "light";
const VIEW = process.env.VIEW ?? "overview";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);

const READ = `(function () {
  function srgb(c){return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
  function lum(r){return 0.2126*srgb(r[0]/255)+0.7152*srgb(r[1]/255)+0.0722*srgb(r[2]/255);}
  function parse(s){var m=String(s).match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);if(p.length<3)return null;return [p[0],p[1],p[2],p.length>3?p[3]:1];}
  function over(f,b){var a=f[3];return [f[0]*a+b[0]*(1-a),f[1]*a+b[1]*(1-a),f[2]*a+b[2]*(1-a)];}
  function effBg(el){var n=el,L=[];while(n&&n.nodeType===1){var c=parse(getComputedStyle(n).backgroundColor);if(c&&c[3]>0){L.push(c);if(c[3]>=1)break;}n=n.parentElement;}var base=[255,255,255];for(var i=L.length-1;i>=0;i--)base=over(L[i],base);return base;}
  function ratio(a,b){var x=lum(a),y=lum(b);if(y>x){var t=x;x=y;y=t;}return (x+0.05)/(y+0.05);}
  var el=document.activeElement;
  if(!el||el===document.body) return {label:"(body)"};
  var s=getComputedStyle(el);
  var bg=effBg(el.parentElement||document.body);
  // The focus ring is drawn just outside the control, so it is judged against
  // what surrounds the control, not against the control's own fill.
  var res={
    label:(el.getAttribute("aria-label")||el.innerText||el.value||"").trim().slice(0,30)||"(unnamed)",
    tag:el.tagName.toLowerCase(),
    slot:el.getAttribute("data-slot")||"",
    cls:String(el.className).slice(0,55),
    outlineStyle:s.outlineStyle, outlineWidth:s.outlineWidth, outlineOffset:s.outlineOffset, outlineColor:s.outlineColor,
    boxShadow:s.boxShadow.slice(0,120),
    surroundBg:"rgb("+bg.map(Math.round).join(",")+")",
    indicator:null, indicatorContrast:null, kind:null
  };
  if(s.outlineStyle!=="none" && parseFloat(s.outlineWidth)>0){
    var oc=parse(s.outlineColor);
    if(oc){var e=over(oc,bg);res.indicator="rgb("+e.map(Math.round).join(",")+")";res.indicatorContrast=Math.round(ratio(e,bg)*100)/100;res.kind="outline "+s.outlineWidth;}
  }
  if(!res.indicator){
    // first non-transparent, non-inset colour in box-shadow == the ring
    var m=s.boxShadow.match(/rgba?\\([^)]+\\)/g)||[];
    for(var i=0;i<m.length;i++){var c=parse(m[i]);if(c&&c[3]>0.02){var e2=over(c,bg);res.indicator="rgb("+e2.map(Math.round).join(",")+")";res.indicatorContrast=Math.round(ratio(e2,bg)*100)/100;res.kind="ring (box-shadow)";break;}}
  }
  return res;
})()`;

const storage = await mintDoctorSession(BASE);
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: storage, viewport: { width: W, height: H }, timezoneId: "Asia/Kolkata", locale: "en-IN", colorScheme: THEME === "dark" ? "dark" : "light" });
await ctx.addInitScript(`try{localStorage.setItem("theme","${THEME}")}catch(e){}`);
const page = await ctx.newPage();
await page.goto(`${BASE}/?view=${VIEW}`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(700);
await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

const rows: unknown[] = [];
for (let i = 0; i < Number(process.env.STEPS ?? 26); i++) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(450);
  rows.push({ step: i + 1, ...(await page.evaluate(READ) as object) });
}
console.log(JSON.stringify(rows, null, 1));
await b.close();
