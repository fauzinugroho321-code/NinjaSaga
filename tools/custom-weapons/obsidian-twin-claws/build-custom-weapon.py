"""Build wpn9000 and add only its catalog entry, without recompiling core libraries.
Usage: python3 build-custom-weapon.py REPO SPRITE.png OUTPUT_DIRECTORY
Needs Java and the repo's FFDec. Source weapon.as must sit beside this script.
"""
import copy, hashlib, json, struct, subprocess, sys, zlib
from pathlib import Path
import xml.etree.ElementTree as ET

BASE_GETTER = bytes.fromhex('d030d0661f668d0148')
WEAPON = {
    'id':'wpn9000', 'name':'Obsidian Twin Claws', 'gold':0, 'crystal':0,
    'prestige':0, 'pvp_point':0, 'merit':0, 'sellable':False,
    'damage':180, 'rarity':5, 'swfName':'wpn_9000',
    'description':'A matching pair of obsidian claws. One blade follows each hand.',
    'level':20, 'premium':False, 'agility':0, 'dodge':0, 'critical':0,
    'vendor':False, 'animation':'attack_10', 'expiry_hour':0,
    'expiry_group_id':0, 'effect':[], 'extra_effect':None,
    'forge_material':{'material':''}, 'forge_base':0, 'forge_group_id':0,
    'development':0, 'relate_set':'', 'hash':''
}

class Bits:
    def __init__(self): self.bits = ''
    def put(self, v, n): self.bits += format(v & ((1 << n)-1), '0%db' % n) if n else ''
    def data(self):
        s=self.bits+'0'*((-len(self.bits))%8)
        return bytes(int(s[i:i+8],2) for i in range(0,len(s),8))

def signed_bits(values): return max(abs(int(x)).bit_length()+1 for x in values)
def rect(x0,x1,y0,y1):
    b=Bits(); n=signed_bits((x0,x1,y0,y1)); b.put(n,5)
    for x in (x0,x1,y0,y1): b.put(x,n)
    return b.data()
def matrix(a=1,d=1,tx=0,ty=0,b=0,c=0):
    o=Bits(); scale=a!=1 or d!=1; o.put(int(scale),1)
    if scale:
        vals=(round(a*65536),round(d*65536));n=signed_bits(vals);o.put(n,5)
        for v in vals:o.put(v,n)
    rot=b!=0 or c!=0;o.put(int(rot),1)
    if rot:
        vals=(round(b*65536),round(c*65536));n=signed_bits(vals);o.put(n,5)
        for v in vals:o.put(v,n)
    n=signed_bits((tx,ty));o.put(n,5);o.put(tx,n);o.put(ty,n)
    return o.data()
def tag(code,payload=b''):
    n=len(payload)
    return struct.pack('<H',(code<<6)|min(n,63))+(struct.pack('<I',n) if n>=63 else b'')+payload

def read_tags(raw):
    body=zlib.decompress(raw[8:]) if raw[:3]==b'CWS' else raw[8:]
    pos=(5+4*(body[0]>>3)+7)//8+4; head=body[:pos]; tags=[]
    while pos<len(body):
        h=struct.unpack_from('<H',body,pos)[0];pos+=2;n=h&63
        if n==63:n=struct.unpack_from('<I',body,pos)[0];pos+=4
        tags.append((h>>6,body[pos:pos+n]));pos+=n
        if h>>6==0:break
    return head,tags

def place(cid,depth,mat=b'\x00',name=None):
    flags=6 | (32 if name else 0)
    return tag(26,bytes([flags])+struct.pack('<HH',depth,cid)+mat+(name.encode()+b'\0' if name else b''))
