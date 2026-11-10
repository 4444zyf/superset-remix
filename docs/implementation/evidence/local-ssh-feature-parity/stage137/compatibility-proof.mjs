import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from '/workspace/superset-remix-parity/apps/desktop/node_modules/@typescript/typescript6/lib/typescript.js';
const root='/workspace/superset-remix-parity', base='1d91425cc';
const read=p=>readFileSync(root+'/'+p,'utf8'), old=p=>execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8'});
const parse=s=>ts.createSourceFile('proof.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function shape(n) {
 if(ts.isParenthesizedExpression(n))return shape(n.expression);
 if(ts.isJsxText(n)&&!n.text.trim())return null;
 const children=[];ts.forEachChild(n,c=>{const x=shape(c);if(x!==null)children.push(x);});
 return [n.kind,ts.isVariableDeclarationList(n)?n.flags&(ts.NodeFlags.Const|ts.NodeFlags.Let):null,ts.isIdentifier(n)||ts.isLiteralExpression(n)||ts.isJsxText(n)?n.text:null,children];
}
assert.notDeepEqual(shape(parse('const a=1;const b=2;')),shape(parse('const a=1;const b=3;')));
assert.notDeepEqual(shape(parse('const a=1;')),shape(parse('let a=1;')));
function nodes(n,p){const out=[];function visit(n){if(p(n))out.push(n);ts.forEachChild(n,c=>{visit(c);});}visit(n);return out;}
const grid='apps/desktop/src/renderer/workstation/Workstation/components/WorkspaceWindow/components/PaneGrid/PaneGrid.tsx',a=parse(old(grid)),b=parse(read(grid));
const fn=s=>s.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PaneGrid');
const declarations=s=>fn(s).body.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]);
const da=declarations(a),db=declarations(b), same=[];
const changed=['store','groupPanes','groupLayout','groupSize','renderPane','definition','paneActions','contextMenuActions'];
for(const n of da){const name=n.name.getText(a);if(changed.includes(name))continue;const next=db.find(n=>n.name.getText(b)===name);assert.ok(next,name);assert.deepEqual(shape(next),shape(n),name);same.push(name);}
const norm=n=>ts.transform(n,[ctx=>{const visit=n=>{
 if(ts.isIfStatement(n)&&n.expression.getText(b)==='controlledStore')return undefined;
 if(ts.isIfStatement(n)&&n.expression.getText(b)==='controlled')return ts.visitNode(n.elseStatement,visit);
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.BarBarToken&&n.left.getText(b)==='controlledStore')return ts.visitNode(n.right,visit);
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&n.right.getText(b)==='(controlled?.active ?? true)')return ts.visitNode(n.left,visit);
 if(ts.isIdentifier(n)&&n.text==='grouped')return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('workspace'),'paneTabs');
 if(ts.isArrayLiteralExpression(n))return ts.factory.updateArrayLiteralExpression(n,n.elements.filter(e=>!(ts.isIdentifier(e)&&e.text==='controlledStore')).map(e=>ts.visitNode(e,visit)));
 if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='newTerminal')return ts.factory.createVoidExpression(ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('actions'),'newTerminal'),undefined,[ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('workspace'),'workspaceId'),...n.arguments]));
 return ts.visitEachChild(n,visit,ctx);
 };return n=>ts.visitNode(n,visit);}]).transformed[0];
