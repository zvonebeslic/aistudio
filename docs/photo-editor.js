/* Native browser image editor. All processing is done using Canvas 2D. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('photoCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const controls = [
    { id:'brightness', title:'Svjetlina',min:0,max:200,value:100,unit:'%' },
    { id:'contrast',title:'Kontrast',min:0,max:200,value:100,unit:'%' },
    { id:'saturate',title:'Zasićenost',min:0,max:200,value:100,unit:'%' },
    { id:'hue',title:'Ton boje',min:-180,max:180,value:0,unit:'°' },
    { id:'blur',title:'Zamućenje',min:0,max:15,value:0,unit:'px' },
    { id:'grayscale',title:'Crno-bijelo',min:0,max:100,value:0,unit:'%' },
    { id:'sepia',title:'Sepia',min:0,max:100,value:0,unit:'%' }
  ];
  const defaults = Object.fromEntries(controls.map(c => [c.id,c.value]));
  const initial = () => ({
    ratio:'original',rotate:0,flipX:false,flipY:false,
    filters:{...defaults},text:'',textSize:6,textColor:'#ffffff',textPos:'bottom',
    brushColor:'#ffcd70',brushSize:6,paths:[]
  });
  let state=initial(), bitmap=null, history=[], index=-1, drawing=null, raf=0;
  let currentSource = null;
  function status(message, error=false) {
    $('message').textContent = message;
    $('message').style.color = error ? '#ff9caa' : '#9aa1b5';
  }
  function snapshot() { return JSON.stringify(state); }
  function checkpoint() {
    const value=snapshot();
    if (history[index] === value) return;
    history=history.slice(0,index+1);
    history.push(value);
    if (history.length>45) history.shift();
    index=history.length-1;
    updateHistory();
  }
  function updateHistory() {
    $('undo').disabled=index<=0;
    $('redo').disabled=index>=history.length-1;
  }
  function restore(value) {
    if (!value) return;
    state=JSON.parse(value);
    syncControls();
    render();
    updateHistory();
  }
  function syncControls() {
    $('ratio').value=state.ratio;
    for (const c of controls) {
      $(c.id).value=state.filters[c.id];
      $(c.id+'Value').textContent=state.filters[c.id]+c.unit;
    }
    $('overlayText').value=state.text;
    $('textSize').value=state.textSize;
    $('textColor').value=state.textColor;
    $('textPos').value=state.textPos;
    $('brushColor').value=state.brushColor;
    $('brushSize').value=state.brushSize;
  }
  function sliderMarkup(c) {
    return '<div class="tool-field range-field"><label for="'+c.id+'">'+c.title+'<output id="'+c.id+'Value">'+c.value+c.unit+'</output></label><input id="'+c.id+'" type="range" min="'+c.min+'" max="'+c.max+'" value="'+c.value+'"></div>';
  }
  $('sliders').innerHTML=controls.map(sliderMarkup).join('');
  function filterString() {
    const f=state.filters;
    return 'brightness('+f.brightness+'%) contrast('+f.contrast+'%) saturate('+f.saturate+'%) hue-rotate('+f.hue+'deg) blur('+f.blur+'px) grayscale('+f.grayscale+'%) sepia('+f.sepia+'%)';
  }
  function calcGeometry() {
    const w=bitmap.width, h=bitmap.height;
    const turned=state.rotate%180!==0;
    const desired=state.ratio==='original' ? (turned ? h/w : w/h) : Number(state.ratio);
    const cropRatio=turned ? 1/desired : desired;
    let cw=Math.min(w,h*cropRatio);
    let ch=cw/cropRatio;
    if(ch>h){ch=h;cw=ch*cropRatio;}
    const ow=turned?ch:cw, oh=turned?cw:ch;
    const scale=Math.min(1,2400/Math.max(ow,oh));
    return {sx:(w-cw)/2,sy:(h-ch)/2,cw,ch,outputW:Math.max(1,Math.round(ow*scale)),outputH:Math.max(1,Math.round(oh*scale)),scale};
  }
  function renderNow() {
    if(!bitmap) return;
    const {sx,sy,cw,ch,outputW,outputH,scale}=calcGeometry();
    canvas.width=outputW;
    canvas.height=outputH;
    ctx.clearRect(0,0,outputW,outputH);
    ctx.save();
    ctx.filter=filterString();
    ctx.translate(outputW/2,outputH/2);
    ctx.rotate(state.rotate*Math.PI/180);
    ctx.scale(state.flipX?-1:1,state.flipY?-1:1);
    ctx.drawImage(bitmap,sx,sy,cw,ch,-cw*scale/2,-ch*scale/2,cw*scale,ch*scale);
    ctx.restore();
    ctx.filter='none';
    for(const path of state.paths) paintPath(path);
    if(drawing) paintPath(drawing);
    if(state.text.trim()) {
      const size=Math.max(16,outputW*(state.textSize/100));
      ctx.font='800 '+size+'px Inter, system-ui, sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.lineJoin='round';
      const pos={top:0.12,center:0.5,bottom:0.88}[state.textPos] || 0.88;
      ctx.lineWidth=Math.max(2,size*0.11);
      ctx.strokeStyle='#000b';
      ctx.strokeText(state.text,outputW/2,outputH*pos,outputW*0.92);
      ctx.fillStyle=state.textColor;
      ctx.fillText(state.text,outputW/2,outputH*pos,outputW*0.92);
    }
    $('dimensions').textContent=outputW+' × '+outputH+' PX';
  }
  function render() {
    if(raf) cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{raf=0;renderNow();});
  }
  function paintPath(path) {
    if(!path.points.length)return;
    const ratio=canvas.width/1000;
    ctx.save();
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Math.max(1,path.size*ratio);
    ctx.strokeStyle=path.color;
    ctx.beginPath();
    path.points.forEach((pt,i)=>{if(!i)ctx.moveTo(pt.x*canvas.width,pt.y*canvas.height);else ctx.lineTo(pt.x*canvas.width,pt.y*canvas.height);});
    if(path.points.length===1){const p=path.points[0];ctx.lineTo(p.x*canvas.width+.01,p.y*canvas.height+.01);}
    ctx.stroke();ctx.restore();
  }
  async function openImage(file) {
    if(!file) return;
    if(!file.type.startsWith('image/'))return status('Datoteka nije fotografija.',true);
    if(file.size>25*1024*1024)return status('Fotografija je veća od 25 MB.',true);
    try {
      const image=await createImageBitmap(file);
      if(bitmap?.close)bitmap.close();
      bitmap=image;
      currentSource=file;
      state=initial();
      history=[];index=-1;checkpoint();
      syncControls();
      $('emptyCanvas').hidden=true;
      canvas.hidden=false;
      $('fileName').textContent=file.name+' · '+(file.size/1024/1024).toFixed(1)+' MB';
      status('Fotografija je učitana. Sve promjene odmah vidiš na platnu.');
      render();
    } catch(e) {status('Ne mogu otvoriti fotografiju: '+e.message,true);}
  }
  for(const c of controls){
    $(c.id).addEventListener('input',e=>{state.filters[c.id]=Number(e.target.value);$(c.id+'Value').textContent=e.target.value+c.unit;render();});
    $(c.id).addEventListener('change',checkpoint);
  }
  $('ratio').addEventListener('change',e=>{state.ratio=e.target.value;checkpoint();render();});
  const edit=(id,handler)=>$(id).addEventListener('click',()=>{if(!bitmap)return;handler();checkpoint();render();});
  edit('rotateL',()=>{state.rotate=(state.rotate+270)%360;});
  edit('rotateR',()=>{state.rotate=(state.rotate+90)%360;});
  edit('flipX',()=>{state.flipX=!state.flipX;});
  edit('flipY',()=>{state.flipY=!state.flipY;});
  edit('resetLook',()=>{state.filters={...defaults};syncControls();});
  edit('presetWarm',()=>{state.filters={...defaults,brightness:108,contrast:105,saturate:118,hue:-7,sepia:18};syncControls();});
  edit('presetBw',()=>{state.filters={...defaults,contrast:118,grayscale:100};syncControls();});
  edit('eraseLast',()=>{state.paths.pop();});
  edit('clearDrawings',()=>{state.paths=[];});
  for(const [id,key,val] of [['overlayText','text','value'],['textSize','textSize','value'],['textColor','textColor','value'],['textPos','textPos','value']]){
    $(id).addEventListener('input',e=>{state[key]=['textSize'].includes(key)?Number(e.target[val]):e.target[val];render();});
    $(id).addEventListener('change',checkpoint);
  }
  $('brushColor').addEventListener('input',e=>{state.brushColor=e.target.value;});
  $('brushSize').addEventListener('input',e=>{state.brushSize=Number(e.target.value);});
  $('brush').addEventListener('change',()=>{canvas.style.touchAction=$('brush').checked?'none':'auto';canvas.style.cursor=$('brush').checked?'crosshair':'default';});
  function relativePoint(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
  }
  canvas.addEventListener('pointerdown',e=>{
    if(!bitmap||!$('brush').checked)return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing={color:state.brushColor,size:state.brushSize,points:[relativePoint(e)]};
    render();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drawing)return;
    drawing.points.push(relativePoint(e));
    render();
  });
  function endDrawing(){
    if(!drawing)return;
    state.paths.push(drawing);
    drawing=null;
    checkpoint();render();
  }
  canvas.addEventListener('pointerup',endDrawing);
  canvas.addEventListener('pointercancel',endDrawing);
  $('undo').addEventListener('click',()=>{if(index>0){index--;restore(history[index]);}});
  $('redo').addEventListener('click',()=>{if(index<history.length-1){index++;restore(history[index]);}});
  $('file').addEventListener('change',e=>{void openImage(e.target.files?.[0]);});
  const drop=$('drop');
  for(const type of ['dragover','dragenter'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragover');});
  for(const type of ['dragleave','drop'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragover');});
  drop.addEventListener('drop',e=>{if(e.dataTransfer.files.length)void openImage(e.dataTransfer.files[0]);});
  function toBlob(){
    if(!bitmap)throw Error('Prvo učitaj fotografiju.');
    if(raf){cancelAnimationFrame(raf);raf=0;}
    renderNow();
    return new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Izvoz nije uspio.')),$('format').value,Number($('quality').value)/100);
    });
  }
  function download(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  $('download').addEventListener('click',async()=>{
    try{const blob=await toBlob();download(blob,'zvone-studio-'+Date.now()+'.'+({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp' }[blob.type]||'png'));status('Fotografija je izvezena na tvoj uređaj.');}catch(e){status(e.message,true);}
  });
  $('save').addEventListener('click',async()=>{
    try{
      const blob=await toBlob();
      await StudioStore.save({blob,prompt:state.text||currentSource?.name||'Uređena fotografija',model:'Foto editor',mode:'local-photo'});
      status('Fotografija je spremljena u lokalnu galeriju AI Studija.');
    }catch(e){status(e.message,true);}
  });
  const id=new URLSearchParams(location.search).get('id');
  if(id && window.StudioStore)StudioStore.get(id).then(async item=>{
    if(item?.blob?.type.startsWith('image/'))await openImage(new File([item.blob],'galerija.'+item.ext,{type:item.mime}));
  }).catch(()=>{});
  updateHistory();
})();
