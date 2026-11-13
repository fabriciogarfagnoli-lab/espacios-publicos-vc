// Espacios Públicos · Villa Constitución — aplicación (Leaflet + Supabase)
const CFG = window.VC_CONFIG || {};
const DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

/* ---------- constantes ---------- */
const RUBROS = [
  {k:"juegos", t:"Juegos infantiles", esencial:true, ic:'<path d="M4 20V8l8-5 8 5v12"/><path d="M8 20v-6h8v6"/><path d="M12 3v5"/>'},
  {k:"mobiliario", t:"Mobiliario (bancos, mesas, cestos)", esencial:true, ic:'<path d="M3 11h18"/><path d="M5 11V7h14v4"/><path d="M6 11v7M18 11v7"/>'},
  {k:"iluminacion", t:"Iluminación", esencial:true, ic:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'},
  {k:"veredas", t:"Veredas y senderos", esencial:true, ic:'<path d="M4 21 9 3M20 21 15 3M12 6v2M12 11v2M12 16v2"/>'},
  {k:"saludable", t:"Estación saludable", esencial:false, ic:'<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>'},
  {k:"deportivo", t:"Equipamiento deportivo (playón / cancha)", esencial:false, ic:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/>'},
];
const RK = Object.fromEntries(RUBROS.map(r=>[r.k,r]));
const PESO = {bueno:100, regular:55, malo:15};
const PESO_FALTA = 25;
const TIPOS_REG = {trabajo:"Trabajo realizado", relevamiento:"Relevamiento", reclamo:"Reclamo / denuncia", nota:"Observación"};
const ZONAS_ORDEN = ["Zona 1","Zona 2","Zona 3","Barrios Populares","Costa y miradores","Otros espacios"];
const SEMCOL = {g:"#2e9a5a", y:"#d99a1e", r:"#d24a3f", na:"#a3a9b1"};
const SEMLAB = {g:"Buen estado", y:"Regular", r:"Requiere intervención", na:"Sin relevar"};

/* ---------- estado ---------- */
const S = { espacios:new Map(), registros:[], sel:null, view:"mapa", canWrite:false, user:null,
  placing:false, filt:{q:"",zona:"",tipo:"",sem:new Set()}, base:"plano" };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => new Date().toISOString().slice(0,10);
const fmtFecha = d => { if(!d) return ""; const [y,m,dd] = String(d).slice(0,10).split("-"); return dd&&m ? `${dd}/${m}/${y}` : d; };
const hasPos = e => typeof e.lat==="number" && typeof e.lng==="number";
function toast(t){ const el=$("#toast"); el.textContent=t; el.classList.add("on"); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove("on"),2800); }

/* ---------- capa de datos ---------- */
let sb = null;
const DB = {
  async init(){
    if(DEMO) return;
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const pin=pinGuardado();
    sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
      global:{headers: pin?{"x-pin":pin}:{}} });
    await setSession(pin);
    sb.channel("cambios")
      .on("postgres_changes",{event:"*",schema:"public",table:"espacios"},()=>reload())
      .on("postgres_changes",{event:"*",schema:"public",table:"registros"},()=>reload())
      .subscribe();
  },
  async loadAll(){
    if(DEMO){ const r=await fetch("espacios.json"); return {espacios:await r.json(), registros:[]}; }
    const [e,r] = await Promise.all([ sb.from("espacios").select("*"), sb.from("registros").select("*").order("fecha",{ascending:false}) ]);
    if(e.error) throw e.error; if(r.error) throw r.error;
    return {espacios:e.data, registros:r.data};
  },
  async update(id, patch){ const {error}=await sb.from("espacios").update({...patch, actualizado:new Date().toISOString()}).eq("id",id); if(error) throw error; },
  async insert(row){ const {error}=await sb.from("espacios").insert(row); if(error) throw error; },
  async remove(id){ const {error}=await sb.from("espacios").delete().eq("id",id); if(error) throw error; },
  async addRegistro(row){ const {error}=await sb.from("registros").insert(row); if(error) throw error; },
  async uploadFoto(file, espacioId){
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
    const path=`${espacioId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const {error}=await sb.storage.from("fotos").upload(path, file, {contentType:file.type||undefined});
    if(error) throw error; return path;
  },
  fotoUrl(path){ return sb ? sb.storage.from("fotos").getPublicUrl(path).data.publicUrl : ""; },
};
const ls={ get:k=>{ try{ return localStorage.getItem(k)||""; }catch(_){ return ""; } },
  set:(k,v)=>{ try{ v?localStorage.setItem(k,v):localStorage.removeItem(k); }catch(_){} } };
const pinGuardado=()=>ls.get("vc_pin");
const nombreEditor=()=>ls.get("vc_nombre");
const autorActual=()=>nombreEditor()||null;
async function setSession(pin){
  S.user=null; S.canWrite=false;
  if(pin){
    const {data,error}=await sb.rpc("es_editor");
    if(!error && data){ S.canWrite=true; S.user={nombre:nombreEditor()||"Editor"}; }
    else if(!error){ ls.set("vc_pin",""); toast("El PIN cambió: volvé a ingresar."); }
    else toast("No se pudo verificar el PIN: "+errMsg(error));
  }
  renderAuth(); renderAll();
}
function renderAuth(){
  const el=$("#auth"); if(DEMO){ el.innerHTML=""; return; }
  if(!S.user){ el.innerHTML=`<button class="btn sm" id="btnLogin">Ingresar</button>`; return; }
  el.innerHTML=`<span>${esc(S.user.nombre)}</span><button class="btn sm ghost" id="btnLogout">Salir</button>`;
}
$("#auth").addEventListener("click",ev=>{
  if(ev.target.id==="btnLogout"){ ls.set("vc_pin",""); location.reload(); }
  if(ev.target.id==="btnLogin") abrirLogin();
});
function abrirLogin(){
  openModal(`<div class="dh"><h3>Ingresar para editar</h3><button class="x" data-close>✕</button></div>
  <form class="db" id="lgForm" autocomplete="off">
    <div class="fld"><label>Tu nombre</label><input type="text" id="lgNombre" placeholder="Ej.: Fabricio" value="${esc(nombreEditor())}" autocomplete="name"></div>
    <div class="fld"><label>PIN</label><input type="password" id="lgPin" autocomplete="off" style="letter-spacing:.3em"></div>
    <div style="font-size:12.5px;color:var(--ink2)">Tu nombre queda registrado como autor de lo que cargues. El PIN se recuerda en este dispositivo hasta que toques “Salir”.</div>
    <button type="submit" hidden></button>
  </form>
  <div class="df"><span class="err" id="ferr"></span><button class="btn" data-close>Cancelar</button><button class="btn pri" id="lgGo">Ingresar</button></div>`);
  setTimeout(()=>$(nombreEditor()?"#lgPin":"#lgNombre")?.focus(),50);
  const go=async ev=>{ ev?.preventDefault?.();
    const nombre=$("#lgNombre").value.trim(), pin=$("#lgPin").value.trim();
    if(!nombre){ $("#ferr").textContent="Escribí tu nombre."; return; }
    if(!pin){ $("#ferr").textContent="Escribí el PIN."; return; }
    $("#lgGo").disabled=true; $("#ferr").textContent="Verificando…";
    const {data,error}=await sb.rpc("verificar_pin",{p:pin});
    if(error){ $("#ferr").textContent=errMsg(error); $("#lgGo").disabled=false; return; }
    if(!data){ $("#ferr").textContent="PIN incorrecto."; $("#lgGo").disabled=false; $("#lgPin").select(); return; }
    ls.set("vc_nombre",nombre); ls.set("vc_pin",pin); location.reload();
  };
  $("#lgGo").onclick=go; $("#lgForm").onsubmit=go;
}

/* ---------- cálculo ---------- */
function rubroEstado(v){ if(!v || v.tiene==null) return "na"; if(v.tiene===false) return "no"; return v.estado || "na"; }
function puntaje(e){
  let s=0,n=0;
  for(const r of RUBROS){ const v=e.rubros?.[r.k]; if(!v) continue;
    if(v.tiene===true && PESO[v.estado]!=null){ s+=PESO[v.estado]; n++; }
    else if(v.tiene===false && r.esencial){ s+=PESO_FALTA; n++; } }
  return n ? Math.round(s/n) : null;
}
function sem(p){ if(p==null) return "na"; if(p>=75) return "g"; if(p>=45) return "y"; return "r"; }
function avanceRecs(e){ const r=e.recs||[]; if(!r.length) return null; const d=r.filter(x=>x.hecho).length; return {d,t:r.length,p:Math.round(100*d/r.length)}; }
function tagFor(v,esencial){ const s=rubroEstado(v);
  if(s==="no") return esencial?['t-falta','No tiene']:['t-na','No tiene'];
  if(s==="na") return ['t-na', v&&v.tiene===true?'Sin evaluar':'Sin dato'];
  return ['t-'+s,{bueno:"Bueno",regular:"Regular",malo:"Malo"}[s]]; }
function cellFor(v,esencial){ const s=rubroEstado(v); if(s==="no") return esencial?"c-falta":"c-no"; if(s==="na") return "c-na"; return "c-"+s; }

/* ---------- filtros / orden ---------- */
function filtrados(){ const f=S.filt, q=f.q.trim().toLowerCase();
  return [...S.espacios.values()].filter(e=>{
    if(f.zona && e.zona!==f.zona) return false; if(f.tipo && e.tipo!==f.tipo) return false;
    if(f.sem.size && !f.sem.has(sem(puntaje(e)))) return false;
    if(q){ const h=[e.nombre,e.barrio,e.ubicacion,e.zona,e.tipo].join(" ").toLowerCase(); if(!h.includes(q)) return false; }
    return true; }); }
const zonaIdx = z => { const i=ZONAS_ORDEN.indexOf(z); return i<0?99:i; };
const ordenar = arr => arr.sort((a,b)=>zonaIdx(a.zona)-zonaIdx(b.zona) || String(a.nombre).localeCompare(String(b.nombre),"es"));

/* ---------- KPIs ---------- */
function renderKPIs(){
  const all=[...S.espacios.values()], rel=all.filter(e=>puntaje(e)!=null);
  const cnt={g:0,y:0,r:0,na:0}; all.forEach(e=>cnt[sem(puntaje(e))]++);
  const trab=S.registros.filter(r=>r.tipo==="trabajo").length;
  let rd=0,rt=0; all.forEach(e=>(e.recs||[]).forEach(x=>{rt++; if(x.hecho) rd++;}));
  const prom=rel.length?Math.round(rel.reduce((s,e)=>s+puntaje(e),0)/rel.length):null, tot=all.length||1;
  const ub=all.filter(hasPos).length;
  const k=(v,l,bar="")=>`<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div>${bar}</div>`;
  $("#kpis").innerHTML =
    k(all.length,`Espacios · ${ub} ubicados en el mapa`,`<div class="bar"><i style="width:${100*ub/tot}%;background:var(--accent)"></i></div>`)+
    k(`${rel.length}<small style="font-size:13px;color:var(--ink3)"> / ${all.length}</small>`,"Relevados con ficha",`<div class="bar"><i style="width:${100*rel.length/tot}%;background:var(--accent)"></i></div>`)+
    k(prom==null?"—":prom,"Puntaje promedio (relevados)",`<div class="bar"><i style="width:${prom||0}%;background:${SEMCOL[sem(prom)]}"></i></div>`)+
    k(`<span style="color:var(--ok)">${cnt.g}</span> · <span style="color:var(--mid)">${cnt.y}</span> · <span style="color:var(--bad)">${cnt.r}</span>`,"Semáforo: bueno · regular · intervenir",
      `<div class="bar"><i style="width:${100*cnt.g/tot}%;background:var(--ok)"></i><i style="width:${100*cnt.y/tot}%;background:var(--mid)"></i><i style="width:${100*cnt.r/tot}%;background:var(--bad)"></i></div>`)+
    k(trab,"Trabajos registrados")+
    k(rt?Math.round(100*rd/rt)+"%":"—",`Recomendaciones cumplidas (${rd}/${rt})`,`<div class="bar"><i style="width:${rt?100*rd/rt:0}%;background:var(--accent)"></i></div>`);
}

/* ---------- lista ---------- */
function renderFiltersOptions(){
  const vals=k=>[...new Set([...S.espacios.values()].map(e=>e[k]).filter(Boolean))];
  const fill=(sel,v,lab)=>{ const cur=sel.value; sel.innerHTML=`<option value="">${lab}</option>`+v.map(x=>`<option${x===cur?" selected":""}>${esc(x)}</option>`).join(""); };
  fill($("#fZona"),vals("zona").sort((a,b)=>zonaIdx(a)-zonaIdx(b)),"Todas las zonas"); fill($("#fTipo"),vals("tipo").sort(),"Todos los tipos");
  const c={g:0,y:0,r:0,na:0}; S.espacios.forEach(e=>c[sem(puntaje(e))]++);
  $("#fSem").innerHTML=["r","y","g","na"].map(s=>`<button class="chip${S.filt.sem.has(s)?" on":""}" data-s="${s}"><span class="sw" style="background:${SEMCOL[s]}"></span>${SEMLAB[s]} <span style="color:var(--ink3)">${c[s]}</span></button>`).join("");
}
function renderList(){
  const arr=ordenar(filtrados());
  if(!arr.length){ $("#list").innerHTML=`<div class="empty" style="padding:16px">${S.espacios.size?"Ningún espacio coincide con los filtros.":"Cargando…"}</div>`; return; }
  let html="", last=null;
  for(const e of arr){
    if(e.zona!==last){ last=e.zona; html+=`<div class="grp"><span>${esc(last||"Sin zona")}</span><span>${arr.filter(x=>x.zona===last).length}</span></div>`; }
    const p=puntaje(e), s=sem(p), av=avanceRecs(e);
    html+=`<div class="item${S.sel===e.id?" sel":""}" data-id="${esc(e.id)}"><span class="sem" style="background:${SEMCOL[s]}"></span>
      <div><div class="n">${esc(e.nombre)}</div><div class="s">${esc([e.tipo,e.barrio].filter(Boolean).join(" · "))}${hasPos(e)?"":` · <span style="color:var(--mid)">sin ubicar</span>`}</div></div>
      <div class="sc">${p==null?"—":p}${av?`<div class="mini"><i style="width:${av.p}%;background:var(--accent)"></i></div>`:""}</div></div>`;
  }
  $("#list").innerHTML=html;
}

/* ---------- mapa ---------- */
const map = L.map("map",{zoomControl:true, maxZoom:20, minZoom:11, zoomSnap:.5}).setView(CFG.CENTRO||[-33.2335,-60.3255], CFG.ZOOM||14);
map.createPane("plano"); map.getPane("plano").style.zIndex=350;
const planoRenderer = L.canvas({pane:"plano", padding:.3});
const BASES = {
  sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,maxNativeZoom:19,attribution:"Imágenes © Esri, Maxar, Earthstar Geographics"}),
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:20,maxNativeZoom:19,attribution:"© colaboradores de OpenStreetMap"}),
};
const PL = {}; let planoData=null; const lblLayer=L.layerGroup(); const pinLayer=L.layerGroup().addTo(map);
map.attributionControl.setPrefix(false);
const mPorPx = () => 156543.03392*Math.cos(map.getCenter().lat*Math.PI/180)/Math.pow(2,map.getZoom());
const STY = {
  plano:{ hatch:{fillColor:"#8cc49a",fillOpacity:.5}, vialC:{color:"#c9bea6",m:26,min:3.5}, vial:{color:"#fffaf0",m:19,min:2}, callesC:{color:"#d3c9b4",m:16,min:2.6}, calles:{color:"#ffffff",m:11,min:1.4},
          base:{color:"#b4ad9d",w:.6}, agua:{color:"#5f8ba3",w:1}, plazas:{color:"#2f7d4a",w:.7,o:.9} },
  sat:  { hatch:{fillColor:"#7fe39a",fillOpacity:.25}, vialC:null, vial:{color:"#fff7d6",w:2,o:.75}, callesC:null, calles:{color:"#ffffff",w:1,o:.45},
          base:{color:"#ffffff",w:.6,o:.5}, agua:{color:"#9fd6f2",w:1.2}, plazas:{color:"#8dffa8",w:.8,o:.9} },
  osm:  { hatch:{fillColor:"#2f7d4a",fillOpacity:.25}, vialC:null, vial:null, callesC:null, calles:null,
          base:{color:"#7a7262",w:.5,o:.6}, agua:{color:"#2a6fb0",w:.9}, plazas:{color:"#1d6b38",w:.8,o:.9} },
};
async function loadPlano(){
  try{ planoData = await (await fetch("plano.json")).json(); }catch(e){ toast("No se pudo cargar el plano municipal"); return; }
  const d=planoData, opt={renderer:planoRenderer, interactive:false};
  PL.hatch = L.polygon(d.hatch.map(r=>[r]),{...opt,stroke:false});
  PL.vialC = L.polyline(d.vial,{...opt,lineCap:"round",lineJoin:"round"});
  PL.callesC= L.polyline(d.calles,{...opt,lineCap:"butt"});
  PL.vial  = L.polyline(d.vial,{...opt,lineCap:"round",lineJoin:"round"});
  PL.calles= L.polyline(d.calles,{...opt,lineCap:"butt"});
  PL.base  = L.polyline(d.base,opt); PL.agua=L.polyline(d.agua,opt); PL.plazas=L.polyline(d.plazas,opt);
  d.labels.forEach(([la,ln,a,t])=>L.marker([la,ln],{interactive:false, icon:L.divIcon({className:"",iconSize:[0,0],
    html:`<div class="slbl" style="transform:translate(-50%,-50%) rotate(${a}deg)">${esc(t)}</div>`})}).addTo(lblLayer));
  map.attributionControl.addAttribution("Plano: Municipalidad de Villa Constitución (2025)");
  applyPlano();
}
const ORDER=["hatch","vialC","callesC","vial","calles","base","agua","plazas"];
function applyPlano(){
  if(!planoData) return;
  const on=$("#ovPlano").checked, st=STY[S.base], mpp=mPorPx();
  for(const k of ORDER){ const lyr=PL[k], s=st[k];
    if(!on || !s){ map.removeLayer(lyr); continue; }
    const w = s.m ? Math.max(s.min||1, s.m/mpp) : s.w;
    lyr.setStyle({color:s.color, weight:w, opacity:s.o??1, fillColor:s.fillColor, fillOpacity:s.fillOpacity});
    if(!map.hasLayer(lyr)) lyr.addTo(map); }
  ORDER.forEach(k=>{ if(map.hasLayer(PL[k])) PL[k].bringToFront(); });
  const showL = on && map.getZoom()>=16 && S.base!=="osm";
  if(showL && !map.hasLayer(lblLayer)) lblLayer.addTo(map); if(!showL && map.hasLayer(lblLayer)) map.removeLayer(lblLayer);
  $("#map").classList.toggle("sat", S.base==="sat");
}
map.on("zoomend", applyPlano);
$("#ovPlano").onchange=applyPlano;
$("#basesw").onclick=ev=>{ const b=ev.target.closest("button[data-b]"); if(!b) return; S.base=b.dataset.b;
  document.querySelectorAll("#basesw button").forEach(x=>x.classList.toggle("on",x===b));
  Object.entries(BASES).forEach(([k,l])=>{ if(k===S.base) l.addTo(map); else map.removeLayer(l); });
  applyPlano(); };

function renderPins(){
  pinLayer.clearLayers(); const vis=new Set(filtrados().map(e=>e.id));
  for(const e of S.espacios.values()){
    if(!hasPos(e)) continue; const s=sem(puntaje(e)), seld=S.sel===e.id;
    const m=L.marker([e.lat,e.lng],{draggable:S.placing&&S.canWrite, opacity:vis.has(e.id)?1:.25, zIndexOffset:seld?1000:0,
      icon:L.divIcon({className:"",iconSize:[16,16],iconAnchor:[8,8],html:`<div class="pinm${seld?" sel":""}" style="background:${SEMCOL[s]}"></div>`})});
    m.bindTooltip(`${esc(e.nombre)} — ${SEMLAB[s]}${puntaje(e)!=null?" ("+puntaje(e)+")":""}`,{direction:"top",offset:[0,-8],className:"ptip"});
    m.on("click",()=>select(e.id));
    m.on("dragend",ev=>{ const p=ev.target.getLatLng(); savePos(e.id,p.lat,p.lng); });
    m.addTo(pinLayer);
  }
  window.VC_onPins?.();
}
map.on("click",ev=>{ if(S.placing && S.sel && S.canWrite) savePos(S.sel, ev.latlng.lat, ev.latlng.lng); });
async function savePos(id,lat,lng){
  const e=S.espacios.get(id); if(!e) return; e.lat=+lat.toFixed(7); e.lng=+lng.toFixed(7); renderPins(); renderList(); renderKPIs();
  try{ await DB.update(id,{lat:e.lat,lng:e.lng}); toast("Ubicación guardada"); }catch(err){ toast(errMsg(err)); }
}
function centerOn(id){ const e=S.espacios.get(id); if(e && hasPos(e)) map.setView([e.lat,e.lng], Math.max(map.getZoom(),17)); }
function renderMapbar(){
  const sinUb=[...S.espacios.values()].filter(e=>!hasPos(e)).length, parts=[];
  if(DEMO) parts.push(`<div class="note warn"><b>Modo demostración</b> (solo lectura): completá <b>config.js</b> con los datos de Supabase para guardar cambios.</div>`);
  if(S.placing){ const e=S.espacios.get(S.sel);
    parts.push(`<div class="note warn"><b>Modo ubicar:</b> ${e?`hacé clic en el mapa donde está <b>${esc(e.nombre)}</b>, o arrastrá cualquier pin.`:"elegí un espacio de la lista y hacé clic en el mapa, o arrastrá un pin."}</div><button class="btn sm" id="mbDone">Listo</button>`); }
  else { if(sinUb) parts.push(`<div class="note"><b>${sinUb} espacios sin ubicar</b>${S.canWrite?": elegí uno en la lista, tocá “Ubicar pines” y hacé clic en el mapa.":"."}</div>`);
    if(S.canWrite) parts.push(`<button class="btn sm" id="mbPlace">📍 Ubicar pines</button>`); }
  $("#mapbar").innerHTML=parts.join("");
}
$("#mapbar").addEventListener("click",ev=>{
  if(ev.target.id==="mbPlace"){ S.placing=true; $("#map").classList.add("placing"); renderMapbar(); renderPins(); }
  if(ev.target.id==="mbDone"){ S.placing=false; $("#map").classList.remove("placing"); renderMapbar(); renderPins(); }
});

/* ---------- ficha ---------- */
function select(id){ S.sel=id; renderList(); renderPins(); renderFicha(); $("#ficha").classList.add("open"); renderMapbar();
  document.querySelector(`.item[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:"nearest"}); }
