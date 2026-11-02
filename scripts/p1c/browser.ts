import {chromium,expect as baseExpect,type BrowserContext} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {PublicInvestigation} from '../../src/contracts/investigation.js';
import {historicalFinding,EVIDENCE_MAX_AGE_MS} from '../../src/domain/verification/freshness.js';
const expect=baseExpect.configure({timeout:90000});
const origin=new URL(process.env.PACKPROOF_TEST_ORIGIN??'http://localhost:4181').origin;
const prefix=process.env.PACKPROOF_BROWSER_EVIDENCE_PREFIX??'docs/packproof/evidence/p1c';
const expectedRecorded=process.env.PACKPROOF_EXPECT_STALE==='1'?'Stale evidence':'Record-supported';
const bypass=process.env.PACKPROOF_TEST_BYPASS_FILE?(await readFile(process.env.PACKPROOF_TEST_BYPASS_FILE,'utf8')).trim():null;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu',...(process.env.PACKPROOF_TEST_TOOLS==='1'?['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']:[])]});
const checks:Record<string,unknown>={mode:'production UI + actual Supabase + recorded AI; not live acceptance',origin,providerRequests:0,actualPhone:false,expectedRecordedFinding:expectedRecorded};
async function checkTools(context:BrowserContext){
  const denied=await context.newPage();await denied.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Controlled permission denial','NotAllowedError');};});
  await denied.goto(`${origin}/tools`);await denied.locator('#camera').click();await expect(denied.locator('#feedback')).toContainText('Camera permission denied');await denied.locator('#manual').fill('000123');await denied.locator('#useManual').click();await expect(denied.locator('#manualResult')).toHaveText('Human supplied mark: 000123');await denied.close();
  const tools=await context.newPage();let toolErrors=0;tools.on('pageerror',()=>{toolErrors++;});await tools.goto(`${origin}/tools`);await expect(tools.getByRole('heading',{name:'Make sure your device is ready.'})).toBeVisible();
  await tools.locator('#camera').click();await tools.waitForFunction(()=>{const text=document.querySelector('#output')?.textContent;return text?.startsWith('{')&&JSON.parse(text).scan?.attempts>=5;});await tools.locator('#capture').click();await tools.locator('#stop').click();await expect(tools.locator('#captureStatus')).toContainText('pixels');await expect(tools.locator('#captureCanvas')).toBeVisible();
  const camera=JSON.parse((await tools.locator('#output').textContent())!);expect(camera.capture.width).toBeGreaterThan(0);expect(camera.error).toBeUndefined();expect(camera.scan.successes).toBe(0);
  await tools.locator('#crypto').click();await expect(tools.locator('#cryptoStatus')).toContainText('checks passed');const crypto=JSON.parse((await tools.locator('#output').textContent())!).crypto;
  const {PublicJwk}=await import('../../src/contracts/p0.js'),{verifyBytes}=await import('../../src/domain/verification/p0-crypto.js');
  const decoded=await verifyBytes(crypto.browserToken,[{kid:'p0-browser',jwk:PublicJwk.parse(crypto.browserPublicJwk),role:'device',namespace:'packproof-demo'}],'device','packproof-demo');expect(new TextDecoder().decode(decoded)).toBe(crypto.challenge);expect(crypto.privateKeyExtractable).toBe(false);
  const downloadWait=tools.waitForEvent('download');await tools.locator('#download').click();const download=await downloadWait,bytes=await readFile((await download.path())!);const fingerprint=JSON.parse((await tools.locator('#fingerprint').textContent())!);await tools.locator('#expected').fill(JSON.stringify(fingerprint));await tools.locator('#import').setInputFiles({name:'demo.json',mimeType:'application/json',buffer:bytes});await expect(tools.locator('#feedback')).toContainText('match the supplied export fingerprint');
  const changed={...JSON.parse(bytes.toString()),nonce:'b'.repeat(32)};await tools.locator('#import').setInputFiles({name:'altered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))});await expect(tools.locator('#feedback')).toContainText('File differs');
  await tools.locator('#animate').click();await expect(tools.locator('#qrStatus')).toContainText('measured',{timeout:20000});
  const metrics=JSON.parse((await tools.locator('#output').textContent())!);expect(metrics.animation.frameCount).toBeGreaterThan(0);expect(metrics.scan.successes).toBe(0);expect(toolErrors).toBe(0);expect(await tools.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await tools.screenshot({path:`${prefix}-tools-mobile.png`,fullPage:true});await tools.setViewportSize({width:1366,height:1000});await tools.screenshot({path:`${prefix}-tools-desktop.png`,fullPage:true});await tools.close();
  checks.deviceTools={status:'passed',sameOriginPath:'/tools',permissionDenialAndLeadingZeros:true,syntheticCaptureDimensions:true,nodeVerifiedBrowserSignature:true,nonextractableKey:true,downloadImportAndAlteredFileRejection:true,qrTargetFps:metrics.animation.targetFps,measuredDisplayFps:metrics.animation.actualFps,successfulQrReads:0,actualPhonesTested:0,serverlessCatalogPersistence:'not established; per warm instance only',noMobileOverflow:true,uncaughtErrors:toolErrors};
}
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 if(bypass)await context.route(`${origin}/**`,route=>route.continue({headers:{...route.request().headers(),'x-vercel-protection-bypass':bypass}}));
 if(process.env.PACKPROOF_TEST_TOOLS_ONLY==='1'){await checkTools(context);checks.status='passed';await context.close();await writeFile(`${prefix}-browser.json`,JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));}else{
 const page=await context.newPage();page.setDefaultTimeout(90000);let pageErrors=0;page.on('pageerror',()=>{pageErrors++;});
 await page.goto(origin);await expect(page.getByText('AI responses are replayed for this demo.',{exact:false})).toBeVisible();
 if(process.env.PACKPROOF_TEST_TOOLS==='1'){await page.screenshot({path:`${prefix}-home-mobile.png`,fullPage:true});await page.setViewportSize({width:1366,height:900});await page.screenshot({path:`${prefix}-home-desktop.png`,fullPage:true});await page.setViewportSize({width:390,height:844});}
 await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('button',{name:'Investigating…'})).toBeVisible();
 await expect(page.getByRole('heading',{name:expectedRecorded,exact:true})).toBeVisible();await expect(page.getByText(/visible wrapper artwork changed/).first()).toBeVisible();expect(await page.locator('.references code').count()).toBeGreaterThan(0);checks.inputsProgressSignedResultsAndNotice='passed';const supportedId=await page.evaluate(()=>localStorage.getItem('packproof-last-investigation'));
 await page.getByRole('button',{name:'Shop A · unauthorized seller'}).click();await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'Blocked',exact:true})).toBeVisible();await expect(page.getByText('Transfer blocked: seller is not authorized for this registered item.',{exact:true}).first()).toBeVisible();checks.shopARefusal='passed';
 await page.getByRole('button',{name:'Incomplete custody history'}).click();await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:process.env.PACKPROOF_EXPECT_STALE==='1'?'Stale evidence':'Needs evidence',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'A history gap remains'})).toBeVisible();checks.historyGap='passed';
 await page.getByRole('button',{name:'Shop B · matching records'}).click();await page.getByLabel('Packaging code optional').fill('');await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'One more detail'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'One more detail'})).toBeVisible();
 if(process.env.PACKPROOF_TEST_CAPTURE==='1'){
  const id=await page.evaluate(()=>localStorage.getItem('packproof-last-investigation')),cookie=(await context.cookies(origin)).find(c=>c.name==='packproof_session');
  const sharp=(await import('sharp')).default,bytes=await sharp({create:{width:8,height:8,channels:3,background:'#dddddd'}}).png().toBuffer();
  const form=new FormData();form.set('file',new File([new Uint8Array(bytes)],'synthetic.png',{type:'image/png'}));form.set('investigationId',id!);form.set('revision','1');form.set('source','imported');
  const response=await fetch(`${origin}/api/captures`,{method:'POST',headers:{origin,cookie:`packproof_session=${cookie!.value}`,...(bypass?{'x-vercel-protection-bypass':bypass}:{})},body:form,redirect:'error'});expect(response.status).toBe(201);
  const capture=await response.json();expect(capture.width).toBe(8);expect(capture.height).toBe(8);expect(capture.source).toBe('imported');
  const publicObject=await fetch(`https://hvbzxeuedookkwleyjmx.supabase.co/storage/v1/object/public/packproof-p0-private/${id}/${capture.id}/original.png`,{redirect:'error'});expect(publicObject.status).not.toBe(200);
  checks.deployedPrivateCapture={status:'passed',synthetic:true,width:8,height:8,publicReadStatus:publicObject.status,physicalPhone:false};
 }
 await page.getByLabel('Packaging code you can read').fill('PK-2002');await page.getByRole('button',{name:'Continue with this evidence'}).click();await expect(page.getByRole('heading',{name:expectedRecorded,exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:expectedRecorded,exact:true})).toBeVisible();checks.pauseResumeReload='passed';
 await page.getByRole('button',{name:'An item in front of me'}).click();await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'One more detail'})).toBeVisible();await expect(page.getByText('Physical item: Unresolved',{exact:true})).toBeVisible();
 await page.getByLabel('Product code, if corrected').fill('000042');await page.getByLabel('Packaging code you can read').fill('000043');await page.getByRole('button',{name:'Continue with this evidence'}).click();await expect(page.getByText('000042 · 000043 · Physical evidence requested',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Needs evidence',exact:true})).toBeVisible();await expect(page.getByText('Physical item: Unresolved',{exact:true})).toBeVisible();checks.leadingZerosAndNoPhysicalSuccess='passed';
 await page.route('**/api/investigations',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'temporarily_unavailable',message:'Controlled unavailable-service check.'})}));
 await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByText('Controlled unavailable-service check.',{exact:true})).toBeVisible();checks.controlledErrorState='passed';
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);checks.mobileNoOverflow='passed';
 const id=await page.evaluate(()=>localStorage.getItem('packproof-last-investigation'));expect(id).toMatch(/^[a-f0-9-]{36}$/);
 const cookie=(await context.cookies(origin)).find(c=>c.name==='packproof_session');expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');expect(cookie?.secure).toBe(origin.startsWith('https:'));
 const headers={...(bypass?{'x-vercel-protection-bypass':bypass}:{}),origin,'content-type':'application/json'};
 const get=await fetch(`${origin}/api/investigations/${id}`,{headers,redirect:'error'});expect(get.status).toBe(401);
 const foreign=await fetch(`${origin}/api/investigations/${id}`,{headers:{...headers,cookie:`packproof_session=${'a'.repeat(64)}`},redirect:'error'});expect(foreign.status).toBe(404);
 const cross=await fetch(`${origin}/api/investigations`,{method:'POST',headers:{...headers,origin:'https://untrusted.invalid',cookie:`packproof_session=${cookie!.value}`},body:'{}',redirect:'error'});expect(cross.status).toBe(403);
 const malformed=await fetch(`${origin}/api/investigations`,{method:'POST',headers:{...headers,cookie:`packproof_session=${cookie!.value}`},body:JSON.stringify({unexpected:true}),redirect:'error'});expect(malformed.status).toBe(400);
 checks.sessionCookiesOwnerIsolationSameOriginAndStrictBody='passed';
 const owned=await fetch(`${origin}/api/investigations/${supportedId}`,{headers:{...headers,cookie:`packproof_session=${cookie!.value}`},redirect:'error'});expect(owned.status).toBe(200);expect(owned.headers.get('cache-control')).toContain('no-store');
 const saved=PublicInvestigation.parse(await owned.json());
 if(!saved.finding)throw new Error('Saved finding required for historical UI check');
 const snapshot=saved.finding.history?.data?.snapshot?.asOf??saved.finding.asOf;
 const historical=historicalFinding(saved.finding,new Date(Date.parse(snapshot)+EVIDENCE_MAX_AGE_MS+1).toISOString());
 await page.route(`**/api/investigations/${supportedId}`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...saved,finding:historical})}));
 await page.evaluate(id=>localStorage.setItem('packproof-last-investigation',id!),supportedId);await page.reload();await expect(page.getByRole('heading',{name:'Stale evidence',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Historical seller record — refresh required',exact:true})).toBeVisible();
 checks.historicalFindingUi='passed controlled expired-assessment response; no clock or signed record changed';
 await page.screenshot({path:`${prefix}-ui.png`,fullPage:true});
 if(process.env.PACKPROOF_TEST_TOOLS==='1')await checkTools(context);
 expect(pageErrors).toBe(0);checks.uncaughtBrowserErrors=pageErrors;
 await context.close();checks.status='passed';await writeFile(`${prefix}-browser.json`,JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
 }
}catch(error){checks.status='failed';await writeFile(`${prefix}-browser.json`,JSON.stringify(checks,null,2)+'\n');throw error;}finally{await browser.close();}
