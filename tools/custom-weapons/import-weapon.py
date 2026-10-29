"""Compile a PNG weapon and append one catalog entry; writes only to staging.
python3 import-weapon.py REPO IMAGE.png METADATA.json OUTPUT_DIRECTORY
"""
import hashlib, json, math, struct, subprocess, sys, zlib
from pathlib import Path
import xml.etree.ElementTree as ET
BASE_GETTER = bytes.fromhex('d030d0661f668d01')
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
        count=math.ceil(max(abs(dx),abs(dy))/60000)
        for i in range(count):
            x=round(dx*(i+1)/count)-round(dx*i/count);y=round(dy*(i+1)/count)-round(dy*i/count)
            n=max(2,signed_bits((x,y)));s.put(1,1);s.put(1,1);s.put(n-2,4);s.put(0,1);s.put(int(x==0),1);s.put(y if x==0 else x,n)
    s.put(0,6)
    return tag(32,struct.pack('<H',cid)+rect(0,w,0,h)+b'\1'+fill+b'\0'+s.data())
def swf(body):return b'CWS'+bytes([15])+struct.pack('<I',len(body)+8)+zlib.compress(body,9)

def validate_png(raw):
    assert raw[:8]==b'\x89PNG\r\n\x1a\n', 'PNG tidak valid.'
    pos=8;compressed=[];header=None;ended=False
    while pos+12<=len(raw):
        length=struct.unpack_from('>I',raw,pos)[0];kind=raw[pos+4:pos+8]
        end=pos+8+length
        assert end+4<=len(raw), 'PNG terpotong.'
        data=raw[pos+8:end]
        assert zlib.crc32(kind+data)&0xffffffff==struct.unpack_from('>I',raw,end)[0], 'CRC PNG tidak valid.'
        if kind==b'IHDR':
            assert header is None and length==13
            header=struct.unpack('>IIBBBBB',data)
        if kind==b'IDAT':compressed.append(data)
        if kind==b'IEND':ended=True;break
        pos=end+4
    assert header and ended and compressed, 'PNG tidak lengkap.'
    w,h,depth,color,compression,filtering,interlace=header
    assert 1<=w<=4096 and 1<=h<=4096 and (depth,color,compression,filtering,interlace)==(8,6,0,0,0), 'PNG harus RGBA 8-bit tanpa interlace.'
    expected=h*(w*4+1)
    inflater=zlib.decompressobj();pixels=inflater.decompress(b''.join(compressed),expected+1)
    assert inflater.eof and len(pixels)==expected and not inflater.unconsumed_tail, 'Isi PNG tidak valid.'
    assert all(pixels[y*(w*4+1)]<=4 for y in range(h)), 'Filter PNG tidak valid.'
    return w,h


def build_asset(repo, image, metadata, out):
    raw=image.read_bytes()
    w,h=validate_png(raw)
    _,donor=read_tags((repo/'web/cdn/swf/latest/swf/items/wpn_895.swf').read_bytes())
    abc=[tag(c,d) for c,d in donor if c==82]
    assert len(abc)==1
    # Generic weapon/icon classes have no frame scripts or core dependencies.
    height=metadata['displayHeight'];scale=min(height/h,350/w)
    angle=math.radians(metadata['rotation']);cosine=math.cos(angle)*scale;sine=math.sin(angle)*scale
    sx=-1 if metadata.get('flipX',False) else 1;sy=-1 if metadata.get('flipY',False) else 1
    a=cosine*sx;b=sine*sx;c=-sine*sy;d=cosine*sy;px=metadata['pivotX']*w;py=metadata['pivotY']*h
    tx=round(20*(metadata.get('offsetX',0)-a*px-c*py));ty=round(20*(metadata.get('offsetY',0)-b*px-d*py))
    tags=[tag(69,struct.pack('<I',9)),tag(9,b'\x55\x55\x55'),tag(21,struct.pack('<H',10)+raw)]
    tags += [rectangle_shape(1,w*20,h*20,bitmap=10)]
    tags += [sprite(2,[place(1,1,matrix(a,d,tx,ty,b,c))])]
    # Gear's icon is 100 x 100 game units, independent of hand pivot and rotation.
    icon_scale=min(90/w,90/h)
    tags += [sprite(5,[place(1,1,matrix(icon_scale,icon_scale,round((100-w*icon_scale)*10),round((100-h*icon_scale)*10)))])]
    tags += abc
    tags += [tag(76,struct.pack('<H',2)+struct.pack('<H',5)+b'icon\0'+struct.pack('<H',2)+b'weapon\0'),tag(1),tag(0)]
    asset=out/(metadata['swfName']+'.swf')
    base=out/(metadata['swfName']+'-base.swf')
    base.write_bytes(swf(rect(-2000,2000,-4000,2000)+struct.pack('<HH',24*256,1)+b''.join(tags)))
    subprocess.run(['java','-Djava.awt.headless=true','-Duser.home=/private/tmp','-Xmx1g','-jar',str(repo/'tools/ffdec/ffdec.jar'),'-onerror','abort','-replace',str(base),str(asset),'weapon',str(Path(__file__).with_name('hand-weapon.as'))],check=True)
    _,built=read_tags(asset.read_bytes())
    linkage=next(data for code,data in built if code==76)
    assert b'icon\0' in linkage and b'weapon\0' in linkage


def u30(n):
    result=[]
    while True:
        part=n&127;n>>=7;result.append(part|(128 if n else 0))
        if not n:return bytes(result)


