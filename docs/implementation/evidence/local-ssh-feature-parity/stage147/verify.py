from pathlib import Path
import json,shlex,re,hashlib
out=Path('/workspace/scratch/parity-147');root=Path('/workspace/superset-remix-parity');dist=root/'apps/desktop/dist';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
product=json.loads((out/'product-snapshot.json').read_text());fixtures=json.loads((out/'fixture-snapshot.json').read_text());cli=json.loads((out/'source-cli-snapshot.json').read_text());assert {str(p.relative_to(dist)):sha(p) for p in dist.rglob('*') if p.is_file()}==product['files']
for p,d in {**fixtures,**cli}.items():assert sha(root/p)==d,p
assert json.loads((out/'clipboard-product-snapshot.json').read_text())==product;assert json.loads((out/'clipboard-source-cli-snapshot.json').read_text())==cli
oldFixtures=json.loads((out/'clipboard-fixture-snapshot.json').read_text());changed=[p for p in fixtures if fixtures[p]!=oldFixtures.get(p)];assert sorted(changed)==sorted('apps/desktop/scripts/'+n for n in ['verify-workstation-clipboard-pane-area.mjs','verify-workstation-wheel-ui.mjs','verify-workspace-restore-ui.mjs'])
proof=[]
for case in ['local-clipboard-image-read','ssh-clipboard-image-read','local-wheel-right','ssh-wheel-right']:
 p=out/case/'app';cleanup=json.loads((out/case/'owned-cleanup.json').read_text());assert cleanup['appExit']==cleanup['ownedXorgExit']==0
 moves=json.loads((p/'clipboard-pane-area-ui.json').read_text());assert [m['action'] for m in moves]==['right','expand','center'];assert all(m['terminalBefore']==m['terminalAfter'] and m['terminalBefore']['pid'] for m in moves)
 row={'case':case,'paneActions':['right','expand','center'],'samePidExecutionAndCwd':True,'cleanup':cleanup}
 if 'clipboard' in case:
  core=json.loads((p/'workstation-clipboard-ui.json').read_text());tui=json.loads((p/'terminal-agent-clipboard-ui.json').read_text());actual=bytes.fromhex(''.join(tui['final']['received'])).decode();expected=''.join(x['expected'] for x in tui['phases'])+tui['imageInput']['bytes']+'oq';assert actual==expected
  paths=shlex.split(tui['imageInput']['bytes'][6:-6]);assert paths==[tui['imageRead']['path']];assert Path(paths[0]).parent==Path(core['remoteDirectory']);assert tui['imageRead']['pixels']==core['imagePixels'];assert tui['imageRead']['sha256']==core['imageEncodedSha256']
  assert all(core[k] for k in ['physicalNativePaste','osClipboard','remoteShellRead','duplicatePasteDidNotOverwrite','textExact','nativeFileUriPaste','fileExact']);assert tui['keyboardCopy'] and tui['menuCopy'] and tui['afterRemount'] and not tui['errors'];assert not tui['vendorAgentVerified']
  row.update(exactWholeAgentInput=True,noUnexpectedInput=True,liveRemoteTuiImageRead=tui['imageRead'],nativeClipboardImageAndFilePaste=True,duplicateDoesNotOverwrite=True,textExact=True,copyAndOsc52=True,realCenterRemount=True,vendorAgentVerified=False)
 else:
  result=json.loads((p/'wheel-acceptance.json').read_text());viewport=json.loads((p/'wheel-viewport-diagnostics.json').read_text());transitions=json.loads((p/'wheel-mode-transitions.json').read_text());stock=json.loads((p/'wheel-saved-stock-preference.json').read_text());review=json.loads((p/'wheel-review-clipboard.json').read_text());traces=json.loads((p/'wheel-input-traces.json').read_text())
  assert viewport['normalAfter']['top']<viewport['normalBefore']['top'] and viewport['normalDown']['top']>viewport['normalAfter']['top'];assert stock['before']['received']==stock['after']['received'];assert review['filesBefore']==review['filesAfter'];assert not traces[1]['state']['received'];assert traces[2]['before']['received']==traces[2]['after']['received'];assert not result['errors'];assert result['mouseUp']['offset']<result['mouseBefore']['offset'] and result['mouseAfter']['offset']>result['mouseUp']['offset'];assert [t['stage'] for t in transitions]==['legacy','pixels']
  for t in transitions:
   assert t['upward']['offset']<t['previous']['offset'] and t['current']['offset']>t['upward']['offset'];assert not re.search('\x1b(?:\\[|O)[AB]',t['bytes'])
  assert any(ord(c)>127 for c in transitions[0]['bytes']);coords=re.findall('\x1b\\[<(64|65);(\\d+);(\\d+)M',transitions[1]['bytes']);assert len(coords)==2 and all(int(x)>100 and int(y)>40 for _,x,y in coords)
  row.update(normalViewportScrollsBothWays=True,historyReviewDoesNotInjectInput=True,stockPreferenceDoesNotInjectInput=True,reviewClipboardDoesNotUpload=True,sgrLegacyAndPixelTransitions=True,legacyHighCoordinatesPreservedAsBytes=True,noCursorKeys=True,realCenterRemount=True)
 if case.startswith('ssh-'):
  restored=json.loads((p/'workspace-restore-ui.json').read_text());assert len(restored['samples'])==20;row['windowRestoreSamples']=20
 proof.append(row)
live=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try: env=(p/'environ').read_bytes().split(b'\0')
 except (OSError,PermissionError):continue
 if any(e.startswith(b'SUPERSET_WORKSPACE_ID=parity147-') or e.startswith(b'XDG_CONFIG_HOME=/workspace/scratch/parity-147/') for e in env):live.append(int(p.name))
assert not live and not Path('/tmp/.X11-unix/X175').exists()
report={'compiledSource':product['sourceCommit'],'compiledFiles':len(product['files']),'fixtureCount':len(fixtures),'sourceCliFiles':len(cli),'compiledAndSourceCliUnchanged':True,'clipboardToWheelFixtureChanges':changed,'native':proof,'scopedLiveProcesses':live,'x175Released':True,'finalRunsPassed':True,'vendorAgentVerified':False,'physicalMacVerified':False,'externalSshVerified':False,'actualFileManagerCopyVerified':False,'installer':False,'githubActions':False,'screenshotsActuallyViewed':['ssh-clipboard-image-read/app/clipboard-remote-image-path-before-enter.png','ssh-wheel-right/app/wheel-tui-after.png']};(out/'final-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['compiledFiles','fixtureCount','sourceCliFiles','compiledAndSourceCliUnchanged','finalRunsPassed']}))