function closeFicha(){ S.sel=null; $("#ficha").classList.remove("open"); renderList(); renderPins(); renderMapbar(); }
const regsDe = id => S.registros.filter(r=>r.espacio_id===id).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||String(b.creado).localeCompare(String(a.creado)));
const safeUrl = u => /^https:\/\//i.test(String(u||"")) ? u : "#";
function renderFicha(){
  const e=S.espacios.get(S.sel); if(!e){ $("#ficha").classList.remove("open"); return; }
  const p=puntaje(e), s=sem(p), av=avanceRecs(e);
  $("#fhead").innerHTML=`<div class="top"><h2>${esc(e.nombre)}</h2><button class="x" id="fClose">✕</button></div>
    <div class="meta">${esc([e.tipo,e.barrio,e.zona].filter(Boolean).join(" · "))}${e.ubicacion?`<br>${esc(e.ubicacion)}`:""}</div>
    ${S.canWrite?`<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"><button class="btn pri sm" id="fReg">+ Registrar actualización</button><button class="btn sm" id="fEdit">Editar ficha</button><button class="btn sm" id="fPlace">📍 Ubicar</button></div>`:""}`;
  const rub=RUBROS.map(r=>{ const v=e.rubros?.[r.k]; const [tc,tl]=tagFor(v,r.esencial); const st=rubroEstado(v);
    const w=st==="bueno"?100:st==="regular"?55:st==="malo"?15:(st==="no"&&r.esencial)?25:0;
    const col=st==="bueno"?"var(--ok)":st==="regular"?"var(--mid)":"var(--bad)";
    return `<div class="rub"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${r.ic}</svg></div>
      <div><div class="t">${esc(r.t)}</div>${v?.nota?`<div class="nt">${esc(v.nota)}</div>`:""}${w?`<div class="rb"><i style="width:${w}%;background:${col}"></i></div>`:""}</div><span class="tag ${tc}">${tl}</span></div>`; }).join("");
  const recs=(e.recs||[]).map((x,i)=>`<label class="rec${x.hecho?" done":""}"><input type="checkbox" data-ri="${i}" ${x.hecho?"checked":""} ${S.canWrite?"":"disabled"}><div><div class="tx">${esc(x.texto)}</div>${x.hecho&&x.fecha?`<div class="when">Cumplida ${fmtFecha(x.fecha)}</div>`:""}</div></label>`).join("");
  const gm = hasPos(e) ? `https://www.google.com/maps/search/?api=1&query=${e.lat.toFixed(6)},${e.lng.toFixed(6)}`
    : "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent([e.nombre,e.ubicacion,"Villa Constitución, Santa Fe"].filter(Boolean).join(", "));
  const links=(e.drive||[]).map(d=>`<a href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener">📁 ${esc(d.label||"Carpeta Drive")}</a>`).join("")+`<a href="${esc(gm)}" target="_blank" rel="noopener">🗺 ${hasPos(e)?"Ver en Google Maps":"Buscar en Google Maps"}</a>`;
  const ubic = hasPos(e) ? `<div class="empty" style="font-family:var(--mono);font-size:11.5px">📍 ${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}</div>` : `<div class="empty">📍 Todavía sin ubicar en el mapa.</div>`;
  $("#fbody").innerHTML=`<div class="gauge"><div class="light"><i class="r ${s==="r"?"on":""}"></i><i class="y ${s==="y"?"on":""}"></i><i class="g ${s==="g"?"on":""}"></i></div>
    <div><div class="lab" style="color:${SEMCOL[s]}">${SEMLAB[s]}</div><div class="big">${p==null?"—":p}<small> / 100 estado general</small></div>
    <div class="pbar"><i style="width:${p||0}%;background:${SEMCOL[s]}"></i></div>
    ${av?`<div style="margin-top:9px;font-size:12px;color:var(--ink2);display:flex;justify-content:space-between"><span>Avance de recomendaciones</span><b style="font-family:var(--mono)">${av.d}/${av.t} · ${av.p}%</b></div><div class="pbar" style="height:6px"><i style="width:${av.p}%;background:var(--accent)"></i></div>`:""}</div></div>
    <div class="sec"><h3>Estado por rubro</h3></div>${rub}
    <div class="sec"><h3>Recomendaciones / pendientes</h3></div><div class="recs">${recs||`<div class="empty">Sin recomendaciones cargadas.</div>`}</div>
    <div class="sec"><h3>Fotos y referencias</h3></div><div class="links">${links}</div>${ubic}
    <div class="sec"><h3>Bitácora de trabajos y actualizaciones</h3></div>
    ${regsDe(e.id).length?`<div class="tl">${regsDe(e.id).map(evHTML).join("")}</div>`:`<div class="empty">Todavía no hay registros.</div>`}
    ${e.fuente?`<div class="src">Fuente del relevamiento: ${esc(e.fuente)}</div>`:""}`;
  window.VC_onFicha?.(e);
}
function cambiosTxt(c){ return c?Object.entries(c).map(([k,v])=>`${esc(RK[k]?.t||k)} → <b>${esc(v==="no"?"No tiene":v)}</b>`).join(" · "):""; }
function fotosHTML(r,size){ return (r.fotos||[]).map(p=>{ const u=DB.fotoUrl(p); return `<img src="${esc(u)}" data-full="${esc(u)}" alt="foto" loading="lazy" ${size?`style="width:${size}px;height:${size}px"`:""}>`; }).join(""); }
function evHTML(r){ const ch=cambiosTxt(r.cambios), ph=fotosHTML(r);
  return `<div class="ev ${esc(r.tipo)}"><div class="h"><b>${esc(TIPOS_REG[r.tipo]||r.tipo)}</b><span>${fmtFecha(r.fecha)}</span>${r.rubro&&RK[r.rubro]?`<span class="tag t-na">${esc(RK[r.rubro].t)}</span>`:""}${r.autor?`<span>· ${esc(String(r.autor).split("@")[0])}</span>`:""}</div>
  ${r.descripcion?`<div class="d">${esc(r.descripcion)}</div>`:""}${ch?`<div class="ch">${ch}</div>`:""}${r.rec_hecha?`<div class="ch">✓ Recomendación cumplida: ${esc(r.rec_hecha)}</div>`:""}${ph?`<div class="ph">${ph}</div>`:""}</div>`; }
