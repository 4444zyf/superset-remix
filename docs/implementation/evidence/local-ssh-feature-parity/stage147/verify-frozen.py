from pathlib import Path
import json,hashlib,sys
root=Path('/workspace/superset-remix-parity');out=Path('/workspace/scratch/parity-147');dist=root/'apps/desktop/dist';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();product=json.loads((out/'product-snapshot.json').read_text());fixtures=json.loads((out/'fixture-snapshot.json').read_text());cli=json.loads((out/'source-cli-snapshot.json').read_text());assert {str(p.relative_to(dist)):sha(p) for p in dist.rglob('*') if p.is_file()}==product['files']
for p,d in {**fixtures,**cli}.items():assert sha(root/p)==d,p
cleanup=json.loads((out/sys.argv[1]/'owned-cleanup.json').read_text());assert cleanup['appExit']==(int(sys.argv[2]) if len(sys.argv)>2 else (1 if 'baseline' in sys.argv[1] else 0));assert cleanup['ownedXorgExit']==0;assert not Path('/tmp/.X11-unix/X175').exists()
proof={'case':sys.argv[1],'compiledSource':product['sourceCommit'],'compiledFiles':len(product['files']),'fixtureCount':len(fixtures),'sourceCliFiles':len(cli),'allUnchanged':True,'cleanup':cleanup};(out/(sys.argv[1]+'-frozen-proof.json')).write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
