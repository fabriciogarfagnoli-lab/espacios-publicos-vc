// Delimitación de espacios con polígonos (se carga después de app.js)
(function(){
const VC = window.VC; if(!VC || !window.L) return;
const { map, S } = VC;

const css = document.createElement("style");
css.textContent = `
.drawbar{position:absolute;left:50%;transform:translateX(-50%);bottom:18px;z-index:600;background:var(--paper);border:1px solid var(--line2);border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.15);padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:94%}
.drawbar .info{font-size:12.5px;color:var(--ink2);margin-right:4px}
.drawbar .info b{color:var(--ink)}
.vtx{width:12px;height:12px;background:#fff;border:2.5px solid #135e63;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:move}
.vtx.first{background:#135e63}
.polysw{position:absolute;right:14px;top:98px;z-index:500;display:flex;align-items:center;gap:6px;background:var(--paper);border:1px solid var(--line2);border-radius:9px;padding:4px 4px 4px 10px;font-size:12px;font-weight:600;color:var(--ink2);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.polysw .seg button{padding:4px 9px}
.polysw .seg button.on.v{background:#3f8a3a}
.polysw .sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.polyinfo{margin-top:8px;font-size:12.5px;color:var(--ink2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`;
document.head.appendChild(css);

const polyLayer = L.layerGroup().addTo(map);
const drawLayer = L.layerGroup().addTo(map);
let D = null;   // { id, pts:[[lat,lng]...] }

const hasPoly = e => Array.isArray(e?.poligono) && e.poligono.length >= 3;
function areaM2(pts){
  if(!pts || pts.length < 3) return 0;
  const R = 6371008.8, lat0 = pts.reduce((s,p)=>s+p[0],0)/pts.length*Math.PI/180;
  const xy = pts.map(([la,ln]) => [R*ln*Math.PI/180*Math.cos(lat0), R*la*Math.PI/180]);
  let a = 0; for(let i=0;i<xy.length;i++){ const [x1,y1]=xy[i], [x2,y2]=xy[(i+1)%xy.length]; a += x1*y2 - x2*y1; }
  return Math.abs(a)/2;
}
function perimM(pts){
  if(!pts || pts.length < 2) return 0; let p = 0;
  for(let i=0;i<pts.length;i++) p += map.distance(pts[i], pts[(i+1)%pts.length]);
  return p;
}
const fmtA = m2 => m2 >= 10000 ? (m2/10000).toLocaleString("es-AR",{maximumFractionDigits:2})+" ha" : Math.round(m2).toLocaleString("es-AR")+" m²";
const fmtL = m => Math.round(m).toLocaleString("es-AR")+" m";
function centroid(pts){ return [pts.reduce((s,p)=>s+p[0],0)/pts.length, pts.reduce((s,p)=>s+p[1],0)/pts.length]; }

/* --- modo de color: "verde" (espacio público) o "semaforo" (estado) --- */
const VERDE = { fill:"#5aa04b", stroke:"#2f6b2a" };
let modo = (()=>{ try{ return localStorage.getItem("vc_polymode")||"verde"; }catch(_){ return "verde"; } })();
function polyStyle(e, sel, on){
  if(modo === "semaforo"){
    const col = VC.SEMCOL[VC.sem(VC.puntaje(e))];
    return { color:col, weight: sel?3.5:2, opacity: on?1:.25, fillColor:col, fillOpacity: on?(sel?.6:.45):.06 };
  }
  return { color:VERDE.stroke, weight: sel?3.5:1.6, opacity: on?.95:.25, fillColor:VERDE.fill, fillOpacity: on?(sel?.6:.42):.06 };
}
function montarSelector(){
  const host = document.getElementById("map")?.parentElement; if(!host || document.getElementById("polysw")) return;
  const el = document.createElement("div"); el.className = "polysw"; el.id = "polysw";
  el.innerHTML = `Polígonos <div class="seg"><button type="button" data-m="verde" class="v"><i class="sw" style="background:${VERDE.fill}"></i>Espacio verde</button><button type="button" data-m="semaforo"><i class="sw" style="background:linear-gradient(90deg,${VC.SEMCOL.r} 33%,${VC.SEMCOL.y} 33% 66%,${VC.SEMCOL.g} 66%)"></i>Semáforo</button></div>`;
  const pintar = () => el.querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.m===modo));
  el.addEventListener("click", ev => { const b = ev.target.closest("button[data-m]"); if(!b) return; ev.stopPropagation();
    modo = b.dataset.m; try{ localStorage.setItem("vc_polymode", modo); }catch(_){}
    pintar(); drawAll(); });
  L.DomEvent.disableClickPropagation(el);
  pintar(); host.appendChild(el);
}