def sprite(cid,tags):return tag(39,struct.pack('<HH',cid,1)+b''.join(tags)+tag(1)+tag(0))
def rectangle_shape(cid,w,h,bitmap=None,color=None):
    fill=bytes([0x41])+struct.pack('<H',bitmap)+matrix(20,20) if bitmap is not None else b'\0'+bytes(color)
    s=Bits();s.put(1,4);s.put(0,4)
    s.put(0,1);s.put(5,5);s.put(1,5);s.put(0,1);s.put(0,1);s.put(1,1)
    for dx,dy in ((w,0),(0,h),(-w,0),(0,-h)):
        n=max(2,signed_bits((dx,dy)));s.put(1,1);s.put(1,1);s.put(n-2,4);s.put(0,1);s.put(int(dx==0),1);s.put(dy if dx==0 else dx,n)
    s.put(0,6)
    return tag(32,struct.pack('<H',cid)+rect(0,w,0,h)+b'\1'+fill+b'\0'+s.data())
def swf(body):return b'CWS'+bytes([15])+struct.pack('<I',len(body)+8)+zlib.compress(body,9)

def build_asset(repo,png,out,run):
    raw=png.read_bytes();assert raw[:8]==b'\x89PNG\r\n\x1a\n'
    w,h=struct.unpack('>II',raw[16:24]);assert raw[25]==6,'RGBA source required'
    _,donor=read_tags((repo/'web/cdn/swf/latest/swf/items/wpn_895.swf').read_bytes())
    abc=[tag(c,d) for c,d in donor if c==82];assert len(abc)==1
    # Reuse only the two generic MovieClip linkage classes, never donor art.
    tags=[tag(69,struct.pack('<I',9)),tag(9,b'\x55\x55\x55'),tag(21,struct.pack('<H',10)+raw)]
    tags += [rectangle_shape(1,w*20,h*20,bitmap=10)]
    tags += [sprite(6,[place(1,1,matrix())])]
    tags += [sprite(2,[place(6,1,matrix(.065,.065,-1153,-1280),'rightBlade'),place(6,2,matrix(.065,.065,-1153,-140),'leftBlade')])]
    tags += [rectangle_shape(4,2000,2000,color=(95,65,31,255))]
    tags += [sprite(5,[place(4,1,matrix(tx=-1000,ty=-2000)),place(6,2,matrix(.05,.05,-887,-1950)),place(6,3,matrix(.05,.05,-887,-950))])]
    tags += abc
    tags += [tag(76,struct.pack('<H',2)+struct.pack('<H',5)+b'icon\0'+struct.pack('<H',2)+b'weapon\0'),tag(1),tag(0)]
    base=out/'wpn_9000-base.swf';base.write_bytes(swf(rect(-1400,1400,-2000,1000)+struct.pack('<HH',24*256,1)+b''.join(tags)))
    run('-onerror','abort','-replace',base,out/'wpn_9000.swf','weapon',Path(__file__).with_name('weapon.as'))

def u30(n):
    b=[]
    while True:
        x=n&127;n>>=7;b.append(x|(128 if n else 0))
        if not n:return bytes(b)

def catalog_body(root):
    for abc in root.findall('.//abc'):
        c=abc.find('constants');strings=[x.text or '' for x in c.find('constant_string')];m=c.find('constant_multiname')
        def name(i):return strings[int(m[int(i)].get('name_index','0'))]
        for instance in abc.find('instance_info'):
            if name(instance.get('name_index'))!='DataLibraryEN':continue
            trait=next(t for t in instance.iter() if t.get('method_info') and t.get('name_index') and name(t.get('name_index'))=='getWeapon')
            return abc,next(b for b in abc.find('bodies') if b.get('method_info')==trait.get('method_info'))
    raise AssertionError('Catalog getter missing')

