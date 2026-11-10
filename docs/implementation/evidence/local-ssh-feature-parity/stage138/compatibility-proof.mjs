import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import ts from '/workspace/superset-remix-parity/apps/desktop/node_modules/@typescript/typescript6/lib/typescript.js';
const root='/workspace/superset-remix-parity',base='c7b0f6e16',read=p=>readFileSync(root+'/'+p,'utf8'),old=p=>execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8'}),parse=s=>ts.createSourceFile('f.ts',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function shape(n){const children=[];ts.forEachChild(n,c=>{children.push(shape(c));});return[n.kind,ts.isVariableDeclarationList(n)?n.flags&(ts.NodeFlags.Const|ts.NodeFlags.Let):null,ts.isIdentifier(n)||ts.isLiteralExpression(n)?n.text:null,children];}
assert.notDeepEqual(shape(parse('const first=1;const last=2;')),shape(parse('const first=1;const last=3;')));assert.notDeepEqual(shape(parse('const first=1;')),shape(parse('let first=1;')));
const hook='apps/desktop/src/renderer/workstation/Workstation/hooks/useWorkspaceViews/useWorkspaceViews.ts',h=parse(read(hook));
const cleanHook=ts.transform(h,[ctx=>{const visit=n=>{
 if(ts.isImportDeclaration(n)&&n.moduleSpecifier.text.endsWith('/workspace-pane-area-layouts'))return undefined;
 if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==='savePaneLayouts'))return undefined;
 if(ts.isShorthandPropertyAssignment(n)&&n.name.text==='savePaneLayouts')return undefined;
 return ts.visitEachChild(n,visit,ctx);};return n=>ts.visitNode(n,visit);}]).transformed[0];assert.deepEqual(shape(cleanHook),shape(parse(old(hook))));
const edits='apps/desktop/src/renderer/workstation/Workstation/utils/workspace-pane-area-edits/workspace-pane-area-edits.ts',s=parse(read(edits));
const cleanEdits=ts.transform(s,[ctx=>{const visit=n=>{
 if(ts.isImportDeclaration(n)&&n.moduleSpecifier.text.endsWith('/workspace-pane-area-layouts'))return undefined;
 if((ts.isPropertySignature(n)||ts.isMethodSignature(n))&&['layoutTabIds','saveLayouts','onSettled'].includes(n.name.getText(s)))return undefined;
 if(ts.isPropertyAssignment(n)&&n.name.getText(s)==='hasWork')return undefined;
 if(ts.isExpressionStatement(n)&&ts.isBinaryExpression(n.expression)&&n.expression.left.getText(s)==='dispatching')return undefined;
 if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==='layoutTabIds'))return undefined;
 if(ts.isVariableDeclarationList(n)&&n.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==='dispatching'))return ts.factory.updateVariableDeclarationList(n,n.declarations.filter(d=>!(ts.isIdentifier(d.name)&&d.name.text==='dispatching')).map(d=>ts.visitNode(d,visit)));
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&n.right.getText(s)==='!layoutTabIds?.length')return ts.visitNode(n.left,visit);
 if(ts.isSpreadAssignment(n)&&n.expression.getText(s).includes('layoutTabIds'))return undefined;
 if(ts.isConditionalExpression(n)&&n.condition.getText(s).startsWith('options.saveLayouts'))return ts.visitNode(n.whenFalse,visit);
 if(ts.isIfStatement(n)&&n.expression.getText(s)==='!disposed'&&n.thenStatement.getText(s).includes('options.onSettled'))return undefined;
 return ts.visitEachChild(n,visit,ctx);};return n=>ts.visitNode(n,visit);}]).transformed[0];assert.deepEqual(shape(cleanEdits),shape(parse(old(edits))));
const byteEqual=['apps/desktop/src/renderer/workstation/Workstation/Workstation.tsx','apps/desktop/src/renderer/workstation/Workstation/components/WorkspaceWindow/WorkspaceWindow.tsx','apps/desktop/src/renderer/workstation/Workstation/components/WorkspaceWindow/components/PaneGrid/PaneGrid.tsx','apps/desktop/src/renderer/workstation/Workstation/components/RemoteTerminal/RemoteTerminal.tsx','apps/desktop/src/renderer/workstation/Workstation/utils/workspace-pane-areas/workspace-pane-areas.ts','apps/desktop/src/renderer/workstation/Workstation/utils/workspace-pane-areas/workspace-pane-areas-state.ts','apps/desktop/src/main/direct-app.ts','apps/desktop/src/preload/index.ts','apps/desktop/src/shared/workspace-view-v3.ts','packages/panes/src/core/store/store.ts'];for(const p of byteEqual)assert.equal(read(p),old(p),p);
const proof={base,fullAstTraversal:true,lastStatementMutationSmoke:true,constLetMutationSmoke:true,entireHookEqualAfterOnlyAddedLayoutWriterRemoved:true,entireEditQueueEqualAfterOptionalGeometryWriterAndStatusRemoved:true,byteEqual,scope:'Renderer-only optional layout batch writer and optional geometry dispatch. Old saves, IPC, model, store and root activation unchanged; no native/build acceptance.'};writeFileSync('/workspace/scratch/parity-138/compatibility-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
