'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const root=process.env.NINJA_REPO||path.resolve(__dirname,'..');
const stage=process.env.NINJA_POSITION_STAGE||path.join(root,'server');
const builder=process.env.NINJA_POSITION_BUILDER||path.join(root,'tools/custom-weapons/import-weapon.py');
const math=require(path.join(stage,'weapon-position'));
const {metadata}=require(path.join(stage,'custom-weapons'));

function matrixFromSwf(file){
  const swf=fs.readFileSync(file),raw=swf.subarray(0,3).toString()==='CWS'?zlib.inflateSync(swf.subarray(8)):swf.subarray(8);
  function tags(bytes,start){const result=[];let i=start;while(i<bytes.length){const h=bytes.readUInt16LE(i);i+=2;let length=h&63;if(length===63){length=bytes.readUInt32LE(i);i+=4;}result.push({type:h>>6,data:bytes.subarray(i,i+length)});i+=length;if(h>>6===0)break;}return result;}
  const start=Math.ceil((5+4*(raw[0]>>3))/8)+4;
  const sprite=tags(raw,start).find(x=>x.type===39&&x.data.readUInt16LE(0)===2);
  const placement=tags(sprite.data,4).find(x=>x.type===26);let bit=5*8;
  function unsigned(n){let value=0;for(let j=0;j<n;j++,bit++)value=value*2+((placement.data[Math.floor(bit/8)]>>(7-bit%8))&1);return value;}
  function signed(n){const x=unsigned(n);return n&&x>=2**(n-1)?x-2**n:x;}
  let a=1,b=0,c=0,d=1;if(unsigned(1)){const n=unsigned(5);a=signed(n)/65536;d=signed(n)/65536;}if(unsigned(1)){const n=unsigned(5);b=signed(n)/65536;c=signed(n)/65536;}const n=unsigned(5),tx=signed(n)/20,ty=signed(n)/20;
  return {a,b,c,d,tx,ty};
}
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} should equal ${b}`);

test('dragging follows screen directions through rotated/mirrored character holders and preserves hand anchor',()=>{
  const holders=JSON.parse(fs.readFileSync(path.join(stage,'weapon-preview/rig.json'))).poses;
  for(const pose of Object.values(holders))for(const holder of Object.values(pose)){
    const delta=math.localDelta(holder,32,-17),zero=math.point(holder,{x:0,y:0}),moved=math.point(holder,delta);
    near(moved.x-zero.x,32);near(moved.y-zero.y,-17);
    const p={x:17.4,y:-38.2},roundtrip=math.point(math.inverse(holder),math.point(holder,p));near(roundtrip.x,p.x);near(roundtrip.y,p.y);
  }
});

test('invalid position fields are rejected, defaults preserve old imports, and flip axes remain independent',()=>{
  for(const input of [{offsetX:201},{offsetY:-201},{offsetX:'bad'},{rotation:181},{pivotX:-1}])assert.throws(()=>metadata({name:'Test',...input},9001));
  const defaults=metadata({name:'Test'},9001);assert.equal(defaults.offsetX,0);assert.equal(defaults.offsetY,0);assert.equal(defaults.flipX,false);assert.equal(defaults.flipY,false);
  const base=math.matrix(200,400,defaults),horizontal=math.matrix(200,400,{...defaults,flipX:true}),vertical=math.matrix(200,400,{...defaults,flipY:true});
  near(base.a,-horizontal.a);near(base.d,horizontal.d);near(base.a,vertical.a);near(base.d,-vertical.d);
});

test('Canvas placement matches generated SWF matrix for offsets, rotation, both flips and default placement',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ninja-position-matrix-'));
  try{
    const png=path.join(root,'tools/custom-weapons/obsidian-twin-claws/weapon.png'),bytes=fs.readFileSync(png),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    const settings=[{}, {offsetX:17.5,offsetY:-12.3,rotation:37,flipX:true}, {offsetX:-83.2,offsetY:99.8,rotation:-122,flipY:true,displayHeight:250}, {offsetX:200,offsetY:-200,rotation:180,flipX:true,flipY:true,pivotX:0.2,pivotY:0.4}];
    for(const [index,input]of settings.entries()){
      const config=metadata({name:'Matrix test',...input},9100+index),spec=path.join(temp,'spec.json');fs.writeFileSync(spec,JSON.stringify(config));
      execFileSync('python3',['-c',`import importlib.util,json,sys\nfrom pathlib import Path\nspec=importlib.util.spec_from_file_location('builder',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)\nmodule.build_asset(Path(sys.argv[2]),Path(sys.argv[3]),json.loads(Path(sys.argv[4]).read_text()),Path(sys.argv[5]))`,builder,root,png,spec,temp],{stdio:'pipe'});
      const actual=matrixFromSwf(path.join(temp,config.swfName+'.swf')),expected=math.matrix(width,height,config);
      for(const key of ['a','b','c','d','tx','ty'])near(actual[key],expected[key]);
      const grip=math.point(actual,{x:config.pivotX*width,y:config.pivotY*height});near(grip.x,config.offsetX,0.06);near(grip.y,config.offsetY,0.06);
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
