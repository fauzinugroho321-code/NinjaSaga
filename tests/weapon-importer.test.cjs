'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.NINJA_REPO || path.resolve(__dirname, '..');
const stage = process.env.NINJA_IMPORT_STAGE || path.join(root, 'server');
const builder = process.env.NINJA_IMPORT_BUILDER || path.join(root, 'tools/custom-weapons/import-weapon.py');
const { createWeaponImporter, metadata, decodeImage } = require(path.join(stage, 'custom-weapons'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const png = fs.readFileSync(path.join(root, 'tools/custom-weapons/obsidian-twin-claws/weapon.png'));
const image = 'data:image/png;base64,' + png.toString('base64');
// Keep the fixture assets consistent with the copied live catalog as custom weapons grow.
const customAssets = fs.readdirSync(path.join(root, 'web/cdn/swf/latest/swf/items')).filter(name => /^wpn_([9]\d{3}|\d{5,})\.swf$/.test(name));
const FIRST_NUM = Math.max(8999, ...customAssets.map(name => Number(name.match(/\d+/)[0]))) + 1;
const SECOND_NUM = FIRST_NUM + 1;

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ninja-weapon-tool-test-'));
  for (const dir of ['server','tools/custom-weapons/obsidian-twin-claws','web/cdn/swf/latest/swf/items','web/cdn/swf/latest/swf/language']) fs.mkdirSync(path.join(repo,dir),{recursive:true});
  fs.symlinkSync(path.join(root,'tools/ffdec'),path.join(repo,'tools/ffdec'));
  fs.copyFileSync(builder,path.join(repo,'tools/custom-weapons/import-weapon.py'));
  fs.copyFileSync(path.join(path.dirname(builder),'hand-weapon.as'),path.join(repo,'tools/custom-weapons/hand-weapon.as'));
  for(const name of ['wpn_895.swf',...customAssets])fs.copyFileSync(path.join(root,'web/cdn/swf/latest/swf/items',name),path.join(repo,'web/cdn/swf/latest/swf/items',name));
  for(const name of ['weapon-data.json','weapon.png'])fs.copyFileSync(path.join(root,'tools/custom-weapons/obsidian-twin-claws',name),path.join(repo,'tools/custom-weapons/obsidian-twin-claws',name));
  const catalog=path.join(repo,'web/cdn/swf/latest/swf/language/data_library_en.swf');fs.copyFileSync(path.join(root,'web/cdn/swf/latest/swf/language/data_library_en.swf'),catalog);
  const characters={1:{character_id:'1',name:'First',level:1,xp:0,gold:300,token:8,weapons:['2'],equip:{weapon:'wpn2'},skills:['1']},4:{character_id:'4',name:'Second',level:20,xp:79000,gold:530,token:41,weapons:['1596'],equip:{weapon:'wpn1',bodySet:'set2124',backItem:'back778',jutsu:['1','2']},skills:['3'],allTalentsMode:true}};
  const api={listCharacters:()=>Object.values(characters),getActiveId:()=> '4',updateCharacter(id,callback){if(!characters[id]||characters[id].deletedAt)return null;const result=callback(characters[id]);if(result===false)return null;fs.writeFileSync(path.join(repo,'server/characters.json'),JSON.stringify(characters));return {character:characters[id],result};}};
  return {repo,catalog,characters,api,service:createWeaponImporter(repo,api),cleanup:()=>fs.rmSync(repo,{recursive:true,force:true})};
}
async function completed(service,job){const deadline=Date.now()+90000;while(job.state==='building'&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,100));job=service.status(job.id);}assert.notEqual(job.state,'building','Import should finish');return job;}