$("#ficha").addEventListener("click",ev=>{ const t=ev.target;
  if(t.id==="fClose") closeFicha(); if(t.id==="fReg") abrirRegistro(S.sel); if(t.id==="fEdit") abrirEdicion(S.sel);
  if(t.id==="fPlace"){ S.placing=true; $("#map").classList.add("placing"); setView("mapa"); renderMapbar(); renderPins(); toast("Hacé clic en el mapa para ubicar el espacio"); }
  if(t.tagName==="IMG" && t.dataset.full){ $("#lbimg").src=t.dataset.full; $("#lightbox").classList.add("open"); } });
$("#ficha").addEventListener("change",async ev=>{ const t=ev.target; if(t.dataset.ri==null) return;
  const e=S.espacios.get(S.sel), recs=structuredClone(e.recs||[]), r=recs[+t.dataset.ri]; if(!r) return;
  r.hecho=t.checked; r.fecha=t.checked?today():null;
  try{ await DB.update(e.id,{recs}); e.recs=recs; renderAll(); }catch(err){ t.checked=!t.checked; toast(errMsg(err)); } });
$("#lightbox").onclick=()=>$("#lightbox").classList.remove("open");

/* ---------- modales ---------- */
function openModal(html){ $("#dlg").innerHTML=html; $("#modal").classList.add("open"); }
function closeModal(){ $("#modal").classList.remove("open"); $("#dlg").innerHTML=""; }
$("#modal").addEventListener("click",ev=>{ if(ev.target.id==="modal"||ev.target.dataset.close!=null) closeModal(); });
function segHTML(name,opts,val){ return `<div class="seg" data-seg="${name}">${opts.map(([v,l,c])=>`<button type="button" data-v="${v}" class="${c||""}${String(val)===String(v)?" on":""}">${l}</button>`).join("")}</div>`; }
document.addEventListener("click",ev=>{ const b=ev.target.closest(".seg button"); if(!b) return; const seg=b.parentElement;
  seg.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b)); seg.dispatchEvent(new Event("segchange",{bubbles:true})); });
