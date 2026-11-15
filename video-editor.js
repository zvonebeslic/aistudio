/* In-browser video trimming, grading and exporting via Canvas + MediaRecorder. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const video=$('video');
  let file=null, videoUrl=null, resultUrl=null, outputBlob=null;
  let rendering=false, exportTick=0, audioContext=null, audioSource=null, audioDest=null;
  const defaults={brightness:100,contrast:100,saturate:100};
  const state={...defaults};
  function note(text,fail=false){$('message').textContent=text;$('message').style.color=fail?'#ff9cac':'#a2a6bd';}
  function seconds(n){return Number(n).toFixed(1)+'s';}
  async function open(fileInput){
    if(!fileInput)return;
    if(!/^video\/(mp4|webm|quicktime)$/.test(fileInput.type) && !/\.(mp4|webm|mov)$/i.test(fileInput.name))return note('Odaberi MP4, WEBM ili MOV video.',true);
    if(fileInput.size>200*1024*1024)return note('Video je prevelik. Maksimalno 200 MB.',true);
    if(rendering)return note('Pričekaj da završi prethodni izvoz.',true);
    if(videoUrl)URL.revokeObjectURL(videoUrl);
    videoUrl=URL.createObjectURL(fileInput);
    file=fileInput;
    video.src=videoUrl;
    $('emptyVideo').hidden=true;
    $('videoWrapper').hidden=false;
    $('fileName').textContent=fileInput.name+' • '+(fileInput.size/1024/1024).toFixed(1)+' MB';
    $('mediaInfo').textContent='UČITAVANJE...';
    outputBlob=null;$('save').disabled=true;
    $('exportResult').hidden=true;
    note('Datoteka je lokalno otvorena.');
    try{await video.play();video.pause();}catch{} // Some mobile devices require user gesture before playback.
  }
  function durationReady(){
    const duration=video.duration;
    if(!Number.isFinite(duration)||duration<=0){note('Preglednik ne može pročitati video format.',true);return;}
    $('clipStart').max=Math.floor(duration*10)/10;
    $('clipEnd').max=Math.floor(duration*10)/10;
    $('clipStart').value=0;
    $('clipEnd').value=Math.floor(duration*10)/10;
    $('durationLabel').textContent='Ukupno: '+seconds(duration)+' · Kadar: '+video.videoWidth+'×'+video.videoHeight;
    $('mediaInfo').textContent=video.videoWidth+' × '+video.videoHeight;
    updatePreview();
  }
  function boundaries(){
    const duration=Number.isFinite(video.duration)?video.duration:0;
    const start=Math.max(0,Math.min(duration,Number($('clipStart').value)||0));
    const end=Math.max(start,Math.min(duration,Number($('clipEnd').value)||duration));
    return {start,end};
  }
  function filter(){return 'brightness('+state.brightness+'%) contrast('+state.contrast+'%) saturate('+state.saturate+'%)'+($('grayscale').checked?' grayscale(100%)':'');}
  function updatePreview(){
    video.style.filter=filter();
    video.playbackRate=Number($('speed').value);
    $('speedValue').textContent=video.playbackRate+'×';
    $('videoTextOverlay').textContent=$('overlayText').value;
    $('videoTextOverlay').style.color=$('textColor').value;
    $('videoTextOverlay').dataset.position=$('textPos').value;
    for(const key of Object.keys(state)) $(key+'Value').textContent=state[key]+'%';
  }
  async function seek(time){
    if(Math.abs(video.currentTime-time)<.06)return;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cleanup();reject(Error('Ne mogu premotati ovaj format videa.'));},12000);
      const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',onseek);video.removeEventListener('error',onerror);};
      const onseek=()=>{cleanup();resolve();};
      const onerror=()=>{cleanup();reject(Error('Greška pri premotavanju videa.'));};
      video.addEventListener('seeked',onseek,{once:true});
      video.addEventListener('error',onerror,{once:true});
      video.currentTime=time;
    });
  }
  function drawFrame(context,canvas){
    if(video.readyState<2)return;
    context.save();
    context.clearRect(0,0,canvas.width,canvas.height);
    context.filter=filter();
    context.drawImage(video,0,0,canvas.width,canvas.height);
    context.restore();
    const text=$('overlayText').value.trim();
    if(text){
      const s=Math.max(20,Math.round(canvas.width*.054));
      context.save();
      context.font='800 '+s+'px system-ui,sans-serif';
      context.textAlign='center';context.textBaseline='middle';context.lineJoin='round';
      const y=({top:.12,center:.5,bottom:.88}[$('textPos').value]||.88)*canvas.height;
      context.lineWidth=Math.max(3,s*.13);context.strokeStyle='#000b';
      context.strokeText(text,canvas.width/2,y,canvas.width*.93);
      context.fillStyle=$('textColor').value;context.fillText(text,canvas.width/2,y,canvas.width*.93);
      context.restore();
    }
  }
  async function setupAudio(stream){
    if(!(window.AudioContext||window.webkitAudioContext))return false;
    try{
      if(!audioContext) {
        audioContext=new (window.AudioContext||window.webkitAudioContext)();
        audioSource=audioContext.createMediaElementSource(video);
        audioDest=audioContext.createMediaStreamDestination();
        audioSource.connect(audioDest);
        audioSource.connect(audioContext.destination);
      }
      await audioContext.resume();
      for(const track of audioDest.stream.getAudioTracks())stream.addTrack(track);
      return audioDest.stream.getAudioTracks().length>0;
    }catch(error){console.warn('Audio nije dostupan za izvoz:',error.message);return false;}
  }
  function chooseMime(){
    const options=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm','video/mp4'];
    return options.find(type=>MediaRecorder.isTypeSupported(type))||'';
  }
  async function exportVideo(){
    if(!file||!Number.isFinite(video.duration))throw Error('Učitaj video za izvoz.');
    if(!('MediaRecorder' in window)||typeof HTMLCanvasElement.prototype.captureStream!=='function')throw Error('Tvoj preglednik ne podržava video izvoz. Probaj Chrome ili Edge na računalu.');
    const {start,end}=boundaries();
    if(end-start<.3)throw Error('Isječak mora trajati barem 0,3 sekunde.');
    if(end-start>120)throw Error('Za jedan izvoz odaberi najviše 120 sekundi.');
    const requested=Number($('exportWidth').value);
    const width=video.videoWidth,height=video.videoHeight;
    if(!width||!height)throw Error('Video format nije podržan za obradu.');
    const scale=Math.min(1,requested/Math.min(width,height),1920/Math.max(width,height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(2,Math.round(width*scale/2)*2);
    canvas.height=Math.max(2,Math.round(height*scale/2)*2);
    const context=canvas.getContext('2d',{alpha:false});
    const originalTime=video.currentTime;
    const originalSpeed=video.playbackRate;
    rendering=true;
    $('export').disabled=true;
    $('progressBox').hidden=false;
    $('progressText').textContent='Pripremam kadrove i zvuk...';
    let recorder=null;
    let recordingStream=null;
    let stopped=false;
    let timeout=null;
    try{
      video.pause();
      await seek(start);
      drawFrame(context,canvas);
      recordingStream=canvas.captureStream(30);
      const hasAudio=await setupAudio(recordingStream);
      const mime=chooseMime();
      if(!mime)throw Error('Na ovom uređaju nema podržanog formata za snimanje.');
      const chunks=[];
      recorder=new MediaRecorder(recordingStream,{mimeType:mime,videoBitsPerSecond:4_500_000});
      const completed=new Promise((resolve,reject)=>{
        recorder.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
        recorder.onerror=e=>reject(Error(e.error?.message||'Problem pri izvozu videa.'));
        recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType.split(';')[0]||'video/webm'}));
      });
      recorder.start(500);
      video.playbackRate=Number($('speed').value);
      await video.play();
      $('progressText').textContent='Izvoz u tijeku '+(hasAudio?'sa zvukom':'bez zvuka')+'...';
      const startWall=performance.now();
      await new Promise((resolve,reject)=>{
        function tick(){
          if(stopped)return;
          drawFrame(context,canvas);
          const elapsed=Math.max(0,video.currentTime-start);
          $('progressText').textContent='Izvoz '+Math.min(100,Math.round(elapsed/(end-start)*100))+'% · '+seconds(elapsed)+' / '+seconds(end-start);
          if(video.currentTime>=end-.04||video.ended){stopped=true;resolve();return;}
          if(performance.now()-startWall>Math.max(25_000,((end-start)/Math.max(.5,video.playbackRate))*1000+18_000)){stopped=true;reject(Error('Izvoz je predugo trajao.'));return;}
          exportTick=requestAnimationFrame(tick);
        }
        exportTick=requestAnimationFrame(tick);
        video.addEventListener('error',()=>reject(Error('Video se nije mogao reproducirati.')),{once:true});
      });
      video.pause();
      recorder.stop();
      const blob=await completed;
      if(blob.size<2000)throw Error('Izvezeni video je prazan.');
      outputBlob=blob;
      if(resultUrl)URL.revokeObjectURL(resultUrl);
      resultUrl=URL.createObjectURL(blob);
      $('resultVideo').src=resultUrl;
      const ext=blob.type.includes('mp4')?'mp4':'webm';
      $('downloadResult').href=resultUrl;
      $('downloadResult').download='zvone-studio-'+Date.now()+'.'+ext;
      $('exportResult').hidden=false;
      $('save').disabled=false;
      $('progressText').textContent='Gotovo! Video je spreman za preuzimanje.';
      note('Gotov video ('+(blob.size/1024/1024).toFixed(1)+' MB) spreman je za preuzimanje.');
    }finally{
      rendering=false;
      cancelAnimationFrame(exportTick);
      if(recorder && recorder.state!=='inactive')recorder.stop();
      if(recordingStream)for(const track of recordingStream.getVideoTracks())track.stop();
      $('export').disabled=false;
      video.pause();video.playbackRate=originalSpeed;
      if(Number.isFinite(originalTime))seek(Math.min(originalTime,video.duration)).catch(()=>{});
    }
  }
  $('file').addEventListener('change',e=>open(e.target.files?.[0]));
  video.addEventListener('loadedmetadata',durationReady);
  video.addEventListener('timeupdate',()=>{
    if(rendering)return;
    const {start,end}=boundaries();
    if(end>start&&video.currentTime>=end){video.pause();video.currentTime=start;$('togglePlay').textContent='▷ Reproduciraj';}
  });
  video.addEventListener('play',()=>{$('togglePlay').textContent='Ⅱ Pauziraj';});
  video.addEventListener('pause',()=>{$('togglePlay').textContent='▷ Reproduciraj';});
  $('togglePlay').addEventListener('click',async()=>{
    if(!file)return note('Prvo učitaj video.',true);
    if(!video.paused)video.pause();else {
      const {start,end}=boundaries();if(video.currentTime<start||video.currentTime>=end)await seek(start);
      video.play().catch(e=>note('Reprodukcija: '+e.message,true));
    }
  });
  $('jumpStart').addEventListener('click',()=>{if(file)seek(boundaries().start).catch(e=>note(e.message,true));});
  for(const id of ['clipStart','clipEnd'])$(id).addEventListener('change',()=>{
    const {start,end}=boundaries();
    $('clipStart').value=start.toFixed(1);$('clipEnd').value=end.toFixed(1);
    if(video.currentTime<start||video.currentTime>end)seek(start).catch(()=>{});
  });
  for(const key of Object.keys(state))$(key).addEventListener('input',e=>{state[key]=Number(e.target.value);updatePreview();});
  for(const id of ['grayscale','overlayText','textColor','textPos','speed'])$(id).addEventListener('input',updatePreview);
  const drop=$('drop');
  for(const ev of ['dragenter','dragover'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragover');});
  for(const ev of ['dragleave','drop'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragover');});
  drop.addEventListener('drop',e=>open(e.dataTransfer.files?.[0]));
  $('export').addEventListener('click',async()=>{
    try{await exportVideo();}catch(e){note('Izvoz nije uspio: '+e.message,true);$('progressBox').hidden=true;}
  });
  $('save').addEventListener('click',async()=>{
    try{
      if(!outputBlob)throw Error('Prvo izvezi video.');
      await StudioStore.save({blob:outputBlob,prompt:$('overlayText').value||file.name,model:'Video editor',mode:'local-video'});
      note('Video je spremljen u lokalnu galeriju AI Studija.');
    }catch(e){note(e.message,true);}
  });
  const id=new URLSearchParams(location.search).get('id');
  if(id&&window.StudioStore)StudioStore.get(id).then(item=>{
    if(item?.blob?.type.startsWith('video/'))open(new File([item.blob], 'galerija.'+item.ext,{type:item.mime}));
  }).catch(()=>{});
})();
