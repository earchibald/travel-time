// Loads the console.html <script> body into a stubbed browser so the speech
// pipeline can be driven deterministically.
import fs from "node:fs";
import vm from "node:vm";

export const CONSOLE_HTML=new URL("../companion/console.html",import.meta.url).pathname;

export function makeConsole({htmlPath=CONSOLE_HTML}={}){
  const html=fs.readFileSync(htmlPath,"utf8");
  const m=html.match(/<script>\n([\s\S]*?)<\/script>/);
  if(!m)throw new Error("no <script> block found");
  const src=m[1];

  const log=[];
  const els=new Map();
  const el=id=>{
    if(!els.has(id))els.set(id,{
      id,textContent:"",value:"",placeholder:"",className:"",
      style:{},dataset:{},
      classList:{
        _s:new Set(),
        add(...c){c.forEach(x=>this._s.add(x))},
        remove(...c){c.forEach(x=>this._s.delete(x))},
        toggle(c,on){on?this._s.add(c):this._s.delete(c)},
        contains(c){return this._s.has(c)}
      },
      handlers:{},
      addEventListener(t,f){(this.handlers[t]=this.handlers[t]||[]).push(f)},
      appendChild(){},scrollTop:0
    });
    return els.get(id);
  };

  const store=new Map();
  const localStorage={
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),
    removeItem:k=>store.delete(k)
  };

  // --- controllable speech synthesis -------------------------------------
  const synth={
    mode:"normal",           // "normal" | "silent" (Safari-backgrounded)
    spoken:[],
    _pending:[],
    speak(u){
      this.spoken.push(u.text);
      this._pending.push(u);
      if(this.mode==="normal")queueMicrotask(()=>{
        const i=this._pending.indexOf(u);
        if(i>=0){this._pending.splice(i,1);if(u.onend)u.onend()}
      });
      // "silent": the utterance is accepted but never fires onend/onerror.
    },
    cancel(){this._pending=[]},
    getVoices(){return[{name:"Samantha",lang:"en-US"}]},
    get speaking(){return this._pending.length>0},
    paused:false,
    resume(){},
    pause(){}
  };

  // --- controllable speech recognition -----------------------------------
  const recEvents=[];
  class FakeSR{
    constructor(){this.started=false;FakeSR.last=this}
    start(){if(this.started)throw new Error("already started");this.started=true;recEvents.push("start");if(this.onstart)this.onstart()}
    stop(){if(!this.started)return;this.started=false;recEvents.push("stop");if(this.onend)this.onend()}
    abort(){this.stop()}
  }

  const timers=[];
  const doc={
    handlers:{},
    getElementById:el,
    querySelectorAll:()=>[],
    createElement:()=>({className:"",textContent:""}),
    addEventListener(t,f){(this.handlers[t]=this.handlers[t]||[]).push(f)},
    documentElement:{dataset:{}},
    visibilityState:"visible"
  };

  const sandbox={
    console:{log:(...a)=>log.push(a.join(" ")),warn:(...a)=>log.push(a.join(" ")),error:(...a)=>log.push(a.join(" "))},
    document:doc,
    localStorage,
    speechSynthesis:synth,
    navigator:{geolocation:{watchPosition:()=>1,clearWatch(){}},wakeLock:{request:async()=>({release(){}})}},
    location:{origin:"http://localhost:8787",protocol:"http:"},
    fetch:async()=>({ok:true,json:async()=>({}),text:async()=>""}),
    SpeechSynthesisUtterance:class{constructor(t){this.text=t}},
    setTimeout:(f,ms)=>{const h=setTimeout(f,ms);timers.push(h);return h},
    clearTimeout,setInterval:(f,ms)=>{const h=setInterval(f,ms);timers.push(h);return h},clearInterval,
    queueMicrotask,Date,Math,JSON,Promise,AbortSignal,Error,parseFloat,parseInt,String,Number,Object,Array,RegExp
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  sandbox.window.SpeechRecognition=FakeSR;
  sandbox.window.webkitSpeechRecognition=FakeSR;

  vm.createContext(sandbox);
  vm.runInContext(src,sandbox,{filename:htmlPath});

  return {sandbox,synth,FakeSR,recEvents,el,log,localStorage,
    cleanup(){timers.forEach(h=>{clearTimeout(h);clearInterval(h)})}};
}