const segVal=(root,name)=>root.querySelector(`.seg[data-seg="${name}"] button.on`)?.dataset.v ?? null;

function abrirRegistro(id){
  const e=S.espacios.get(id); if(!e) return;
  const pend=(e.recs||[]).map((r,i)=>[r,i]).filter(([r])=>!r.hecho);
  openModal(`<div class="dh"><h3>Registrar actualización · ${esc(e.nombre)}</h3><button class="x" data-close>✕</button></div>
  <form class="db" id="fr">
    <div class="g2"><div class="fld"><label>Tipo</label><select name="tipo">${Object.entries(TIPOS_REG).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="fld"><label>Fecha</label><input type="date" name="fecha" value="${today()}" required></div></div>
    <div class="fld"><label>Rubro</label><select name="rubro"><option value="">General / varios</option>${RUBROS.map(r=>`<option value="${r.k}">${esc(r.t)}</option>`).join("")}</select></div>
    <div class="fld"><label>Descripción</label><textarea name="descripcion" placeholder="Ej.: Se repararon 2 bancos de durmientes y se pintaron todos los juegos." required></textarea></div>
    <div class="fld" id="nuevoEstWrap" hidden><label>Nuevo estado del rubro (opcional)</label>${segHTML("nuevo",[["","Sin cambio"],["bueno","Bueno","b"],["regular","Regular","r"],["malo","Malo","m"],["no","No tiene"]],"")}</div>
    ${pend.length?`<div class="fld"><label>¿Cumple alguna recomendación pendiente?</label><select name="rec"><option value="">— Ninguna —</option>${pend.map(([r,i])=>`<option value="${i}">${esc(r.texto)}</option>`).join("")}</select></div>`:""}
    <div class="fld"><label>Fotos</label><input type="file" name="fotos" accept="image/*" multiple><div class="thumbs" id="thumbs" style="margin-top:6px"></div></div>
  </form><div class="df"><span class="err" id="ferr"></span><button class="btn" data-close>Cancelar</button><button class="btn pri" id="frSave">Guardar</button></div>`);
  const f=$("#fr");
  f.rubro.onchange=()=>{ $("#nuevoEstWrap").hidden=!f.rubro.value; };
  f.fotos.onchange=()=>{ $("#thumbs").innerHTML=[...f.fotos.files].map(fl=>`<div style="background-image:url('${URL.createObjectURL(fl)}')"></div>`).join(""); };
  $("#frSave").onclick=async()=>{
    if(!f.descripcion.value.trim()){ $("#ferr").textContent="Escribí una descripción."; return; }
    const btn=$("#frSave"); btn.disabled=true; $("#ferr").textContent="";
    try{
      const files=[...f.fotos.files], fotos=[];
      for(let i=0;i<files.length;i++){ btn.textContent=`Subiendo foto ${i+1}/${files.length}…`;
        if(files[i].size>15*1024*1024) throw new Error(`La foto ${files[i].name} supera 15 MB.`);
        fotos.push(await DB.uploadFoto(files[i], e.id)); }
      btn.textContent="Guardando…";
      const nuevo=segVal(f,"nuevo"), rubro=f.rubro.value||null;
      const reg={espacio_id:e.id, tipo:f.tipo.value, fecha:f.fecha.value||today(), rubro, descripcion:f.descripcion.value.trim(), fotos, autor:autorActual()};
      const upd={};
      if(rubro && nuevo){ reg.cambios={[rubro]:nuevo}; upd.rubros=structuredClone(e.rubros||{});
        upd.rubros[rubro]={...(upd.rubros[rubro]||{nota:""}), tiene:nuevo!=="no", estado:nuevo==="no"?null:nuevo}; }
      const ri=f.rec?.value;
      if(ri){ const recs=structuredClone(e.recs||[]); if(recs[+ri]){ recs[+ri].hecho=true; recs[+ri].fecha=reg.fecha; reg.rec_hecha=recs[+ri].texto; upd.recs=recs; } }
      await DB.addRegistro(reg); if(Object.keys(upd).length) await DB.update(e.id,upd);
      closeModal(); toast("Actualización registrada"); reload();
    }catch(err){ btn.disabled=false; btn.textContent="Guardar"; $("#ferr").textContent=errMsg(err); }
  };
}