for(const name of ['store','groupPanes','groupLayout','groupSize','renderPane','paneActions','contextMenuActions']) {
 const before=da.find(n=>n.name.getText(a)===name),after=db.find(n=>n.name.getText(b)===name);
 // The optional focus branch adds a block around the original single expression.
 let x=norm(after);
 if(name==='renderPane')x=ts.transform(x,[ctx=>{const visit=n=>{
 if(ts.isArrowFunction(n)&&ts.isBlock(n.body)&&n.body.statements.length===1&&ts.isBlock(n.body.statements[0]))return ts.factory.updateArrowFunction(n,n.modifiers,n.typeParameters,n.parameters,n.type,n.equalsGreaterThanToken,n.body.statements[0]);
 return ts.visitEachChild(n,visit,ctx);};return n=>ts.visitNode(n,visit);}]).transformed[0];
 assert.deepEqual(shape(x),shape(before),name+' optional branches');
}
const ae=fn(a).body.statements.filter(ts.isExpressionStatement),be=fn(b).body.statements.filter(ts.isExpressionStatement);assert.equal(be.length,ae.length);
for(let i=0;i<ae.length;i++) {
 let n=norm(be[i]);
 if(i===3) { // First persistence useEffect now returns its original subscription from a guarded block.
  n=ts.transform(n,[ctx=>{const visit=n=>{
   if(ts.isArrowFunction(n)&&ts.isBlock(n.body)&&n.body.statements.length===1&&ts.isReturnStatement(n.body.statements[0]))return ts.factory.updateArrowFunction(n,n.modifiers,n.typeParameters,n.parameters,n.type,n.equalsGreaterThanToken,n.body.statements[0].expression);
   return ts.visitEachChild(n,visit,ctx);};return n=>ts.visitNode(n,visit);}]).transformed[0];
 }
 assert.deepEqual(shape(n),shape(ae[i]),'effect '+i);
}
const move='apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneAreaMoveActions/usePaneAreaMoveActions.tsx';
const named=(s,name)=>s.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
assert.deepEqual(shape(named(parse(old(move)),'usePaneAreaMoveActions').body),shape(named(parse(read(move)),'usePaneAreaMoveActions').body));
const area='apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/RightPaneArea/RightPaneArea.tsx',ca=parse(old(area)),cb=parse(read(area));
const workspace=nodes(ca,n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ca)==='Workspace')[0];
const props=nodes(cb,n=>ts.isJsxAttribute(n)&&n.name.getText(cb)==='workspaceProps')[0].initializer.expression;
const propValue=p=>ts.isShorthandPropertyAssignment(p)?p.name:p.initializer;
for(const attr of workspace.attributes.properties) {
 const name=attr.name.text;if(name==='renderTabBarTrailing')continue;
 const prop=props.properties.find(p=>p.name.text===name);assert.ok(prop,name);assert.deepEqual(shape(propValue(prop)),shape(attr.initializer.expression),name);
}
const originalHeader=nodes(ca,n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>p.name?.text==='className'&&p.initializer?.text==='flex items-center gap-1 pr-1'))[0];
const nextHeader=nodes(cb,n=>ts.isJsxAttribute(n)&&n.name.text==='headerControls')[0].initializer.expression;
assert.deepEqual(originalHeader.children.map(shape).filter(x=>x!==null),nextHeader.children.map(shape).filter(x=>x!==null));
const byteEqual=[
'apps/desktop/src/renderer/workstation/Workstation/Workstation.tsx',
'apps/desktop/src/renderer/workstation/Workstation/components/WorkspaceWindow/WorkspaceWindow.tsx',
'apps/desktop/src/renderer/workstation/Workstation/components/WorkspaceWindow/components/WorkspacePaneView/WorkspacePaneView.tsx',
'apps/desktop/src/renderer/workstation/Workstation/components/RemoteTerminal/RemoteTerminal.tsx',
'apps/desktop/src/renderer/workstation/Workstation/hooks/useWorkspaceViews/useWorkspaceViews.ts',
'apps/desktop/src/main/direct-app.ts',
'apps/desktop/src/preload/index.ts',
'packages/panes/src/core/store/store.ts',
];
for(const p of byteEqual)assert.equal(read(p),old(p),p);
const result={base,fullAstTraversal:true,lastStatementMutationSmoke:true,constLetMutationSmoke:true,unchangedDeclarations:same,normalizedOptionalDeclarations:['store','groupPanes','groupLayout','groupSize','renderPane','paneActions','contextMenuActions'],oldEffectsPreserved:ae.length,originalMoveHookBodyEqual:true,originalRightAreaWorkspacePropsAndHeaderChildrenEqual:true,byteEqual,scope:'Controlled grid seam only; root and paired V3 runtime are not activated. Fresh source checks, no build, no native acceptance, no CLI binary, no installer or Actions.'};
writeFileSync('/workspace/scratch/parity-137/compatibility-proof.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
