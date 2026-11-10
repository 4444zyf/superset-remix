from pathlib import Path
import json,gzip,shutil,hashlib,re
root=Path('/workspace/superset-remix-parity');src=Path('/workspace/scratch/parity-143');out=root/'docs/implementation/evidence/local-ssh-feature-parity/stage143';out.mkdir(exist_ok=False)
def copy(a,b):
 b.parent.mkdir(parents=True,exist_ok=True)
 if a.suffix in ['.log','.txt','.ndjson']:
  b=Path(str(b)+'.gz');b.write_bytes(gzip.compress(a.read_bytes(),mtime=0))
 else:shutil.copyfile(a,b)
for name in ['source-build-first.log','electron-runtime-install-proxy.log','sqlite-electron-prebuild.log','native-module-first.log','native-module-ready.log','ssh-fixture-syntax.log','fixture-commit.log','fixture-push.log','plugins-before-fixture.log','local-first-launch.log','ssh-first-launch.log','verification-first.log','product-snapshot.json','product-proof.json','fixture-snapshot.json','source-cli-snapshot.json','after-local-proof.json','final-verification.json','freeze.py','native.py','verify.py']:
 copy(src/name,out/name)
copy(Path('/workspace/scratch/electron-runtime-install.log'),out/'electron-runtime-install-first.log')
screens={'browser-entry.png','browser-navigation-cli-background-terminal.png','browser-cdp-reopened.png','restore-three-panes-before.png','restore-normal-quit.png','restore-force-quit.png'}
for name in ['local-first','ssh-first']:
 case=src/name
 for file in ['native.log','owned-cleanup.json','xorg.log','xorg-launch.log']:copy(case/file,out/name/file)
 for p in (case/'app').iterdir():
  if p.is_file() and (p.suffix in ['.json','.txt','.ndjson','.log'] or p.name in screens):copy(p,out/name/'app'/p.name)
patterns=[rb'cdp1(?:\.|%2[eE])[0-9]{1,16}(?:\.|%2[eE])[a-f0-9]{32}',rb'-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----',rb'gh[pousr]_[A-Za-z0-9_]{20,}',rb'github_pat_[A-Za-z0-9_]{20,}',rb'Bearer\s+[A-Za-z0-9._\-]{24,}',rb'(?i)(?:token|secret|password|authorization)["\x27]?\s*[:=]\s*["\x27][A-Za-z0-9+/=_\-]{24,}["\x27]']
for p in out.rglob('*'):
 if not p.is_file() or p.suffix=='.png':continue
 body=gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes()
 assert not any(re.search(pattern,body) for pattern in patterns),str(p)
(out/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(out))+'\n' for p in sorted(out.rglob('*')) if p.is_file() and p.name!='SHA256SUMS'))
print(json.dumps({'files':sum(p.is_file() for p in out.rglob('*')),'bytes':sum(p.stat().st_size for p in out.rglob('*') if p.is_file()),'secretPatternScanPassed':True}))
