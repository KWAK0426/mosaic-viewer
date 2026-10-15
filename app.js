/* global ol */
'use strict';
const $ = (id) => document.getElementById(id);
const state = { records: [], selected: null, layer: null, source: null, generation: 0, bounds: null };
const driveFiles = new Map();
const nativeFetch = window.fetch.bind(window);

// Drive supports HTTP ranges and CORS but does not expose Content-Range.
// Supply that header from the single requested byte range, exposed response
// length, and known catalog file size. No whole-file fallback is permitted.
window.fetch = async function(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let response;
  try {response=await nativeFetch(input,driveFiles.has(url)?{...init,credentials:'omit',referrerPolicy:'no-referrer'}:init);}
  catch(error){if(driveFiles.has(url))console.error('Drive request failed:',error);throw error;}
  if (!driveFiles.has(url) || response.status !== 206 || response.headers.has('content-range')) return response;
  const range = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)).get('range');
  const match = /^bytes=(\d+)-(\d+)$/i.exec(range || '');
  const length = Number(response.headers.get('content-length'));
  const total = driveFiles.get(url);
  if (driveFiles.has(url) && !match) console.warn('Drive returned a range without a supported request header:',range);
  if (!match || !Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(length) || length <= 0) return response;
  const start = Number(match[1]);
  if (start + length > total) return response;
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${total}`);
  return new Response(response.body, {status:206, statusText:response.statusText, headers});
};

const satellite = new ol.layer.Tile({source:new ol.source.XYZ({
  url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  maxZoom:19, crossOrigin:'anonymous',
  attributions:'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community'
})});
const street = new ol.layer.Tile({visible:false, source:new ol.source.OSM({maxZoom:19})});
const map = new ol.Map({target:'map', layers:[satellite,street],
  controls:[new ol.control.Attribution({collapsible:true,collapsed:true}),new ol.control.ScaleLine({units:'metric'})],
  view:new ol.View({center:ol.proj.fromLonLat([126.3522,35.0842]),zoom:16,maxZoom:23,minZoom:3,enableRotation:true})
});
const view=map.getView();
let loadTimeout;
function status(text, kind='loading') {
  $('status').textContent=text; $('status').className='status glass '+kind; $('status').hidden=!text;
}
function fit() {
  if (!state.bounds) return;
  const extent=ol.proj.transformExtent(state.bounds,'EPSG:4326',view.getProjection());
  view.fit(extent,{padding:innerWidth<=700?[120,55,190,35]:[130,90,170,50],duration:500,maxZoom:20});
}
function dateLabel(date) { return date ? date.replaceAll('-','.') : '날짜 미등록'; }
function renderCatalog() {
  const q=$('search').value.trim().toLocaleLowerCase();
  const records=state.records.filter(r=>(r.title+' '+r.date+' '+(r.type||'')).toLocaleLowerCase().includes(q));
  $('count').textContent=state.records.length;
  $('catalog').replaceChildren();
  if (!records.length) {const p=document.createElement('p');p.className='empty';p.textContent='검색 결과가 없어요.';$('catalog').append(p);return;}
  for (const r of records) {
    const b=document.createElement('button');b.className='record'+(state.selected?.id===r.id?' selected':'');b.setAttribute('aria-pressed',String(state.selected?.id===r.id));
    const thumb=document.createElement('div');thumb.className='thumbnail';
    if (r.thumbnail) {const img=document.createElement('img');img.src=r.thumbnail;img.alt='';img.loading='lazy';thumb.append(img);}
    const label=document.createElement('span');label.className='thumb-label';label.textContent=r.type||'모자이크';thumb.append(label);
    const title=document.createElement('div');title.className='record-title';const strong=document.createElement('strong');strong.textContent=r.title;
    const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='↗';title.append(strong,arrow);
    const meta=document.createElement('div');meta.className='record-meta';const date=document.createElement('span');date.textContent=dateLabel(r.date);const dimensions=document.createElement('span');dimensions.textContent=r.width&&r.height?`${r.width.toLocaleString()} × ${r.height.toLocaleString()}`:'고해상도';meta.append(date,dimensions);
    b.append(thumb,title,meta);b.onclick=()=>select(r);$('catalog').append(b);
  }
}
async function select(record) {
  const generation=++state.generation;
  clearTimeout(loadTimeout);$('retry').hidden=true;
  state.selected=record;state.bounds=record.bounds;
  if (state.layer) {map.removeLayer(state.layer);state.layer.dispose();}
  if (state.source) state.source.dispose();
  state.layer=null;state.source=null;
  $('selected-name').textContent=record.title;
  $('selected-info').textContent=`${dateLabel(record.date)} · ${record.type||'모자이크'} · ${record.width.toLocaleString()} × ${record.height.toLocaleString()} px`;
  renderCatalog();closeLibrary();fit();status('관측 영상의 위치 정보를 읽고 있어요');
  const url=record.url || `https://drive.usercontent.google.com/download?id=${encodeURIComponent(record.driveFileId)}&export=download`;
  if (record.driveFileId) driveFiles.set(url,record.sizeBytes);
  const source=new ol.source.GeoTIFF({
    sources:[{url, ...(record.whiteNodata?{nodata:255}:{}),min:0,max:255}],
    normalize:true,convertToRGB:'auto',interpolate:true,
    sourceOptions:{allowFullFile:false,maxRanges:1,blockSize:65536,cacheSize:80}
  });
  state.source=source;
  const layer=new ol.layer.WebGLTile({source,opacity:Number($('opacity').value)/100,visible:$('overlay-visible').checked,cacheSize:128});
  state.layer=layer;
  let pending=0, failed=false, loaded=false;
  function failure() {
    if (generation!==state.generation) return;
    failed=true;clearTimeout(loadTimeout);
    status('영상을 불러오지 못했어요. Drive 공유 권한과 인터넷 연결을 확인해 주세요.','error');$('retry').hidden=false;
  }
  source.on('tileloadstart',()=>{if(generation!==state.generation||failed)return;pending++;if(!loaded)status('현재 화면의 관측 영상을 불러오고 있어요');});
  source.on('tileloadend',()=>{if(generation!==state.generation)return;pending=Math.max(0,pending-1);loaded=true;clearTimeout(loadTimeout);if(!pending&&!failed)status('');});
  source.on('tileloaderror',failure);
  source.on('change',()=>{if(source.getState()==='error')failure();});
  loadTimeout=setTimeout(()=>{if(generation===state.generation&&!loaded)failure();},45000);
  try {
    const metadata=await source.getView();
    if(generation!==state.generation)return;
    if (!state.bounds && metadata.extent) {state.bounds=ol.proj.transformExtent(metadata.extent,metadata.projection,'EPSG:4326');fit();}
    map.addLayer(layer);
    const params=new URLSearchParams(location.search);params.set('observation',record.id);history.replaceState(null,'',location.pathname+'?'+params.toString());
  } catch(error) { console.error('Observation load failed:',error);failure(); }
}
async function loadCatalog() {
  $('refresh').disabled=true;$('catalog-error').hidden=true;
  try {
    const response=await nativeFetch('catalog.json?t='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw Error('목록을 읽지 못했습니다.');
    const catalog=await response.json();
    if(!Array.isArray(catalog.observations))throw Error('목록 형식을 확인해 주세요.');
    const ids=new Set();
    for(const record of catalog.observations) {
      if(!record.id||!record.title||ids.has(record.id)||(!record.driveFileId&&!record.url))throw Error('목록에 잘못된 항목이 있습니다.');
      ids.add(record.id);
    }
    state.records=catalog.observations;renderCatalog();
    const id=state.selected?.id||new URLSearchParams(location.search).get('observation');
    const record=state.records.find(r=>r.id===id)||state.records[0];
    if(record)await select(record);
    else {$('selected-name').textContent='아직 등록된 관측 기록이 없어요';status('');}
  }catch(error){$('catalog-error').textContent='목록을 불러오지 못했어요. 새로고침을 눌러 주세요.';$('catalog-error').hidden=false;console.error(error);}
  finally{$('refresh').disabled=false;}
}
function closeLibrary(){$('sidebar').classList.remove('open');$('library-toggle').setAttribute('aria-expanded','false');}
$('library-toggle').onclick=()=>{const open=$('sidebar').classList.toggle('open');$('library-toggle').setAttribute('aria-expanded',String(open));};
$('search').oninput=renderCatalog;$('refresh').onclick=loadCatalog;$('retry').onclick=()=>state.selected&&select(state.selected);
$('zoom-in').onclick=()=>view.animate({zoom:view.getZoom()+1,duration:200});
$('zoom-out').onclick=()=>view.animate({zoom:view.getZoom()-1,duration:200});
$('fit').onclick=fit;$('north').onclick=()=>view.animate({rotation:0,duration:200});
$('opacity').oninput=()=>{$('opacity-value').textContent=$('opacity').value+'%';state.layer?.setOpacity(Number($('opacity').value)/100);};
$('overlay-visible').onchange=()=>state.layer?.setVisible($('overlay-visible').checked);
function base(isSatellite){satellite.setVisible(isSatellite);street.setVisible(!isSatellite);for(const [id,active]of [['satellite',isSatellite],['street',!isSatellite]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}}
$('satellite').onclick=()=>base(true);$('street').onclick=()=>base(false);
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('map-section').requestFullscreen)await $('map-section').requestFullscreen();else document.body.classList.toggle('focus-mode');}catch(e){console.warn(e);}};
document.addEventListener('fullscreenchange',()=>{map.updateSize();$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'전체 화면 종료':'전체 화면');});
$('hide-hint').onclick=()=>$('hint').hidden=true;
map.on('pointermove',event=>{const p=ol.proj.toLonLat(event.coordinate);$('coordinates').textContent=`${p[1].toFixed(6)}° N  ${p[0].toFixed(6)}° E`;});
map.on('singleclick',()=>{if(innerWidth<=700)closeLibrary();});
function updateResolution(){const center=view.getCenter();if(!center)return;const r=ol.proj.getPointResolution(view.getProjection(),view.getResolution(),center);$('resolution').textContent=`현재 표시 ${r<1?(r*100).toFixed(1)+' cm':r.toFixed(1)+' m'}/px`;}
view.on('change:resolution',updateResolution);updateResolution();
satellite.getSource().once('tileloaderror',()=>{console.warn('Satellite basemap unavailable');status('위성 배경을 불러오지 못했어요. 일반지도로 전환할 수 있습니다.','error');});
window.addEventListener('resize',()=>map.updateSize());
loadCatalog();
