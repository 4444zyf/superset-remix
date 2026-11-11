from pathlib import Path
import hashlib,json,subprocess,re
root=Path('/workspace/superset-remix-parity');out=Path('/workspace/scratch/parity-147');dist=root/'apps/desktop/dist';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
compiled=subprocess.check_output(['git','rev-parse','1df4f741b'],cwd=root,text=True).strip();fixture=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True)
files={str(p.relative_to(dist)):sha(p) for p in sorted(dist.rglob('*')) if p.is_file()};assert files
(out/'product-snapshot.json').write_text(json.dumps({'sourceCommit':compiled,'files':files},indent=2)+'\n')
mjs={str(p.relative_to(root)):sha(p) for p in sorted((root/'apps/desktop/scripts').glob('*.mjs'))};(out/'fixture-snapshot.json').write_text(json.dumps(mjs,indent=2)+'\n')
paths=subprocess.check_output(['git','ls-files','packages','lingui.config.ts','bun.lock'],cwd=root,text=True).splitlines();graph={p:sha(root/p) for p in paths if (root/p).is_file()};graph.update({str(p.relative_to(root)):sha(p) for p in (root/'packages/i18n/locales').glob('*/messages.ts')});(out/'source-cli-snapshot.json').write_text(json.dumps(graph,indent=2)+'\n')
requires=re.findall(r'\brequire\(["\x27]([^"\x27]+)["\x27]\)',(dist/'preload/index.js').read_text());assert requires==['electron'],requires
proof={'compiledSource':compiled,'fixtureSource':fixture,'compiledFiles':len(files),'allTopLevelMjs':len(mjs),'sourceCliFiles':len(graph),'manifestSha256':sha(out/'product-snapshot.json'),'preloadRequires':requires,'newDesktopSourceBuild':True,'bundledCliPresent':(dist/'resources/bin/superset').exists(),'bundledCliRebuilt':False,'installer':False,'githubActions':False,'electronVersion':'41.10.7','electronAbi':'145'};(out/'product-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
