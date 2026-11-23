'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=process.env.NINJA_REPO||path.resolve(__dirname,'..');
const stage=process.env.NINJA_ANIMATION_STAGE||root;
const WA=require(path.join(stage,'server/weapon-animation'));
const {createWeaponImporter,decodeImage,metadata}=require(path.join(stage,'server/custom-weapons'));
const {createWeaponImporterRoutes}=require(path.join(stage,'server/weapon-importer-http'));
const fixtures=path.join(__dirname,'fixtures/weapon-animation');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const gif=fs.readFileSync(path.join(fixtures,'disposal-2.gif'));
const image='data:image/gif;base64,'+gif.toString('base64');

test('GIF compositing matches independently decoded reference pixels, timing, local palettes and interlacing',()=>{
  const expected=JSON.parse(fs.readFileSync(path.join(fixtures,'expected.json')));
  for(const [name,reference]of Object.entries(expected)){
    const decoded=WA.decodeGIF(fs.readFileSync(path.join(fixtures,name)));
    assert.equal(decoded.width,reference.width);assert.equal(decoded.height,reference.height);
    assert.deepEqual(decoded.frames.map(frame=>frame.delay),reference.delays,name);
    assert.deepEqual(decoded.frames.map(frame=>hash(frame.rgba)),reference.hashes,name);
    assert.equal(decoded.duration,reference.delays.reduce((a,b)=>a+b));
  }
  assert.ok(decodeImage(image).equals(gif));
});
function tinyGIF(count,delay=2){
  const header=Buffer.from('47494638396101000100800000000000ffffff','hex');
  const control=Buffer.from([0x21,0xf9,4,0,delay&255,delay>>8,0,0]);
  const frame=Buffer.from('2c0000000001000100000202440100','hex');
  return Buffer.concat([header,...Array.from({length:count},()=>Buffer.concat([control,frame])),Buffer.from([0x3b])]);
}
test('truncated, excessive and invalid GIFs are rejected before any import, and speed is bounded',()=>{
  assert.throws(()=>WA.decodeGIF(gif.subarray(0,gif.length-2)),/terpotong|lengkap/);
  assert.throws(()=>WA.decodeGIF(tinyGIF(121)),/120 frame/);
  assert.throws(()=>WA.decodeGIF(tinyGIF(61,50)),/30 detik/);
  const huge=tinyGIF(1);huge.writeUInt16LE(1025,6);assert.throws(()=>WA.decodeGIF(huge),/1024/);
  const corrupt=Buffer.from(gif);corrupt.fill(0,0,6);assert.throws(()=>WA.decodeGIF(corrupt),/tidak valid/);
  assert.throws(()=>decodeImage('data:image/png;base64,'+gif.toString('base64')),/sesuai/);
  for(const speed of [0,-1,4.1,'bad'])assert.throws(()=>metadata({name:'Test',animationSpeed:speed},9002));
  for(const speed of [0.25,0.5,1,1.5,2,4])assert.equal(metadata({name:'Test',animationSpeed:speed},9002).animationSpeed,speed);
});
test('variable frame timing and speed use the same integer millisecond clock as the SWF',()=>{
  const delays=[40,90,170,300];
  assert.deepEqual([0,39,40,129,130,299,300,599,600].map(t=>WA.frameAt(t,delays)),[0,0,1,1,2,2,3,3,0]);
  assert.deepEqual([0,19,20,64,65,149,150,299,300].map(t=>WA.frameAt(t,delays,2)),[0,0,1,1,2,2,3,3,0]);
  assert.equal(WA.frameAt(60,[90,100],1.5),1);assert.equal(WA.frameAt(127,[90,100],1.5),0);
});
function tags(bytes,start){
  const out=[];let i=start;while(i<bytes.length){const header=bytes.readUInt16LE(i);i+=2;let n=header&63;if(n===63){n=bytes.readUInt32LE(i);i+=4;}out.push({type:header>>6,data:bytes.subarray(i,i+n)});i+=n;if(header>>6===0)break;}return out;
}
function swfTags(bytes){const raw=bytes.subarray(0,3).toString()==='CWS'?zlib.inflateSync(bytes.subarray(8)):bytes.subarray(8);return tags(raw,Math.ceil((5+4*(raw[0]>>3))/8)+4);}
function fixture(){
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),'ninja-animated-weapon-'));
  for(const dir of ['server','tools/custom-weapons/obsidian-twin-claws','web/cdn/swf/latest/swf/items','web/cdn/swf/latest/swf/language'])fs.mkdirSync(path.join(repo,dir),{recursive:true});
  fs.symlinkSync(path.join(root,'tools/ffdec'),path.join(repo,'tools/ffdec'));
  for(const name of ['import-weapon.py','hand-weapon.as'])fs.copyFileSync(path.join(stage,'tools/custom-weapons',name),path.join(repo,'tools/custom-weapons',name));
  fs.copyFileSync(path.join(stage,'server/weapon-animation.js'),path.join(repo,'server/weapon-animation.js'));
  const items='web/cdn/swf/latest/swf/items';
  for(const name of fs.readdirSync(path.join(root,items)).filter(name=>name==='wpn_895.swf'||/^wpn_(9\d{3}|\d{5,})\.swf$/.test(name)))fs.copyFileSync(path.join(root,items,name),path.join(repo,items,name));
  for(const name of ['weapon.png','weapon-data.json'])fs.copyFileSync(path.join(root,'tools/custom-weapons/obsidian-twin-claws',name),path.join(repo,'tools/custom-weapons/obsidian-twin-claws',name));
  const catalog=path.join(repo,'web/cdn/swf/latest/swf/language/data_library_en.swf');fs.copyFileSync(path.join(root,'web/cdn/swf/latest/swf/language/data_library_en.swf'),catalog);
  const character={character_id:'1',name:'Tester',level:20,weapons:['1'],equip:{weapon:'wpn1'},gold:500};
  const api={listCharacters:()=>[character],getActiveId:()=> '1',updateCharacter(id,change){if(id!=='1')return null;change(character);return{character};}};
  return {repo,catalog,character,api,service:createWeaponImporter(repo,api),cleanup:()=>fs.rmSync(repo,{recursive:true,force:true})};
}
async function complete(service,job){const deadline=Date.now()+90000;while(job.state==='building'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,100));job=service.status(job.id);}assert.equal(job.state,'success',job.message);return job;}
test('animated GIF imports as a multi-frame SWF, keeps its source, grants correctly and edits speed/position without changing the catalog',async()=>{
  const f=fixture();try{
    const before=hash(fs.readFileSync(f.catalog)),character=structuredClone(f.character);
    const job=await complete(f.service,f.service.start({name:'Animated Saber',image,level:1,animationSpeed:2,offsetX:12,rotation:25}));
    const weapon=job.weapon;assert.equal(weapon.sourceFormat,'gif');assert.equal(weapon.frameCount,4);assert.equal(weapon.durationMs,600);assert.equal(weapon.animationSpeed,2);
    assert.notEqual(hash(fs.readFileSync(f.catalog)),before);assert.deepEqual(f.character,character);
    const folder=path.join(f.repo,'tools/custom-weapons/imports',weapon.id),asset=path.join(f.repo,'web/cdn/swf/latest/swf/items',weapon.swfName+'.swf');
    assert.ok(fs.readFileSync(path.join(folder,'weapon.gif')).equals(gif));
    assert.equal(fs.readFileSync(path.join(folder,'weapon.png')).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const built=swfTags(fs.readFileSync(asset)),sprite=built.find(x=>x.type===39&&x.data.readUInt16LE(0)===3);
    assert.equal(sprite.data.readUInt16LE(2),4);assert.equal(tags(sprite.data,4).filter(x=>x.type===1).length,4);
    assert.equal(built.filter(x=>x.type===21).length,5);assert.ok(built.some(x=>x.type===76&&x.data.includes(Buffer.from('weapon\0'))));
    f.service.grant('1',weapon.id,true);assert.ok(f.character.weapons.includes(weapon.id.slice(3)));assert.equal(f.character.equip.weapon,weapon.id);assert.equal(f.character.gold,500);
    const savedCatalog=hash(fs.readFileSync(f.catalog)),savedCharacter=structuredClone(f.character),oldAsset=hash(fs.readFileSync(asset));
    await complete(f.service,f.service.start({editWeaponId:weapon.id,animationSpeed:0.5,offsetX:-22,rotation:90}));
    assert.equal(hash(fs.readFileSync(f.catalog)),savedCatalog);assert.notEqual(hash(fs.readFileSync(asset)),oldAsset);assert.deepEqual(f.character,savedCharacter);
    assert.ok(fs.readFileSync(path.join(folder,'weapon.gif')).equals(gif));
    const stored=f.service.list().find(x=>x.id===weapon.id);assert.equal(stored.animationSpeed,0.5);assert.equal(stored.offsetX,-22);assert.equal(stored.frameCount,4);
    const route=createWeaponImporterRoutes(f.repo,f.api),response={writeHead(code,headers){this.code=code;this.headers=headers;},end(data){this.data=data;}};
    assert.equal(route({url:'/trainer/weapons/preview/'+weapon.id+'.gif',method:'GET'},response),true);
    assert.equal(response.code,200);assert.equal(response.headers['Content-Type'],'image/gif');assert.ok(response.data.equals(gif));
    response.data=null;route({url:'/trainer/weapons/preview/'+weapon.id+'.png',method:'GET'},response);assert.equal(response.headers['Content-Type'],'image/png');
    assert.equal(route({url:'/trainer/weapons/preview/../../characters.json',method:'GET'},response),false);
    const priorAsset=fs.readFileSync(asset),priorSpec=fs.readFileSync(path.join(folder,'weapon-data.json')),registry=path.join(f.repo,'server/custom-weapons.json'),priorRegistry=fs.readFileSync(registry);
    const rename=fs.renameSync;let fail=true;
    try{
      fs.renameSync=function(from,to){if(to===registry&&fail){fail=false;throw new Error('Animated registry failure');}return rename.call(fs,from,to);};
      let failed=f.service.start({editWeaponId:weapon.id,animationSpeed:4,offsetX:100});
      const deadline=Date.now()+90000;while(failed.state==='building'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
      assert.equal(failed.state,'error');assert.match(failed.message,/Animated registry failure/);
      assert.ok(fs.readFileSync(asset).equals(priorAsset));assert.ok(fs.readFileSync(path.join(folder,'weapon-data.json')).equals(priorSpec));assert.ok(fs.readFileSync(registry).equals(priorRegistry));
      assert.ok(fs.readFileSync(path.join(folder,'weapon.gif')).equals(gif));assert.equal(hash(fs.readFileSync(f.catalog)),savedCatalog);assert.deepEqual(f.character,savedCharacter);
    }finally{fs.renameSync=rename;}
  }finally{f.cleanup();}
});