function abrirEdicion(id){
  const isNew=!id; const e=isNew?{nombre:"",tipo:"Plaza",zona:"Zona 1",barrio:"",ubicacion:"",rubros:{},recs:[],drive:[]}:structuredClone(S.espacios.get(id));
  const zonas=[...new Set([...ZONAS_ORDEN,...[...S.espacios.values()].map(x=>x.zona).filter(Boolean)])];
  const rubEd=RUBROS.map(r=>{ const v=e.rubros?.[r.k]||{}; const tiene=v.tiene===true?"si":v.tiene===false?"no":"";
    return `<div class="rubed" data-r="${r.k}"><div class="rt">${esc(r.t)}</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${segHTML("tiene_"+r.k,[["","Sin dato"],["si","Tiene"],["no","No tiene"]],tiene)}
      <span data-estwrap ${tiene==="si"?"":"hidden"}>${segHTML("est_"+r.k,[["","Sin evaluar"],["bueno","Bueno","b"],["regular","Regular","r"],["malo","Malo","m"]],v.estado||"")}</span></div>
      <input type="text" data-nota placeholder="Detalle (cantidad, faltantes, observaciones)" value="${esc(v.nota||"")}" style="padding:7px 9px;border:1px solid var(--line2);border-radius:7px;background:#fff"></div>`; }).join("");
  const recRow=r=>`<div class="row"><input type="text" value="${esc(r.texto)}" data-hecho="${r.hecho?1:""}" data-fecha="${esc(r.fecha||"")}"><button type="button" class="btn sm ghost" data-delrec>✕</button></div>`;
  openModal(`<div class="dh"><h3>${isNew?"Nuevo espacio":"Editar ficha · "+esc(e.nombre)}</h3><button class="x" data-close>✕</button></div>
  <form class="db" id="fe">
    <div class="fld"><label>Nombre</label><input type="text" name="nombre" value="${esc(e.nombre)}" required></div>
    <div class="g3"><div class="fld"><label>Tipo</label><input type="text" name="tipo" list="tiposL" value="${esc(e.tipo||"")}"><datalist id="tiposL">${["Plaza","Plazoleta","Parque","Mirador","Cancha / playón","Playa","Escalinata","Predio"].map(t=>`<option>${t}</option>`).join("")}</datalist></div>
      <div class="fld"><label>Zona</label><select name="zona">${zonas.map(z=>`<option${z===e.zona?" selected":""}>${esc(z)}</option>`).join("")}</select></div>
      <div class="fld"><label>Barrio</label><input type="text" name="barrio" value="${esc(e.barrio||"")}"></div></div>
    <div class="fld"><label>Ubicación (calles)</label><input type="text" name="ubicacion" value="${esc(e.ubicacion||"")}"></div>
    <div class="fld"><label>Link a carpeta de fotos (Drive)</label><input type="text" name="drive" value="${esc(e.drive?.[0]?.url||"")}" placeholder="https://drive.google.com/…"></div>
    <div class="sec" style="margin:4px 0 0"><h3>Estado por rubro</h3></div>${rubEd}
    <div class="sec" style="margin:4px 0 0"><h3>Recomendaciones</h3><button type="button" class="btn sm" id="addRec">+ Agregar</button></div>
    <div class="recedit" id="recEd">${(e.recs||[]).map(recRow).join("")}</div>
  </form><div class="df"><span class="err" id="ferr"></span>${!isNew?`<button class="btn ghost" id="feDel" style="color:var(--bad);margin-right:auto">Eliminar</button>`:""}<button class="btn" data-close>Cancelar</button><button class="btn pri" id="feSave">Guardar</button></div>`);
  const f=$("#fe");
  window.VC_onEdit?.(e, isNew);
  f.addEventListener("segchange",ev=>{ const rb=ev.target.closest(".rubed"); if(rb) rb.querySelector("[data-estwrap]").hidden=segVal(rb,"tiene_"+rb.dataset.r)!=="si"; });
  $("#addRec").onclick=()=>{ $("#recEd").insertAdjacentHTML("beforeend",recRow({texto:""})); $("#recEd").lastElementChild.querySelector("input").focus(); };
  $("#recEd").onclick=ev=>{ if(ev.target.dataset.delrec!=null) ev.target.closest(".row").remove(); };
  if($("#feDel")) $("#feDel").onclick=async()=>{ const b=$("#feDel"); if(b.dataset.c!=="1"){ b.dataset.c="1"; b.textContent="¿Confirmar eliminación? (borra también su bitácora)"; return; }
    try{ await DB.remove(id); closeModal(); closeFicha(); toast("Espacio eliminado"); reload(); }catch(err){ $("#ferr").textContent=errMsg(err); } };
  $("#feSave").onclick=async()=>{
    const nombre=f.nombre.value.trim(); if(!nombre){ $("#ferr").textContent="Falta el nombre."; return; }
    const rubros={}; f.querySelectorAll(".rubed").forEach(rb=>{ const k=rb.dataset.r, t=segVal(rb,"tiene_"+k), est=segVal(rb,"est_"+k);
      rubros[k]={tiene:t==="si"?true:t==="no"?false:null, estado:t==="si"&&est?est:null, nota:rb.querySelector("[data-nota]").value.trim()}; });
    const recs=[...f.querySelectorAll("#recEd input")].map(i=>({texto:i.value.trim(),hecho:!!i.dataset.hecho,fecha:i.dataset.fecha||null})).filter(r=>r.texto);
    const dUrl=f.drive.value.trim();
    const drive=dUrl?[{label:(e.drive?.[0]?.url===dUrl?e.drive[0].label:"Fotos en Drive")||"Fotos en Drive",url:dUrl},...(e.drive||[]).slice(1)]:(e.drive||[]).slice(1);
    const data={nombre,tipo:f.tipo.value.trim(),zona:f.zona.value,barrio:f.barrio.value.trim(),ubicacion:f.ubicacion.value.trim(),rubros,recs,drive};
    $("#feSave").disabled=true;
    try{
      if(isNew){ const nid=nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)+"-"+Math.random().toString(36).slice(2,6);
        await DB.insert({id:nid,...data}); closeModal(); toast("Espacio creado"); await reload(); select(nid); }
      else { await DB.update(id,data); closeModal(); toast("Ficha actualizada"); reload(); }
    }catch(err){ $("#feSave").disabled=false; $("#ferr").textContent=errMsg(err); }
  };
}
$("#btnNuevo").onclick=()=>abrirEdicion(null);
function errMsg(err){ const m=err?.message||String(err||"");
  if(/row-level security|permission|42501/i.test(m)) return "Tu usuario no está habilitado para editar.";
  return m?("No se pudo guardar: "+m):"No se pudo guardar."; }

