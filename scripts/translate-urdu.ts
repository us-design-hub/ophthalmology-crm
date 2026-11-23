import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { en,ur,type MessageKey } from "../src/lib/messages";

type Entry={source:string;sourceHash:string;translation:string;provider:"libretranslate-argos-en-ur";generatedAt:string;locked?:boolean};
type Catalogue={schemaVersion:1;language:"ur";provider:"libretranslate-argos-en-ur";entries:Partial<Record<MessageKey,Entry>>};
const output=resolve(process.cwd(),"src/lib/locales/ur.generated.json");
const hash=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");
const decode=(value:string)=>value.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(Number.parseInt(n,16))).replaceAll("&quot;",'"').replaceAll("&#39;", "'").replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&amp;","&");
const placeholders=(value:string)=>[...value.matchAll(/\{\{[^{}]+\}\}|\{[^{}]+\}|%\d*\$?[a-z]/gi)].map(match=>match[0]).sort();
const samePlaceholders=(source:string,translation:string)=>JSON.stringify(placeholders(source))===JSON.stringify(placeholders(translation));

async function catalogue():Promise<Catalogue>{
 const parsed=JSON.parse(await readFile(output,"utf8")) as Catalogue;
 if(parsed.schemaVersion!==1||parsed.language!=="ur"||!parsed.entries)throw new Error("The generated Urdu catalogue has an unsupported format");
 return parsed;
}
async function libreTranslate(endpoint:string,values:string[]):Promise<string[]>{
 const url=`${endpoint.replace(/\/$/,"")}/translate`;const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({q:values,source:"en",target:"ur",format:"text"})});
 if(!response.ok){const detail=await response.text();throw new Error(`LibreTranslate returned ${response.status}: ${detail.slice(0,300)}`);}
 const body=await response.json() as {translatedText?:string|string[]};const translated=body.translatedText;
 const translations=Array.isArray(translated)?translated:typeof translated==="string"?[translated]:[];
 if(translations.length!==values.length)throw new Error("LibreTranslate returned an incomplete batch");
 return translations.map(decode);
}
async function main(){
 loadEnvConfig(process.cwd());const checkOnly=process.argv.includes("--check");const current=await catalogue();
 const manual=new Set(Object.keys(ur));const keys=(Object.keys(en) as MessageKey[]).sort();const staleLocked:MessageKey[]=[];const pending:MessageKey[]=[];
 for(const key of keys){if(manual.has(key))continue;const source=en[key],existing=current.entries[key];if(!existing||existing.sourceHash!==hash(source)){if(existing?.locked)staleLocked.push(key);else pending.push(key);}}
 for(const key of Object.keys(current.entries) as MessageKey[])if(!(key in en)||manual.has(key))delete current.entries[key];
 const cached=keys.length-manual.size-pending.length-staleLocked.length;
 console.log(`Urdu catalogue: ${manual.size} manual, ${cached} generated, ${pending.length} missing or changed, ${staleLocked.length} locked and stale.`);
 if(staleLocked.length)console.error(`Review locked translations whose English source changed: ${staleLocked.join(", ")}`);
 if(checkOnly){if(pending.length||staleLocked.length)process.exitCode=1;return;}
 if(!pending.length){console.log("No Urdu translations need generation.");if(staleLocked.length)process.exitCode=1;return;}
 const endpoint=process.env.LIBRETRANSLATE_URL?.trim()||"http://127.0.0.1:5000";
 for(let offset=0;offset<pending.length;offset+=100){const batch=pending.slice(offset,offset+100),sources=batch.map(key=>en[key]);const translations=await libreTranslate(endpoint,sources);
  translations.forEach((translation,index)=>{const key=batch[index],source=en[key];if(!translation.trim())throw new Error(`LibreTranslate returned an empty translation for ${key}`);if(!samePlaceholders(source,translation))throw new Error(`Translation changed placeholders for ${key}`);current.entries[key]={source,sourceHash:hash(source),translation,provider:"libretranslate-argos-en-ur",generatedAt:new Date().toISOString()};});
  console.log(`Translated ${Math.min(offset+batch.length,pending.length)} of ${pending.length} messages.`);
 }
 current.entries=Object.fromEntries(Object.entries(current.entries).sort(([a],[b])=>a.localeCompare(b))) as Catalogue["entries"];
 await writeFile(output,`${JSON.stringify(current,null,2)}\n`,"utf8");console.log(`Saved Urdu translations to ${output}`);if(staleLocked.length)process.exitCode=1;
}
main().catch(error=>{console.error(`Urdu translation failed: ${error instanceof Error?error.message:"unknown error"}`);process.exitCode=1;});
