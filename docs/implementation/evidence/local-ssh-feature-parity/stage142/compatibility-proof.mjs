import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import ts from '/workspace/superset-remix-parity/apps/desktop/node_modules/@typescript/typescript6/lib/typescript.js';
const root='/workspace/superset-remix-parity',base='9d1b7a348',read=p=>readFileSync(root+'/'+p,'utf8'),old=p=>execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8'}),parse=s=>ts.createSourceFile('f.ts',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function shape(n){const out=[];ts.forEachChild(n,c=>{out.push(shape(c));});return[n.kind,ts.isVariableDeclarationList(n)?n.flags&(ts.NodeFlags.Const|ts.NodeFlags.Let):null,ts.isIdentifier(n)||ts.isLiteralExpression(n)?n.text:null,out];}
assert.notDeepEqual(shape(parse('const a=1;const b=2')),shape(parse('const a=1;const b=3')));assert.notDeepEqual(shape(parse('const a=1')),shape(parse('let a=1')));
const hook='apps/desktop/src/renderer/workstation/Workstation/hooks/useWorkspaceViews/useWorkspaceViews.ts',runtime='apps/desktop/src/renderer/workstation/Workstation/utils/workstation-pane-runtime/workstation-pane-runtime.ts',controller='apps/desktop/src/renderer/workstation/Workstation/utils/workspace-pane-areas/workspace-pane-areas.ts';
function normalize(file,kind){return ts.transform(file,[ctx=>{const visit=n=>{
 if(kind==='hook'&&ts.isImportDeclaration(n)&&n.moduleSpecifier.text.endsWith('/workspace-browser-open-selection-v3'))return undefined;
 if(kind==='hook'&&ts.isPropertyAssignment(n)&&n.name.getText(file)==='acceptBrowserOpenAreas')return undefined;
 if(kind==='runtime'&&ts.isMethodSignature(n)&&n.name.getText(file)==='replaceAreas')return undefined;
 if(kind==='runtime'&&ts.isPropertyAssignment(n)&&n.name.getText(file)==='applyAreas')return undefined;
 if(kind==='controller'&&ts.isMethodDeclaration(n)&&n.name.getText(file)==='replaceAreasFromRuntime')return undefined;
 return ts.visitEachChild(n,visit,ctx);};return n=>ts.visitNode(n,visit);}]).transformed[0];}
for(const [p,kind] of [[hook,'hook'],[runtime,'runtime'],[controller,'controller']]) {
 const a=parse(old(p)),b=normalize(parse(read(p)),kind);
 assert.deepEqual(b.statements.filter(n=>!ts.isImportDeclaration(n)).map(shape),a.statements.filter(n=>!ts.isImportDeclaration(n)).map(shape),kind+' default body');
 const imports=f=>f.statements.filter(ts.isImportDeclaration).map(n=>[n.moduleSpecifier.text,n.importClause?.isTypeOnly??false,n.importClause?.namedBindings?.elements?.map(e=>e.name.text).sort()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 assert.deepEqual(imports(b),imports(a),kind+' same imports');
}
const renderer='apps/desktop/src/renderer/workstation/Workstation/hooks/useWorkstationBrowserOpen/workstation-browser-open-renderer.ts';
function decls(file){const out=new Map();function visit(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name))out.set(n.name.text,n);ts.forEachChild(n,c=>{visit(c);});}visit(file);return out;}
const da=decls(parse(old(renderer))),db=decls(parse(read(renderer))),same=['prepare','current','offEvent','offAvailability','ids','save'];for(const name of same)assert.deepEqual(shape(db.get(name)),shape(da.get(name)),name);
const byteEqual=['apps/desktop/src/main/direct-app.ts','apps/desktop/src/preload/index.ts','apps/desktop/src/shared/workspace-view-v3.ts','apps/desktop/src/shared/workstation-browser-open.ts','apps/desktop/src/renderer/workstation/Workstation/components/RemoteTerminal/RemoteTerminal.tsx','packages/panes/src/core/store/store.ts'];for(const p of byteEqual)assert.equal(read(p),old(p),p);
const proof={base,fullAstTraversal:true,lastStatementMutationSmoke:true,constLetMutationSmoke:true,oldHookRuntimeControllerBodiesEqualAfterOnlyOptionalMethodsRemoved:true,oldImportsPreserved:true,rendererDeclarationsAstEqual:same,byteEqual,scope:'Optional internal runtime full-state replacement and synchronous V3 receipt; wire APIs, old method bodies and old async acceptance remain. New regression proves canonical execution and subsequent user edit cancellation; no native/build acceptance.'};writeFileSync('/workspace/scratch/parity-142/compatibility-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