test('validates metadata and PNG and preserves the existing weapon and selected character on grants',()=>{
  const f=fixture();try{
    for(const input of [{name:''},{name:'x',damage:-1},{name:'x',damage:32768},{name:'x',level:0},{name:'x',pivotX:2},{name:'x',animation:'../../x'}])assert.throws(()=>metadata(input,9001));
    for(const value of [null,'','data:text/html;base64,AAAA','data:image/png;base64,AAAA'])assert.throws(()=>decodeImage(value));
    assert.ok(decodeImage(image).equals(png));
    const before=structuredClone(f.characters);f.service.grant('4','wpn9000',true);
    assert.deepEqual(f.characters[4].weapons,['1596','9000','1']);assert.equal(f.characters[4].equip.weapon,'wpn9000');
    const once=structuredClone(f.characters[4]);f.service.grant('4','wpn9000',true);assert.deepEqual(f.characters[4],once);
    assert.deepEqual(f.characters[1],before[1]);
    for(const key of ['xp','gold','token','level','skills','allTalentsMode'])assert.deepEqual(f.characters[4][key],before[4][key]);
    assert.throws(()=>f.service.grant('1','wpn9000',true),/Level/);assert.deepEqual(f.characters[1],before[1]);
    f.service.grant('1','wpn9000');assert.deepEqual(f.characters[1].weapons,['2','9000']);assert.equal(f.characters[1].equip.weapon,'wpn2');
    assert.throws(()=>f.service.grant('1','wpn1'));assert.throws(()=>f.service.grant('999','wpn9000'));
  }finally{f.cleanup();}
});

test('two sequential real imports preserve prior catalog entries, create icon/weapon assets and grant only the requested character',async()=>{
  const f=fixture();try{
    const legacyAsset=hash(path.join(f.repo,'web/cdn/swf/latest/swf/items/wpn_9000.swf'));
    const oldCatalog=hash(f.catalog);
    const first=f.service.start({name:'Integration First',image,damage:250,level:1,pivotX:0.25,pivotY:0.9,rotation:20});
    assert.throws(()=>f.service.start({name:'Concurrent',image}),/sedang berjalan/);
    assert.equal((await completed(f.service,first)).state,'success',first.message);
    assert.equal(first.weapon.id,('wpn'+FIRST_NUM));assert.notEqual(hash(f.catalog),oldCatalog);
    const second=await completed(f.service,f.service.start({name:'Integration Second',image,damage:700,level:20}));
    assert.equal(second.state,'success',second.message);assert.equal(second.weapon.id,('wpn'+SECOND_NUM));
    assert.deepEqual(f.service.list().map(x=>x.id),['wpn9000',('wpn'+FIRST_NUM),('wpn'+SECOND_NUM)]);
    assert.equal(hash(path.join(f.repo,'web/cdn/swf/latest/swf/items/wpn_9000.swf')),legacyAsset);
    for(const id of [String(FIRST_NUM),String(SECOND_NUM)]){const bytes=fs.readFileSync(path.join(f.repo,'web/cdn/swf/latest/swf/items/wpn_'+id+'.swf'));assert.equal(bytes.toString('ascii',0,3),'CWS');assert.ok(bytes.length>100);}
    const saved=JSON.parse(fs.readFileSync(path.join(f.repo,'server/custom-weapons.json'),'utf8'));assert.equal(saved.length,3);
    const reloaded=createWeaponImporter(f.repo,f.api);f.service.grant('4',('wpn'+SECOND_NUM),false);
    assert.equal(f.characters[4].equip.weapon,'wpn1');assert.ok(f.characters[4].weapons.includes(String(SECOND_NUM)));assert.ok(!f.characters[1].weapons.includes(String(SECOND_NUM)));
    assert.ok(JSON.parse(fs.readFileSync(path.join(f.repo,'server/characters.json'),'utf8'))[4].weapons.includes(String(SECOND_NUM)));
    assert.equal(reloaded.list()[1].name,'Integration First');
    const backups=fs.readdirSync(path.join(f.repo,'backups/custom-weapon-imports'));assert.equal(backups.length,2);
    for(const dir of backups)assert.ok(fs.existsSync(path.join(f.repo,'backups/custom-weapon-imports',dir,'manifest.json')));
  }finally{f.cleanup();}
});

test('a corrupt PNG fails without changing the catalog, registry or character saves',async()=>{
  const f=fixture();try{
    const before=hash(f.catalog),original=structuredClone(f.characters),broken=Buffer.from(png);broken[40]^=255;
    const job=await completed(f.service,f.service.start({name:'Broken PNG',image:'data:image/png;base64,'+broken.toString('base64')}));
    assert.equal(job.state,'error');assert.equal(hash(f.catalog),before);assert.deepEqual(f.characters,original);
    assert.ok(!fs.existsSync(path.join(f.repo,'web/cdn/swf/latest/swf/items/wpn_'+FIRST_NUM+'.swf')));assert.ok(!fs.existsSync(path.join(f.repo,'server/custom-weapons.json')));
  }finally{f.cleanup();}
});

