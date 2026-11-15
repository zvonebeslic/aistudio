import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root=path.resolve('docs');
const pages=['index.html','editor.html','video.html'];
const scripts=['app.js','cloud.js','storage.js','photo-editor.js','video-editor.js'];
test('All GitHub Pages scripts parse as JavaScript',()=>{
  for(const name of scripts){
    const result=spawnSync(process.execPath,['--check',path.join(root,name)],{encoding:'utf8'});
    assert.equal(result.status,0,name+' syntax error: '+result.stderr);
  }
});
test('Public HTML loads local assets and never points to root CSS/JS',async()=>{
  for(const name of pages){
    const text=await readFile(path.join(root,name),'utf8');
    assert.match(text,/<title>.*<\/title>/s,name);
    const assets=[...text.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map(match=>match[1]);
    assert.ok(assets.length>2,name+' has no assets');
    for(const asset of assets)await access(path.resolve(root,asset));
    assert.doesNotMatch(text,/(?:src|href)="\/(?:app|style|cloud|storage|tools|photo-editor|video-editor)/);
  }
});
test('GitHub Pages has working editor controls, gallery and Gemini connection',async()=>{
  const index=await readFile(path.join(root,'index.html'),'utf8');
  for(const id of ['geminiBrowserKey','connectGemini','geminiBrowserStatus','generatorForm','galleryGrid'])assert.ok(index.includes('id="'+id+'"'),id);
  assert.ok(index.includes('href="./editor.html"'));
  assert.ok(index.includes('href="./video.html"'));
  const editor=await readFile(path.join(root,'editor.html'),'utf8');
  for(const id of ['photoCanvas','file','sliders','undo','redo','download','save'])assert.ok(editor.includes('id="'+id+'"'),id);
  const video=await readFile(path.join(root,'video.html'),'utf8');
  for(const id of ['clipStart','clipEnd','speed','export','resultVideo'])assert.ok(video.includes('id="'+id+'"'),id);
});
test('Session-only API key is not persisted or hardcoded in Pages',async()=>{
  const code=await readFile(path.join(root,'cloud.js'),'utf8');
  assert.match(code,/let apiKey=''/);
  assert.doesNotMatch(code,/(?:localStorage|sessionStorage|document\.cookie)\s*[\.\[]/);
  assert.doesNotMatch(code,/AIza[\w-]{30,}/);
});
