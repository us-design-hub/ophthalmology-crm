import "server-only";

const table=(()=>{const values:number[]=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;values[n]=c>>>0;}return values;})();
function crc32(buffer:Buffer){let crc=0xffffffff;for(const byte of buffer)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function safeName(value:string){return value.replace(/[\\/:*?"<>|\x00-\x1f]/g,"_").replace(/^\.+/,"").slice(0,140)||"document";}
export function createZip(files:{name:string;content:Buffer}[]){
 const locals:Buffer[]=[];const centrals:Buffer[]=[];let offset=0;const used=new Set<string>();
 for(const file of files){let name=safeName(file.name),counter=1;while(used.has(name))name=`${counter++}-${safeName(file.name)}`;used.add(name);const filename=Buffer.from(name,"utf8"),crc=crc32(file.content);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(file.content.length,18);local.writeUInt32LE(file.content.length,22);local.writeUInt16LE(filename.length,26);locals.push(local,filename,file.content);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(file.content.length,20);central.writeUInt32LE(file.content.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);centrals.push(central,filename);offset+=local.length+filename.length+file.content.length;
 }
 const centralSize=centrals.reduce((sum,item)=>sum+item.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,...centrals,end]);
}