def build_catalog(repo,out,run):
    original=repo/'web/cdn/swf/latest/swf/language/data_library_en.swf'
    run('-swf2xml',original,out/'catalog-before.xml')
    tree=ET.parse(out/'catalog-before.xml');root=tree.getroot();abc,body=catalog_body(root)
    assert bytes.fromhex(body.get('codeBytes'))==BASE_GETTER,'Unexpected or already patched getter'
    c=abc.find('constants');strings=c.find('constant_string');names=c.find('constant_multiname')
    string_index={x.text or '':i for i,x in enumerate(strings)}
    assert 'wpn9000' not in string_index,'Reserved ID is already used'
    def string(value):
        if value not in string_index:
            string_index[value]=len(strings);ET.SubElement(strings,'item').text=value
        return string_index[value]
    def push(value):
        if value is None:return b'\x20'
        if value is True:return b'\x26'
        if value is False:return b'\x27'
        if isinstance(value,str):return b'\x2c'+u30(string(value))
        if isinstance(value,int):return b'\x25'+u30(value)
        if isinstance(value,list):return b''.join(push(x) for x in value)+b'\x56'+u30(len(value))
        if isinstance(value,dict):return b''.join(push(k)+push(v) for k,v in value.items())+b'\x55'+u30(len(value))
        raise TypeError(value)
    public_ns=next(i for i,x in enumerate(c.find('constant_namespace')) if x.get('kind')=='22' and (strings[int(x.get('name_index','0'))].text or '')=='')
    qname=len(names);ET.SubElement(names,'item',type='Multiname',kind='7',name_index=str(string('wpn9000')),namespace_index=str(public_ns),namespace_set_index='0',qname_index='0')
    code=BASE_GETTER[:-1]+b'\x2a'+push(WEAPON)+b'\x61'+u30(qname)+b'\x48'
    body.set('codeBytes',code.hex());body.set('max_stack',str(len(WEAPON)*2+8))
    tree.write(out/'catalog-patched.xml',encoding='utf-8',xml_declaration=True)
    run('-xml2swf',out/'catalog-patched.xml',out/'data_library_en.swf')
    run('-swf2xml',out/'data_library_en.swf',out/'catalog-verified.xml')
    before=ET.parse(out/'catalog-before.xml').getroot();after=ET.parse(out/'catalog-verified.xml').getroot()
    old_abcs=before.findall('.//abc');new_abcs=after.findall('.//abc');assert len(old_abcs)==len(new_abcs)
    differences=0
    for a,b in zip(old_abcs,new_abcs):
        for x,y in zip(a.find('bodies'),b.find('bodies')):
            if x.get('codeBytes')!=y.get('codeBytes'):
                assert x.get('method_info')==body.get('method_info')
                assert bytes.fromhex(y.get('codeBytes'))==code
                differences+=1;x.set('codeBytes',y.get('codeBytes'));x.set('max_stack',y.get('max_stack'))
        for key in ('constant_string','constant_multiname'):
            old=a.find('constants').find(key);new=b.find('constants').find(key)
            assert all(ET.tostring(x).strip()==ET.tostring(y).strip() for x,y in zip(old,new)),key
            for extra in list(new)[len(old):]:new.remove(extra)
        for node in (a,b):
            for el in node.iter():
                el.attrib.pop('fileOffset',None)
                el.tail = None
                if el.text is not None and not el.text.strip(): el.text = None
        assert ET.tostring(a)==ET.tostring(b),'Unrelated catalog ABC changed'
    assert differences==1
    (out/'weapon-data.json').write_text(json.dumps(WEAPON,indent=2)+'\n')
    print('Verified: only DataLibraryEN.getWeapon changed; existing catalog untouched.')

def main():
    repo,png,out=map(Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=True)
    def run(*args):
        subprocess.run(['java','-Djava.awt.headless=true','-Duser.home=/private/tmp','-Xmx1g','-jar',str(repo/'tools/ffdec/ffdec.jar')]+[str(x) for x in args],check=True)
    build_asset(repo,png,out,run);build_catalog(repo,out,run)
    for name in ('wpn_9000.swf','data_library_en.swf'):print(name,hashlib.sha256((out/name).read_bytes()).hexdigest())
if __name__=='__main__':main()