def catalog_body(root):
    for abc in root.findall('.//abc'):
        constants=abc.find('constants')
        strings=[x.text or '' for x in constants.find('constant_string')]
        names=constants.find('constant_multiname')
        def name(i):return strings[int(names[int(i)].get('name_index','0'))]
        for instance in abc.find('instance_info'):
            if name(instance.get('name_index'))!='DataLibraryEN':continue
            trait=next(x for x in instance.iter() if x.get('method_info') and x.get('name_index') and name(x.get('name_index'))=='getWeapon')
            return abc,next(x for x in abc.find('bodies') if x.get('method_info')==trait.get('method_info'))
    raise ValueError('DataLibraryEN.getWeapon tidak ditemukan.')


def build_catalog(repo, metadata, out, run):
    source=repo/'web/cdn/swf/latest/swf/language/data_library_en.swf'
    run('-swf2xml',source,out/'catalog-before.xml')
    tree=ET.parse(out/'catalog-before.xml');abc,body=catalog_body(tree.getroot())
    original=bytes.fromhex(body.get('codeBytes'))
    assert original.startswith(BASE_GETTER) and original.endswith(b'\x48'), 'Format katalog tidak dikenali; katalog lama dipertahankan.'
    constants=abc.find('constants');strings=constants.find('constant_string');names=constants.find('constant_multiname')
    indexes={x.text or '':i for i,x in enumerate(strings)}
    assert metadata['id'] not in indexes, 'ID senjata sudah ada dalam katalog.'
    def string(value):
        if value not in indexes:
            indexes[value]=len(strings);ET.SubElement(strings,'item').text=value
        return indexes[value]
    def push(value):
        if value is None:return b'\x20'
        if value is True:return b'\x26'
        if value is False:return b'\x27'
        if isinstance(value,str):return b'\x2c'+u30(string(value))
        if isinstance(value,int):return b'\x25'+u30(value)
        if isinstance(value,list):return b''.join(push(x) for x in value)+b'\x56'+u30(len(value))
        if isinstance(value,dict):return b''.join(push(k)+push(v) for k,v in value.items())+b'\x55'+u30(len(value))
        raise TypeError(value)
    ns=next(i for i,x in enumerate(constants.find('constant_namespace')) if x.get('kind')=='22' and (strings[int(x.get('name_index','0'))].text or '')=='')
    qname=len(names)
    ET.SubElement(names,'item',type='Multiname',kind='7',name_index=str(string(metadata['id'])),namespace_index=str(ns),namespace_set_index='0',qname_index='0')
    # Keep every existing custom entry; append one assignment before returnvalue.
    weapon={k:v for k,v in metadata.items() if k not in ('displayHeight','pivotX','pivotY','rotation','offsetX','offsetY','flipX','flipY')}
    code=original[:-1]+b'\x2a'+push(weapon)+b'\x61'+u30(qname)+b'\x48'
    body.set('codeBytes',code.hex());body.set('max_stack',str(max(int(body.get('max_stack')),len(weapon)*2+8)))
    tree.write(out/'catalog-patched.xml',encoding='utf-8',xml_declaration=True)
    run('-xml2swf',out/'catalog-patched.xml',out/'data_library_en.swf')
    run('-swf2xml',out/'data_library_en.swf',out/'catalog-after.xml')
    before=ET.parse(out/'catalog-before.xml').getroot();after=ET.parse(out/'catalog-after.xml').getroot()
    old_abcs=before.findall('.//abc');new_abcs=after.findall('.//abc');assert len(old_abcs)==len(new_abcs)
    changes=0
    for old,new in zip(old_abcs,new_abcs):
        assert len(old.find('bodies'))==len(new.find('bodies'))
        for x,y in zip(old.find('bodies'),new.find('bodies')):
            if x.get('codeBytes')!=y.get('codeBytes'):
                assert x.get('method_info')==body.get('method_info') and bytes.fromhex(y.get('codeBytes'))==code
                changes+=1;x.set('codeBytes',y.get('codeBytes'));x.set('max_stack',y.get('max_stack'))
        for key in ('constant_string','constant_multiname'):
            a=old.find('constants').find(key);b=new.find('constants').find(key)
            assert len(a)<=len(b)
            assert all(ET.tostring(x).strip()==ET.tostring(y).strip() for x,y in zip(a,b))
            for added in list(b)[len(a):]:b.remove(added)
        for node in (old,new):
            for element in node.iter():
                element.attrib.pop('fileOffset',None);element.tail=None
                if element.text is not None and not element.text.strip():element.text=None
        assert ET.tostring(old)==ET.tostring(new), 'Bytecode lain berubah; impor dibatalkan.'
    assert changes==1
    print('VERIFY: previous weapon getter code retained; unrelated ABC unchanged.',flush=True)


def main():
    repo,image,spec,out=map(Path,sys.argv[1:5]);out.mkdir(parents=True,exist_ok=True)
    asset_only=len(sys.argv)>5 and sys.argv[5]=='--asset-only'
    metadata=json.loads(spec.read_text())
    assert metadata['id'].startswith('wpn') and metadata['id'][3:].isdigit()
    assert metadata['swfName']=='wpn_'+metadata['id'][3:]
    def run(*args):
        subprocess.run(['java','-Djava.awt.headless=true','-Duser.home=/private/tmp','-Xmx1g','-jar',str(repo/'tools/ffdec/ffdec.jar')]+list(map(str,args)),check=True)
    print('BUILD: weapon/icon',flush=True);build_asset(repo,image,metadata,out)
    if not asset_only:
        print('BUILD: catalog',flush=True);build_catalog(repo,metadata,out,run)
    (out/'weapon-data.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print('DONE',flush=True)

if __name__=='__main__':main()