/* ---------- matriz ---------- */
let mxSort={k:"zona",dir:1};
function renderMatriz(){
  const arr=filtrados(), k=mxSort.k, d=mxSort.dir;
  const val=e=>k==="puntaje"?(puntaje(e)??-1):k==="recs"?(avanceRecs(e)?.p??-1):k==="nombre"?e.nombre:k==="ult"?(regsDe(e.id)[0]?.fecha||""):RK[k]?({bueno:3,regular:2,malo:1,no:0,na:-1}[rubroEstado(e.rubros?.[k])]):zonaIdx(e.zona)*1000;
  arr.sort((a,b)=>{ const va=val(a),vb=val(b); return (va<vb?-1:va>vb?1:String(a.nombre).localeCompare(String(b.nombre),"es"))*d; });
  const th=(key,l)=>`<th data-k="${key}">${l}${mxSort.k===key?(d>0?" ↑":" ↓"):""}</th>`;
  const rows=arr.map(e=>{ const p=puntaje(e),s=sem(p),av=avanceRecs(e),ult=regsDe(e.id)[0];
    return `<tr data-id="${esc(e.id)}" style="cursor:pointer"><td><b>${esc(e.nombre)}</b><div style="font-size:11.5px;color:var(--ink3)">${esc([e.tipo,e.barrio].filter(Boolean).join(" · "))}</div></td>
    <td style="font-size:12px;color:var(--ink2)">${esc(e.zona||"")}</td>
    <td><div style="display:flex;align-items:center;gap:8px"><span class="cell" style="width:12px;height:12px;border-radius:50%;background:${SEMCOL[s]}"></span><b style="font-family:var(--mono);width:26px">${p??"—"}</b><div class="pbar" style="width:70px;height:6px;margin:0"><i style="width:${p||0}%;background:${SEMCOL[s]}"></i></div></div></td>
    ${RUBROS.map(r=>`<td class="c"><span class="cell ${cellFor(e.rubros?.[r.k],r.esencial)}" title="${esc(r.t)}: ${esc(tagFor(e.rubros?.[r.k],r.esencial)[1])}"></span></td>`).join("")}
    <td>${av?`<div style="display:flex;align-items:center;gap:6px"><div class="pbar" style="width:60px;height:6px;margin:0"><i style="width:${av.p}%;background:var(--accent)"></i></div><span style="font-family:var(--mono);font-size:12px">${av.d}/${av.t}</span></div>`:`<span style="color:var(--ink3)">—</span>`}</td>
    <td style="font-size:12px;color:var(--ink2);white-space:nowrap">${ult?fmtFecha(ult.fecha):"—"}</td></tr>`; }).join("");
  $("#v-matriz").innerHTML=`<div class="hwrap"><div><h2>Matriz de estado</h2><p>${arr.length} espacios · clic en una fila para abrir la ficha · clic en un encabezado para ordenar</p></div><button class="btn sm" id="xlsx">Descargar Excel</button></div>
  <div class="mxleg"><span><i class="cell c-bueno"></i>Bueno</span><span><i class="cell c-regular"></i>Regular</span><span><i class="cell c-malo"></i>Malo</span><span><i class="cell c-falta"></i>No tiene (déficit)</span><span><i class="cell c-no"></i>No tiene (opcional)</span><span><i class="cell c-na"></i>Sin dato</span></div>
  <table class="mx"><thead><tr>${th("nombre","Espacio")}${th("zona","Zona")}${th("puntaje","Estado general")}${th("juegos","Juegos")}${th("mobiliario","Mobiliario")}${th("iluminacion","Ilum.")}${th("veredas","Veredas")}${th("saludable","Est. salud.")}${th("deportivo","Deportivo")}${th("recs","Recomend.")}${th("ult","Últ. registro")}</tr></thead><tbody>${rows}</tbody></table>`;
}
function descargarCSV(){
  const head=["id","nombre","tipo","zona","barrio","ubicacion","lat","lng","puntaje","semaforo",...RUBROS.map(r=>r.k),"recomendaciones_cumplidas","recomendaciones_total"];
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lines=[head.join(",")].concat(ordenar([...S.espacios.values()]).map(e=>{ const av=avanceRecs(e);
    return [e.id,e.nombre,e.tipo,e.zona,e.barrio,e.ubicacion,e.lat??"",e.lng??"",puntaje(e)??"",SEMLAB[sem(puntaje(e))],...RUBROS.map(r=>tagFor(e.rubros?.[r.k],r.esencial)[1]),av?.d??0,av?.t??0].map(q).join(","); }));
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["﻿"+lines.join("\n")],{type:"text/csv"})); a.download="espacios_publicos_vc.csv"; a.click();
}
async function descargarExcel(){
  try{
    toast("Generando Excel…");
    const X=await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
    const esp=ordenar([...S.espacios.values()]).map(e=>{ const av=avanceRecs(e), p=puntaje(e), u=regsDe(e.id)[0];
      const o={ID:e.id,Espacio:e.nombre,Tipo:e.tipo||"",Zona:e.zona||"",Barrio:e.barrio||"",Ubicación:e.ubicacion||"",Puntaje:p??"",Semáforo:SEMLAB[sem(p)]};
      RUBROS.forEach(r=>{ o[r.t]=tagFor(e.rubros?.[r.k],r.esencial)[1]; });
      Object.assign(o,{"Recomend. cumplidas":av?.d??0,"Recomend. total":av?.t??0,"Último registro":u?.fecha||"",Lat:e.lat??"",Lng:e.lng??""});
      return o; });
    const regs=[...S.registros].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).map(r=>{ const e=S.espacios.get(r.espacio_id);
      return {Fecha:r.fecha||"",Espacio:e?.nombre||r.espacio_id,Zona:e?.zona||"",Tipo:TIPOS_REG[r.tipo]||r.tipo||"",Rubro:RK[r.rubro]?.t||r.rubro||"",
        Descripción:r.descripcion||"",Cambios:r.cambios?Object.entries(r.cambios).map(([k,v])=>`${RK[k]?.t||k} → ${v==="no"?"No tiene":v}`).join(" · "):"","Recomendación cumplida":r.rec_hecha||"",
        Fotos:(r.fotos||[]).map(f=>DB.fotoUrl(f)).join(" "),Autor:r.autor||"",Cargado:r.creado||""}; });
    const wb=X.utils.book_new();
    const add=(rows,name)=>{ const ws=X.utils.json_to_sheet(rows.length?rows:[{"(sin datos)":""}]);
      const keys=Object.keys(rows[0]||{}); ws["!cols"]=keys.map(k=>({wch:Math.min(60,Math.max(k.length,...rows.map(r=>String(r[k]??"").length))+2)}));
      if(rows.length) ws["!autofilter"]={ref:ws["!ref"]}; X.utils.book_append_sheet(wb,ws,name); };
    add(esp,"Espacios"); add(regs,"Registros");
    X.writeFile(wb,`espacios_publicos_vc_${new Date().toISOString().slice(0,10)}.xlsx`);
  }catch(err){ toast("No se pudo generar el Excel: "+errMsg(err)); }
}
$("#v-matriz").addEventListener("click",ev=>{
  if(ev.target.id==="xlsx"){ descargarExcel(); return; }
  const h=ev.target.closest("th[data-k]"); if(h){ const k=h.dataset.k; mxSort=mxSort.k===k?{k,dir:-mxSort.dir}:{k,dir:1}; renderMatriz(); return; }
  const tr=ev.target.closest("tr[data-id]"); if(tr) select(tr.dataset.id); });

