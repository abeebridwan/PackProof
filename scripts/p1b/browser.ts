import {chromium,expect as baseExpect} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
const expect=baseExpect.configure({timeout:180000});
const origin=process.env.P1B_TEST_ORIGIN??'http://127.0.0.1:4180';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const checks:Record<string,unknown>={mode:'desktop Chromium production Next app; mobile viewport emulation, not physical phone',origin,providerRequests:0};
try{
 const context=await browser.newContext({viewport:{width:1365,height:1024}});const page=await context.newPage();page.setDefaultTimeout(180000);
 await page.goto(origin+'/investigate');await expect(page.getByRole('heading',{name:/Understand the evidence/})).toBeVisible();await page.screenshot({path:'docs/packproof/evidence/p1b-ui-desktop.png',fullPage:true});
 const createdResponse=page.waitForResponse(r=>r.url().endsWith('/api/investigations')&&r.request().method()==='POST',{timeout:180000});await page.getByRole('button',{name:'Investigate evidence'}).click();const firstResponse=await createdResponse;expect(firstResponse.status(),JSON.stringify({status:firstResponse.status(),error:(await firstResponse.json()).error??null})).toBe(201);await expect(page.getByRole('heading',{name:'Record-supported',exact:true})).toBeVisible();checks.shopB='passed';
 await expect(page.getByText(/visible wrapper artwork changed/).first()).toBeVisible();
 await page.getByRole('button',{name:'Shop A · unauthorized seller'}).click();await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'Blocked',exact:true})).toBeVisible();await expect(page.getByText('Transfer blocked: seller is not authorized for this registered item.',{exact:true}).first()).toBeVisible();checks.shopA='passed';
 await page.getByRole('button',{name:'Shop B · matching records'}).click();await page.getByLabel('Packaging code optional').fill('');await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'One more detail'})).toBeVisible();await expect(page.getByRole('heading',{name:'Needs evidence',exact:true})).toBeVisible();checks.specificEvidenceRequest='passed';
 await page.getByLabel('Packaging code you can read').fill('PK-2002');await page.getByRole('button',{name:'Continue with this evidence'}).click();await expect(page.getByRole('heading',{name:'Record-supported',exact:true})).toBeVisible();checks.manualResume='passed';
 const id=await page.evaluate(()=>localStorage.getItem('packproof-last-investigation'));
 await page.reload();await expect(page.getByRole('heading',{name:'Record-supported',exact:true})).toBeVisible();checks.sameSessionReload='passed';
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/packproof/evidence/p1b-ui-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);checks.mobileNoHorizontalOverflow='passed';
 const foreign=await browser.newContext();const missing=await foreign.request.get(`${origin}/api/investigations/${id}`);expect(missing.status()).toBe(401);
 const args={namespace:'packproof-demo',productMark:'UNKNOWN-TEST',packagingMark:'PK-2002',sellerId:null,listingText:'',context:'listing',captureId:null};
 const created=await foreign.request.post(`${origin}/api/investigations`,{headers:{origin},data:args,timeout:180000});expect(created.status()).toBe(201);
 const denied=await foreign.request.get(`${origin}/api/investigations/${id}`);expect(denied.status()).toBe(404);checks.crossSessionApiDenial='passed';
 const csrf=await foreign.request.post(`${origin}/api/investigations`,{headers:{origin:'https://evil.example'},data:args});expect(csrf.status()).toBe(403);
 const malformed=await foreign.request.post(`${origin}/api/investigations`,{headers:{origin},data:{...args,verified:true}});expect(malformed.status()).toBe(400);checks.csrfAndStrictInputs='passed';
 const lookup=await foreign.request.get(`${origin}/api/products/lookup?namespace=packproof-demo&productMark=FP-1002&packagingMark=PK-2002`);expect(lookup.status()).toBe(200);expect((await lookup.json()).data.mappingStatus).toBe('matched');checks.publicLookup='passed';
 const forged=await foreign.request.post(`${origin}/api/captures`,{headers:{origin},multipart:{investigationId:id!,revision:'2',source:'imported',file:{name:'synthetic.png',mimeType:'image/png',buffer:await readFile('docs/packproof/evidence/sam/original-demo.png')}}});expect(forged.status()).toBe(404);checks.foreignCaptureApiDenial='passed';
 await foreign.close();await context.close();
 checks.status='passed';await writeFile('docs/packproof/evidence/p1b-browser.json',JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser.close();}