test('a registry save failure restores the old catalog and removes the partial weapon asset',async()=>{
  const f=fixture(),rename=fs.renameSync;try{
    const before=hash(f.catalog),original=structuredClone(f.characters),registry=path.join(f.repo,'server/custom-weapons.json');
    let fail=true;fs.renameSync=function(from,to){if(to===registry&&fail){fail=false;throw new Error('Simulated registry write failure');}return rename.call(fs,from,to);};
    const job=await completed(f.service,f.service.start({name:'Commit failure',image}));
    assert.equal(job.state,'error');assert.match(job.message,/Simulated/);assert.equal(hash(f.catalog),before);assert.deepEqual(f.characters,original);
    assert.ok(!fs.existsSync(path.join(f.repo,'web/cdn/swf/latest/swf/items/wpn_'+FIRST_NUM+'.swf')));assert.ok(!fs.existsSync(registry));
    assert.ok(!fs.existsSync(path.join(f.repo,'tools/custom-weapons/imports/wpn'+FIRST_NUM)));assert.deepEqual(f.service.list().map(x=>x.id),['wpn9000']);
  }finally{fs.renameSync=rename;f.cleanup();}
});

test('repositioning keeps weapon ID, inventory and catalog intact and restores the previous position if a save fails',async()=>{
  const f=fixture(),rename=fs.renameSync;try{
    const first=await completed(f.service,f.service.start({name:'Positionable',image,damage:444,level:1}));assert.equal(first.state,'success',first.message);
    const oldCatalog=hash(f.catalog),sourceImage=hash(path.join(f.repo,'tools/custom-weapons/imports/wpn'+FIRST_NUM+'/weapon.png'));
    f.service.grant('4',('wpn'+FIRST_NUM));const characters=structuredClone(f.characters);
    const result=await completed(f.service,f.service.start({editWeaponId:('wpn'+FIRST_NUM),offsetX:28.1,offsetY:-4.7,rotation:68,flipX:true,displayHeight:85,name:'Ignored',damage:9999}));
    assert.equal(result.state,'success',result.message);assert.equal(result.operation,'position');assert.equal(hash(f.catalog),oldCatalog);
    let weapon=f.service.list().find(x=>x.id===('wpn'+FIRST_NUM));assert.equal(weapon.name,'Positionable');assert.equal(weapon.damage,444);assert.equal(weapon.offsetX,28.1);assert.equal(weapon.offsetY,-4.7);assert.equal(weapon.flipX,true);
    assert.deepEqual(f.characters,characters);assert.equal(hash(path.join(f.repo,'tools/custom-weapons/imports/wpn'+FIRST_NUM+'/weapon.png')),sourceImage);
    const asset=path.join(f.repo,'web/cdn/swf/latest/swf/items/wpn_'+FIRST_NUM+'.swf'),priorAsset=hash(asset),priorSpec=fs.readFileSync(path.join(f.repo,'tools/custom-weapons/imports/wpn'+FIRST_NUM+'/weapon-data.json'));
    const registry=path.join(f.repo,'server/custom-weapons.json');let fail=true;fs.renameSync=function(from,to){if(to===registry&&fail){fail=false;throw new Error('Position save failed');}return rename.call(fs,from,to);};
    const failed=await completed(f.service,f.service.start({editWeaponId:('wpn'+FIRST_NUM),offsetX:99}));assert.equal(failed.state,'error');assert.equal(hash(asset),priorAsset);assert.equal(hash(f.catalog),oldCatalog);
    assert.ok(fs.readFileSync(path.join(f.repo,'tools/custom-weapons/imports/wpn'+FIRST_NUM+'/weapon-data.json')).equals(priorSpec));
    weapon=f.service.list().find(x=>x.id===('wpn'+FIRST_NUM));assert.equal(weapon.offsetX,28.1);assert.deepEqual(f.characters,characters);
    assert.throws(()=>f.service.start({editWeaponId:'wpn9000',offsetX:20}),/tidak mendukung/);
  }finally{fs.renameSync=rename;f.cleanup();}
});