/* --- polígonos guardados --- */
function drawAll(){
  montarSelector();
  polyLayer.clearLayers();
  const vis = new Set(VC.filtrados().map(e=>e.id));
  for(const e of S.espacios.values()){
    if(!hasPoly(e) || (D && D.id===e.id)) continue;
    const sel = S.sel===e.id, on = vis.has(e.id);
    L.polygon(e.poligono, polyStyle(e, sel, on))
      .bindTooltip(VC.esc(e.nombre), {sticky:true, className:"ptip"})
      .on("click", ev => { if(D) return; L.DomEvent.stopPropagation(ev); VC.select(e.id); })
      .addTo(polyLayer);
  }
}
window.VC_onPins = drawAll;

/* --- modo dibujo --- */
function start(id){
  const e = S.espacios.get(id); if(!e) return;
  if(!S.canWrite){ VC.toast("Necesitás ingresar como editor."); return; }
  D = { id, pts: hasPoly(e) ? e.poligono.map(p=>[p[0],p[1]]) : [] };
  S.placing = false;
  document.querySelector('#tabs button[data-v="mapa"]')?.click();
  map.doubleClickZoom.disable();
  document.getElementById("map").classList.add("placing");
  if(hasPoly(e)) map.fitBounds(L.polygon(e.poligono).getBounds(), {padding:[60,60], maxZoom:19});
  else if(VC.hasPos(e)) map.setView([e.lat,e.lng], Math.max(map.getZoom(), 18));
  renderDraw(); drawAll();
}
function stop(){
  D = null; drawLayer.clearLayers(); map.doubleClickZoom.enable();
  document.getElementById("map").classList.remove("placing");
  document.getElementById("drawbar")?.remove();
  drawAll();
}
function renderDraw(){
  drawLayer.clearLayers(); if(!D) return;
  const pts = D.pts;
  if(pts.length >= 3) L.polygon(pts, {color:"#135e63", weight:2.5, dashArray:"6 4", fillColor:"#135e63", fillOpacity:.15, interactive:false}).addTo(drawLayer);
  else if(pts.length === 2) L.polyline(pts, {color:"#135e63", weight:2.5, dashArray:"6 4", interactive:false}).addTo(drawLayer);
  pts.forEach((p,i) => {
    const m = L.marker(p, { draggable:true, zIndexOffset:2000,
      icon: L.divIcon({className:"", iconSize:[12,12], iconAnchor:[6,6], html:`<div class="vtx${i===0?" first":""}" title="Arrastrá para mover · clic derecho para borrar"></div>`}) });
    m.on("drag", ev => { const ll = ev.target.getLatLng(); D.pts[i] = [ll.lat, ll.lng]; redrawShapeOnly(); });
    m.on("dragend", () => renderDraw());
    m.on("contextmenu", ev => { L.DomEvent.preventDefault(ev.originalEvent); D.pts.splice(i,1); renderDraw(); });
    m.on("click", ev => { L.DomEvent.stopPropagation(ev); });
    m.addTo(drawLayer);
  });
  renderBar();
}
function redrawShapeOnly(){
  drawLayer.eachLayer(l => { if(l instanceof L.Polygon || (l instanceof L.Polyline && !(l instanceof L.Marker))) drawLayer.removeLayer(l); });
  if(D.pts.length >= 3) L.polygon(D.pts, {color:"#135e63", weight:2.5, dashArray:"6 4", fillColor:"#135e63", fillOpacity:.15, interactive:false}).addTo(drawLayer);
  renderBar();
}
function renderBar(){
  let bar = document.getElementById("drawbar");
  if(!bar){ bar = document.createElement("div"); bar.id = "drawbar"; bar.className = "drawbar"; document.getElementById("v-mapa").appendChild(bar);
    bar.addEventListener("click", onBar); }
  const e = S.espacios.get(D.id), n = D.pts.length;
  bar.innerHTML = `<div class="info">✏️ Delimitando <b>${VC.esc(e?.nombre||"")}</b> · ${n} vértice${n===1?"":"s"}${n>=3?` · <b>${fmtA(areaM2(D.pts))}</b> · perímetro ${fmtL(perimM(D.pts))}`:""}<br>
    <span style="font-size:11.5px">Clic en el mapa agrega un vértice · arrastrá para moverlo · clic derecho lo borra</span></div>
    <button class="btn sm" data-a="undo" ${n?"":"disabled"}>↶ Deshacer</button>
    <button class="btn sm" data-a="clear" ${n?"":"disabled"}>Borrar todo</button>
    <button class="btn sm" data-a="cancel">Cancelar</button>
    <button class="btn sm pri" data-a="save" ${n===0||n>=3?"":"disabled"}>${n===0?"Guardar sin polígono":"Guardar delimitación"}</button>`;
}
async function onBar(ev){
  const a = ev.target.closest("button")?.dataset.a; if(!a || !D) return;
  if(a==="undo"){ D.pts.pop(); renderDraw(); }
  if(a==="clear"){ D.pts = []; renderDraw(); }
  if(a==="cancel") stop();
  if(a==="save"){
    const e = S.espacios.get(D.id); const pts = D.pts.map(([la,ln]) => [+la.toFixed(7), +ln.toFixed(7)]);
    const patch = { poligono: pts.length>=3 ? pts : null };
    if(pts.length>=3 && !VC.hasPos(e)){ const c = centroid(pts); patch.lat = +c[0].toFixed(7); patch.lng = +c[1].toFixed(7); }
    ev.target.disabled = true;
    try{ await VC.DB.update(e.id, patch); Object.assign(e, patch); stop(); VC.renderAll(); VC.toast(pts.length>=3?"Delimitación guardada":"Polígono eliminado"); }
    catch(err){ ev.target.disabled = false; VC.toast(VC.errMsg(err)); }
  }
}
map.on("click", ev => { if(!D) return; D.pts.push([ev.latlng.lat, ev.latlng.lng]); renderDraw(); });
document.addEventListener("keydown", ev => {
  if(!D) return;
  if(ev.key==="Escape"){ ev.stopImmediatePropagation(); stop(); }
  if((ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==="z"){ ev.preventDefault(); D.pts.pop(); renderDraw(); }
}, true);

/* --- ficha: superficie y botón --- */
window.VC_onFicha = e => {
  const body = document.getElementById("fbody"), head = document.getElementById("fhead"); if(!body) return;
  const info = document.createElement("div"); info.className = "polyinfo";
  info.innerHTML = hasPoly(e)
    ? `⬠ Superficie delimitada: <b>${fmtA(areaM2(e.poligono))}</b> · perímetro ${fmtL(perimM(e.poligono))}`
    : `⬠ Sin delimitar en el mapa.`;
  const links = body.querySelector(".links"); (links?.nextElementSibling || links)?.after(info);
  const row = head?.querySelector("#fPlace")?.parentElement;
  if(row && S.canWrite && !row.querySelector("[data-poly]")){
    const b = document.createElement("button"); b.className = "btn sm"; b.dataset.poly = "1";
    b.textContent = hasPoly(e) ? "⬠ Editar delimitación" : "⬠ Delimitar"; b.onclick = () => start(e.id);
    row.appendChild(b);
  }
};

/* --- edición de ficha: sección de delimitación --- */
window.VC_onEdit = (e, isNew) => {
  const form = document.getElementById("fe"); if(!form) return;
  const box = document.createElement("div"); box.className = "rubed";
  if(isNew){ box.innerHTML = `<div class="rt">Delimitación en el mapa</div><div class="nt" style="font-size:12.5px;color:var(--ink2)">Guardá el espacio primero; después vas a poder dibujar su polígono desde la ficha.</div>`; }
  else {
    box.innerHTML = `<div class="rt">Delimitación en el mapa</div>
      <div style="font-size:12.5px;color:var(--ink2)">${hasPoly(e)?`Superficie actual: <b>${fmtA(areaM2(e.poligono))}</b> (${e.poligono.length} vértices)`:"Todavía sin delimitar."}</div>
      <div><button type="button" class="btn sm pri" id="fePoly">⬠ ${hasPoly(e)?"Editar":"Dibujar"} polígono en el mapa</button>
      <span style="font-size:11.5px;color:var(--ink3);margin-left:6px">Guarda los cambios de la ficha y abre el mapa en modo dibujo.</span></div>`;
  }
  const recSec = [...form.querySelectorAll(".sec")].pop(); (recSec || form.lastElementChild).before(box);
  const btn = document.getElementById("fePoly");
  if(btn) btn.onclick = async () => {
    const save = document.getElementById("feSave"); save?.click();
    const t0 = Date.now(); while(document.getElementById("modal").classList.contains("open") && Date.now()-t0 < 8000) await new Promise(r=>setTimeout(r,150));
    if(!document.getElementById("modal").classList.contains("open")) setTimeout(() => start(e.id), 300);
  };
};

drawAll();
})();
