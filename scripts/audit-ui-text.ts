import { readFile,readdir } from "node:fs/promises";
import { relative,resolve } from "node:path";
import ts from "typescript";

type Finding={file:string;line:number;text:string;kind:"jsx-text"|"attribute"|"expression"};
const roots=[resolve(process.cwd(),"src/app"),resolve(process.cwd(),"src/components")];
const visibleAttributes=new Set(["alt","aria-label","placeholder","title"]);
const normalize=(value:string)=>value.replace(/\s+/g," ").trim();
const visible=(value:string)=>/[A-Za-z]{2}/.test(value)&&!/^https?:\/\//.test(value);
async function files(directory:string):Promise<string[]>{const entries=await readdir(directory,{withFileTypes:true});const nested=await Promise.all(entries.map(entry=>entry.isDirectory()?files(resolve(directory,entry.name)):/\.tsx$/.test(entry.name)?[resolve(directory,entry.name)]:[]));return nested.flat();}
function location(source:ts.SourceFile,node:ts.Node){return source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;}
function scan(file:string,sourceText:string):Finding[]{const source=ts.createSourceFile(file,sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found:Finding[]=[];
 function add(node:ts.Node,value:string,kind:Finding["kind"]){const text=normalize(value);if(visible(text))found.push({file:relative(process.cwd(),file),line:location(source,node),text,kind});}
 function visit(node:ts.Node){
  if(ts.isJsxText(node))add(node,node.getText(source),"jsx-text");
  else if(ts.isJsxAttribute(node)&&visibleAttributes.has(node.name.getText(source))&&node.initializer){if(ts.isStringLiteral(node.initializer))add(node.initializer,node.initializer.text,"attribute");else if(ts.isJsxExpression(node.initializer)&&node.initializer.expression&&ts.isStringLiteralLike(node.initializer.expression))add(node.initializer.expression,node.initializer.expression.text,"attribute");}
  else if(ts.isJsxExpression(node)&&node.expression&&ts.isStringLiteralLike(node.expression))add(node.expression,node.expression.text,"expression");
  ts.forEachChild(node,visit);
 }
 visit(source);return found;
}
async function main(){const all=(await Promise.all((await Promise.all(roots.map(files))).flat().map(async file=>scan(file,await readFile(file,"utf8"))))).flat().sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
 if(!all.length){console.log("No literal interface text found outside the localization catalogue.");return;}
 for(const item of all)console.log(`${item.file}:${item.line} [${item.kind}] ${item.text}`);
 console.log(`\nFound ${all.length} literal interface strings. Move these into the English message catalogue so Urdu generation can cover them.`);
}
main().catch(error=>{console.error(`UI text audit failed: ${error instanceof Error?error.message:"unknown error"}`);process.exitCode=1;});