/* ---------- bitácora ---------- */
function renderBitacora(){
  const vis=new Set(filtrados().map(e=>e.id));
  const regs=S.registros.filter(r=>vis.has(r.espacio_id)).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||String(b.creado).localeCompare(String(a.creado)));
  $("#v-bitacora").innerHTML=`<div class="hwrap"><div><h2>Bitácora general</h2><p>${regs.length} registros de trabajos, relevamientos y reclamos (según filtros activos)</p></div><button class="btn sm" id="xlsx2">Descargar Excel</button></div>
  <div class="feed">${regs.length?regs.map(r=>{ const e=S.espacios.get(r.espacio_id), ch=cambiosTxt(r.cambios), ph=fotosHTML(r,90);
    return `<div class="fcard"><div class="h"><a data-id="${esc(r.espacio_id)}">${esc(e?.nombre||"(espacio eliminado)")}</a><span class="tag ${r.tipo==="trabajo"?"t-bueno":r.tipo==="reclamo"?"t-malo":"t-na"}">${esc(TIPOS_REG[r.tipo]||r.tipo)}</span><span>${fmtFecha(r.fecha)}</span>${r.rubro&&RK[r.rubro]?`<span>· ${esc(RK[r.rubro].t)}</span>`:""}${r.autor?`<span>· ${esc(String(r.autor).split("@")[0])}</span>`:""}</div>
    <div class="d">${esc(r.descripcion||"")}</div>${ch?`<div class="h" style="margin-top:4px">${ch}</div>`:""}${r.rec_hecha?`<div class="h" style="margin-top:4px">✓ Recomendación cumplida: ${esc(r.rec_hecha)}</div>`:""}${ph?`<div class="ph">${ph}</div>`:""}</div>`; }).join("")
    :`<div class="fcard empty">Todavía no hay registros. Abrí la ficha de un espacio y usá “Registrar actualización”.</div>`}</div>`;
}
$("#v-bitacora").addEventListener("click",ev=>{ if(ev.target.id==="xlsx2"){ descargarExcel(); return; } const a=ev.target.closest("a[data-id]"); if(a) select(a.dataset.id);
  if(ev.target.dataset.full){ $("#lbimg").src=ev.target.dataset.full; $("#lightbox").classList.add("open"); } });

