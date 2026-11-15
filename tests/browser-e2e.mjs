import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ROOT=process.cwd(); // Test the same root index.html that users edit, just like KvizToGo
const TYPES={'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(relative.includes('..')){res.writeHead(400).end('Bad path');return;}
  const local=join(ROOT,relative==='/'?'index.html':relative);
  try{
    const bytes=await readFile(local);
    res.setHeader('Content-Type',TYPES[extname(local)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    res.end(bytes);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
const errors=[];
const recordErrors=page=>{
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());});
};
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({acceptDownloads:true});
  const page=await context.newPage();
  recordErrors(page);
  await page.goto(base+'/',{waitUntil:'load'});
  await page.locator('#pageTitle').waitFor({state:'visible'});
  assert.match(await page.title(),/Zvone AI Studio/);
  await page.locator('[data-tab="edit"]').click();
  assert.match(await page.locator('#breadcrumb').textContent(),/Uredi fotografiju/);
  await page.locator('[data-tab="settings"]').click();
  assert.equal(await page.locator('#geminiBrowserKey').isVisible(),true);
  await page.locator('[data-tab="gallery"]').click();
  assert.equal(await page.locator('#galleryGrid').isVisible(),true);

  await page.goto(base+'/editor.html',{waitUntil:'load'});
  await page.locator('#photoCanvas').waitFor({state:'attached'});
  const dataUrl=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=160;c.height=100;
    const ctx=c.getContext('2d');ctx.fillStyle='#c48354';ctx.fillRect(0,0,160,100);
    ctx.fillStyle='#2244dd';ctx.fillRect(30,20,40,60);
    return c.toDataURL('image/png');
  });
  const buffer=Buffer.from(dataUrl.split(',')[1],'base64');
  await page.locator('#file').setInputFiles({name:'test-image.png',mimeType:'image/png',buffer});
  await page.locator('#photoCanvas').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#photoCanvas').width===160);
  await page.locator('#rotateR').click();
  await page.waitForFunction(()=>document.querySelector('#photoCanvas').width===100);
  await page.locator('#presetWarm').click();
  await page.locator('#overlayText').fill('PROVJERA');
  await page.locator('#overlayText').dispatchEvent('change');
  const downloadPromise=page.waitForEvent('download',{timeout:10000});
  await page.locator('#download').click();
  const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/zvone-studio-.*\.png/);
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('galeriju'));
  await page.goto(base+'/',{waitUntil:'load'});
  await page.locator('[data-tab="gallery"]').click();
  const galleryCard=page.locator('.gallery-card');
  await galleryCard.first().waitFor({state:'visible'});
  assert.ok(await galleryCard.count()>=1);
  const editLink=galleryCard.first().locator('a').filter({hasText:'Lokalni editor'});
  await editLink.click();
  await page.locator('#photoCanvas').waitFor({state:'visible'});
  assert.equal(await page.locator('#photoCanvas').isVisible(),true);

  await page.goto(base+'/video.html',{waitUntil:'load'});
  assert.equal(await page.locator('#export').isVisible(),true);
  const videoBase64=await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=160;c.height=90;
    const ctx=c.getContext('2d');
    const stream=c.captureStream(15);
    const mime=['video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)return '';
    const rec=new MediaRecorder(stream,{mimeType:mime});
    const parts=[];
    rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
    const stopped=new Promise(resolve=>rec.onstop=resolve);
    rec.start();
    let frame=0;
    const timer=setInterval(()=>{
      ctx.fillStyle=frame%2?'#3377bb':'#cc9966';ctx.fillRect(0,0,c.width,c.height);frame++;
    },65);
    await new Promise(resolve=>setTimeout(resolve,1250));
    clearInterval(timer);rec.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(parts,{type:'video/webm'});
    return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(blob);});
  });
  assert.ok(videoBase64.length>100,'video fixture generation failed');
  await page.locator('#file').setInputFiles({name:'sample.webm',mimeType:'video/webm',buffer:Buffer.from(videoBase64,'base64')});
  await page.waitForFunction(()=>document.querySelector('#durationLabel').textContent.includes('Ukupno:'),{timeout:10000});
  assert.ok(Number(await page.locator('#clipEnd').inputValue())>0);
  await page.locator('#overlayText').fill('TEST VIDEO');
  await page.locator('#export').click();
  try { await page.locator('#exportResult').waitFor({state:'visible',timeout:16000}); }
  catch {
    throw Error('Video export did not complete: '+await page.locator('#message').textContent());
  }
  assert.equal(await page.locator('#downloadResult').isVisible(),true);
  // Stub Google at the HTTP boundary. This verifies the complete user flow
  // without pretending that an external provider/account was paid or enabled.
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    const method=route.request().method();
    if(method==='OPTIONS'){
      await route.fulfill({status:204,headers:{
        'access-control-allow-origin':'*',
        'access-control-allow-methods':'GET,POST,OPTIONS',
        'access-control-allow-headers':'content-type,x-goog-api-key'
      }});
      return;
    }
    const isVideo=route.request().postData()?.includes('gemini-omni-1.2-flash');
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'access-control-allow-origin':'*'},
      body:JSON.stringify({
        id:'mockinteraction123',status:'completed',
        ...(isVideo ? {output_video:{data:videoBase64,mime_type:'video/webm'}}
          : {output_image:{data:buffer.toString('base64'),mime_type:'image/png'}})
      })});
  });
  await page.goto(base+'/',{waitUntil:'load'});
  await page.locator('[data-tab="settings"]').click();
  await page.locator('#geminiBrowserKey').fill('AIza-test-key-only-for-browser-smoke-12345678');
  await page.locator('#connectGemini').click();
  assert.match(await page.locator('#geminiBrowserStatus').textContent(),/Ključ je aktivan/);
  await page.locator('[data-tab="image"]').click();
  await page.locator('#promptInput').fill('Planina u zalasku sunca, široki kadar');
  await page.locator('#generateBtn').click();
  await page.locator('#finishedResult').waitFor({state:'visible',timeout:12000});
  await page.locator('[data-tab="gallery"]').click();
  assert.ok(await page.locator('.gallery-card').count()>=2);
  await page.locator('[data-tab="video"]').click();
  await page.locator('#promptInput').fill('Planinski pejzaž snimljen dronom');
  await page.locator('#generateBtn').click();
  await page.locator('#finishedResult video').waitFor({state:'visible',timeout:12000});
  await page.locator('[data-tab="gallery"]').click();
  assert.ok(await page.locator('.gallery-card').count()>=3);
  assert.deepEqual(errors,[],'Browser runtime errors');
  console.log('PASS: home, modes, photo editor, video editor, gallery and mocked AI image/video generation UI.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
