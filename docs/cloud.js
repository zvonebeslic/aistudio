/* Personal BYOK Google Gemini connection. Keys are never saved, logged or committed.
 * Only the user who manually supplies a key to this browser session can call the API.
 * A server proxy is recommended for production/public multi-user applications.
 */
(() => {
  'use strict';
  const API='https://generativelanguage.googleapis.com';
  const IMAGE=new Set(['gemini-nano-banana-2.1','gemini-3.1-flash-image','gemini-3.1-flash-lite-image','gemini-3-pro-image','gemini-2.5-flash-image']);
  const VIDEO='gemini-omni-1.1-flash';
  let apiKey='';
  function hasKey(){return Boolean(apiKey);}
  function setKey(key){
    const value=String(key||'').trim();
    if(value && value.length<20)throw Error('API ključ je prekratak.');
    apiKey=value;
  }
  function status(message,fn){if(typeof fn==='function')fn(message);}
  function failText(error){
    if(error instanceof TypeError)return 'Mrežna greška ili CORS blokada. Probaj drugi preglednik ili Node.js backend. Provjeri internet i API ključ.';
    return error?.message||String(error);
  }
  async function api(path,{method='GET',body,headers={},signal}={}){
    if(!hasKey())throw Error('U Postavkama unesi vlastiti Gemini API ključ za ovu sesiju.');
    const response=await fetch(API+path,{
      method,signal:signal||AbortSignal.timeout(8*60*1000),
      headers:{'x-goog-api-key':apiKey,...(body && !(body instanceof Blob)?{'Content-Type':'application/json'}:{}),...headers},
      ...(body?{body:body instanceof Blob?body:JSON.stringify(body)}:{})
    });
    if(!response.ok){
      const payload=await response.json().catch(()=>({}));
      throw Error('Gemini ('+response.status+'): '+String(payload.error?.message||payload.message||response.statusText).slice(0,430));
    }
    return response;
  }
  async function apiJSON(path,options){const res=await api(path,options);return res.json();}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  async function imagePart(file){
    if(!file?.type.startsWith('image/'))throw Error('Neispravna referentna fotografija.');
    if(file.size>18*1024*1024)throw Error('Referentna fotografija mora biti manja od 18 MB.');
    const bitmap=await createImageBitmap(file);
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    if(bitmap.close)bitmap.close();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Ne mogu pretvoriti fotografiju.')),'image/jpeg',.91));
    return {type:'image',data:await asBase64(blob),mime_type:'image/jpeg'};
  }
  async function asBase64(blob){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(',')[1]);
      reader.onerror=()=>reject(Error('Čitanje datoteke nije uspjelo.'));
      reader.readAsDataURL(blob);
    });
  }
  function fromBase64(data,mime){
    const chunks=[];
    for(let i=0;i<data.length;i+=4*32768){
      const raw=atob(data.slice(i,i+4*32768));
      const bytes=new Uint8Array(raw.length);
      for(let j=0;j<raw.length;j++)bytes[j]=raw.charCodeAt(j);
      chunks.push(bytes);
    }
    return new Blob(chunks,{type:mime||'image/png'});
  }
  async function uploadVideo(file,fn){
    if(!file)throw Error('Učitaj video za AI uređivanje.');
    if(file.size>60*1024*1024)throw Error('Video je prevelik (najviše 60 MB).');
    status('Prijenos videa Googleu...',fn);
    const first=await fetch(API+'/upload/v1beta/files',{
      method:'POST',
      headers:{
        'x-goog-api-key':apiKey,
        'X-Goog-Upload-Protocol':'resumable',
        'X-Goog-Upload-Command':'start',
        'X-Goog-Upload-Header-Content-Length':String(file.size),
        'X-Goog-Upload-Header-Content-Type':file.type,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({file:{display_name:'zvone-studio-video'}})
    });
    if(!first.ok)throw Error('Google Files API ('+first.status+'): prijenos nije započeo.');
    const url=first.headers.get('x-goog-upload-url');
    if(!url || !url.startsWith(API+'/'))throw Error('Nije dostupna sigurna adresa prijenosa. Za video upload upotrijebi Node.js backend.');
    const uploaded=await fetch(url,{method:'POST',headers:{
      'x-goog-api-key':apiKey,
      'X-Goog-Upload-Offset':'0',
      'X-Goog-Upload-Command':'upload, finalize',
      'Content-Type':file.type
    },body:file,signal:AbortSignal.timeout(5*60*1000)});
    if(!uploaded.ok)throw Error('Prijenos videa nije uspio ('+uploaded.status+').');
    const json=await uploaded.json();
    if(!json.file?.uri)throw Error('Google nije vratio adresu videa.');
    return json.file.uri;
  }
  function outputOf(payload,type){
    if(type==='image' && payload.output_image?.data)return payload.output_image;
    if(type==='video' && (payload.output_video?.data||payload.output_video?.uri))return payload.output_video;
    const parts=[];
    for(const step of payload.steps||[]){
      if(step.type==='model_output'||step.type==='output'){
        for(const part of step.content||[]){
          if(part.type===type || part.mime_type?.startsWith(type+'/'))parts.push(part);
        }
      }
    }
    for(const part of payload.outputs||[])if(part.type===type)parts.push(part);
    return parts.at(-1)||null;
  }
  async function outputBlob(output,type,fn){
    if(output.data)return fromBase64(output.data,output.mime_type||(type==='video'?'video/mp4':'image/png'));
    if(output.uri && type==='video'){
      status('Preuzimam izrađeni video...',fn);
      const u=new URL(output.uri);
      if(u.origin!==API || !u.pathname.startsWith('/v1beta/files/'))throw Error('Nije dopuštena adresa preuzimanja.');
      const response=await api(u.pathname+u.search);
      return response.blob();
    }
    throw Error('Gemini nije vratio medijsku datoteku.');
  }
  async function generate(options,fn){
    if(!hasKey())throw Error('Unesi Gemini API ključ u Postavkama.');
    const {mode,model,prompt,ratio,resolution,duration,uploads=[],uploadedVideo,sourceId}=options;
    const isVideo=mode==='video'||mode==='video-edit';
    if(!isVideo&&!IMAGE.has(model))throw Error('Za ovaj model koristi backend; browser verzija podržava Gemini modele.');
    if(isVideo&&model!==VIDEO)throw Error('Odabrani video model nije dostupan.');
    if(!prompt || prompt.trim().length<2)throw Error('Upiši opis generiranja.');
    status('Pripremam ulazne podatke...',fn);
    const input=[];
    if(sourceId){
      const stored=await StudioStore.get(sourceId);
      if(stored?.blob?.type.startsWith('image/'))input.push(await imagePart(stored.blob));
    }
    for(const file of uploads)input.push(await imagePart(file));
    if(mode==='edit' && input.length===0)throw Error('Za prepravku je potrebna referentna slika.');
    if(mode==='video-edit'){
      const uri=await uploadVideo(uploadedVideo,fn);
      input.push({type:'video',uri,mime_type:uploadedVideo.type});
    }
    input.push({type:'text',text:prompt});
    let payload={
      model,
      input:input.length===1?prompt:input,
      ...(isVideo ? {
        response_format:{type:'video',aspect_ratio:ratio==='9:16'?'9:16':'16:9',duration:Math.min(10,Number(duration)||8)+'s',delivery:'uri'}
      } : {
        response_format:{type:'image',aspect_ratio:ratio,image_size:resolution||'1K'}
      })
    };
    status(isVideo?'Generiram video pomoću Gemini Omni modela...':'Generiram sliku pomoću Nano Banana modela...',fn);
    let interaction=await apiJSON('/v1beta/interactions',{method:'POST',body:payload});
    let elapsed=0;
    while(interaction.status && !['completed','failed','cancelled'].includes(interaction.status)){
      if(!interaction.id||elapsed>=8*60*1000)throw Error('Vrijeme obrade isteklo. Provjeri potrošnju u Google AI Studiju.');
      await sleep(4000);elapsed+=4000;
      interaction=await apiJSON('/v1beta/interactions/'+encodeURIComponent(interaction.id));
      status('AI model obrađuje zahtjev ('+Math.ceil(elapsed/1000)+' s)...',fn);
    }
    if(interaction.status==='failed'||interaction.status==='cancelled')throw Error('Model nije dovršio generiranje: '+interaction.status);
    const output=outputOf(interaction,isVideo?'video':'image');
    if(!output)throw Error('Model nije vratio rezultat. Pokušaj drukčiji opis ili model.');
    const blob=await outputBlob(output,isVideo?'video':'image',fn);
    if(blob.size===0)throw Error('Dobivena datoteka je prazna.');
    status('Spremam rezultat u tvoju galeriju...',fn);
    const saved=await StudioStore.save({blob,prompt,model,mode});
    return {...saved,url:await StudioStore.url(saved.id)};
  }
  function init(){
    const input=document.getElementById('geminiBrowserKey');
    const connect=document.getElementById('connectGemini');
    const clear=document.getElementById('clearGemini');
    const state=document.getElementById('geminiBrowserStatus');
    const badge=document.getElementById('aiKeyButton');
    const refresh=()=> {
      if(state)state.textContent=hasKey()?'Ključ je aktivan samo u ovoj kartici.':'Ključ nije postavljen. Unosiš ga samo za vlastitu sesiju.';
      if(badge)badge.textContent=hasKey()?'✦ Gemini povezan':'✦ Poveži AI';
      if(typeof loadStatus==='function')void loadStatus();
    };
    connect?.addEventListener('click',()=>{
      try{setKey(input.value);input.value='';refresh();if(typeof toast==='function')toast(hasKey()?'Gemini je povezan za ovu sesiju.':'Ključ je uklonjen.');}
      catch(e){if(state)state.textContent=e.message;}
    });
    clear?.addEventListener('click',()=>{setKey('');if(input)input.value='';refresh();});
    badge?.addEventListener('click',()=>{if(typeof setMode==='function')setMode('settings');});
    refresh();
  }
  window.StudioCloud={generate,setKey,hasKey,clearKey:()=>setKey(''),failText};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