/* ---------- vistas ---------- */
function setView(v){ S.view=v; document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("on",x.id==="v-"+v)); renderCurrent();
  if(v==="mapa") setTimeout(()=>map.invalidateSize(),50); try{ history.replaceState(null,"",v==="mapa"?location.pathname:"#"+v); }catch(_){} }
$("#tabs").onclick=ev=>{ const b=ev.target.closest("button[data-v]"); if(b) setView(b.dataset.v); };
function renderCurrent(){ if(S.view==="mapa") renderPins(); else if(S.view==="matriz") renderMatriz(); else renderBitacora(); }
function renderAll(){ $("#btnNuevo").hidden=!S.canWrite; renderKPIs(); renderFiltersOptions(); renderList(); renderCurrent(); renderMapbar();
  if(S.sel){ if(S.espacios.has(S.sel)) renderFicha(); else closeFicha(); } }
$("#list").onclick=ev=>{ const it=ev.target.closest(".item"); if(!it) return; select(it.dataset.id); if(S.view==="mapa") centerOn(it.dataset.id); };
$("#q").oninput=ev=>{ S.filt.q=ev.target.value; renderList(); renderCurrent(); };
$("#fZona").onchange=ev=>{ S.filt.zona=ev.target.value; renderList(); renderCurrent(); };
$("#fTipo").onchange=ev=>{ S.filt.tipo=ev.target.value; renderList(); renderCurrent(); };
$("#fSem").onclick=ev=>{ const c=ev.target.closest(".chip"); if(!c) return; const s=c.dataset.s; S.filt.sem.has(s)?S.filt.sem.delete(s):S.filt.sem.add(s); renderFiltersOptions(); renderList(); renderCurrent(); };
document.addEventListener("keydown",ev=>{ if(ev.key!=="Escape") return;
  if($("#lightbox").classList.contains("open")) $("#lightbox").classList.remove("open");
  else if($("#modal").classList.contains("open")) closeModal();
  else if(S.placing){ S.placing=false; $("#map").classList.remove("placing"); renderMapbar(); renderPins(); }
  else if(S.sel) closeFicha(); });

/* ---------- arranque ---------- */
let reloading=null;
async function reload(){
  if(reloading) return reloading;
  reloading=(async()=>{ try{
      const {espacios,registros}=await DB.loadAll();
      S.espacios=new Map(espacios.map(e=>[e.id,e])); S.registros=registros;
      $("#statusTx").textContent = DEMO ? "Demostración" : "En línea"; $("#status").classList.toggle("live",!DEMO);
      renderAll();
    }catch(err){ $("#statusTx").textContent="Error al cargar datos"; console.error(err); toast("No se pudieron cargar los datos: "+(err.message||err)); }
    finally{ reloading=null; } })();
  return reloading;
}
window.VC={map,S,DB,hasPos,renderAll,select,toast,sem,puntaje,SEMCOL,esc,errMsg,filtrados};
(async function init(){
  $("#titulo").textContent=CFG.TITULO||"Espacios Públicos"; $("#subtitulo").textContent=CFG.SUBTITULO||"";
  const h=(location.hash||"").slice(1); if(["matriz","bitacora"].includes(h)) setView(h);
  loadPlano();
  try{ await DB.init(); }catch(err){ console.error(err); toast("No se pudo conectar con Supabase"); }
  await reload();
})();
